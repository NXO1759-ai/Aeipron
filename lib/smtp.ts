import 'server-only';

import tls from 'node:tls';
import type { Duplex } from 'node:stream';

// ---------------------------------------------------------------------------
// Minimal SMTP submission client (RFC 5321) — just enough to deliver the
// contact-form email through a hosted mailbox (porkbun: smtp.porkbun.com:465).
//
// Why vendored: an external mailer package would desync package-lock.json,
// and the contact flow needs only one happy path — implicit-TLS connect,
// EHLO, AUTH PLAIN, one envelope, DATA, QUIT. The session core is split from
// the TLS connect so tests can drive it over a plain local socket.
//
// Security notes:
//   - Credentials come from env (SMTP_HOST/USER/PASS) and never leave the
//     server. AUTH PLAIN is only sent inside the TLS channel.
//   - Header injection is impossible: every interpolated header value is
//     CRLF-stripped, and the subject is RFC 2047 base64-encoded.
//   - Any 4xx/5xx reply aborts with SmtpError; the caller maps it to a
//     generic failure (no detail crosses to the client).
// ---------------------------------------------------------------------------

const CRLF = '\r\n';
const DEFAULT_TIMEOUT_MS = 10_000;

export class SmtpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmtpError';
  }
}

export interface SmtpCredentials {
  host: string;
  port: number;
  user: string;
  pass: string;
  timeoutMs?: number;
}

export interface SmtpMessage {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
}

/** Line reader over the socket: resolves queued waiters FIFO with complete CRLF lines. */
function createLineReader(socket: Duplex) {
  let buffer = '';
  type Waiter = { resolve: (line: string) => void; reject: (err: Error) => void };
  const waiters: Waiter[] = [];
  socket.on('data', (chunk: Buffer | string) => {
    buffer += chunk.toString();
    let idx = buffer.indexOf(CRLF);
    while (idx >= 0 && waiters.length > 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      waiters.shift()?.resolve(line);
      idx = buffer.indexOf(CRLF);
    }
    // Keep any partial trailing line buffered for the next waiter.
    if (waiters.length === 0) return;
  });
  const failAll = (err: Error) => {
    while (waiters.length > 0) waiters.shift()?.reject(err);
  };
  socket.once('error', failAll);
  socket.once('close', () => failAll(new SmtpError('connection closed mid-session')));
  return {
    nextLine(): Promise<string> {
      return new Promise((resolve, reject) => {
        // Flush a line already buffered before registering the waiter.
        const idx = buffer.indexOf(CRLF);
        if (idx >= 0) {
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          resolve(line);
          return;
        }
        waiters.push({ resolve, reject });
      });
    },
  };
}

/** Read a (possibly multiline) reply and return its 3-digit code. */
async function readCode(nextLine: () => Promise<string>): Promise<number> {
  for (;;) {
    const line = await nextLine();
    const match = /^(\d{3})([ -])/.exec(line);
    if (!match) throw new SmtpError(`malformed reply line: ${line.slice(0, 60)}`);
    if (match[2] === ' ') return Number(match[1]);
  }
}

function expectCode(actual: number, wanted: number[], stage: string): void {
  if (!wanted.includes(actual)) {
    throw new SmtpError(`SMTP ${stage} rejected with reply code ${actual}`);
  }
}

/** Strip CR/LF so a value can never break out into its own header line. */
function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

/** RFC 2047 base64 word — safe for any subject text (names with accents, etc.). */
function encodeSubject(subject: string): string {
  return `=?UTF-8?B?${Buffer.from(headerSafe(subject), 'utf8').toString('base64')}?=`;
}

/** Dot-stuff + CRLF-normalize the DATA block per RFC 5321 §4.5.2. */
function buildData(message: SmtpMessage): string {
  const headers = [
    `From: ${headerSafe(message.from)}`,
    `To: ${headerSafe(message.to)}`,
    `Reply-To: ${headerSafe(message.replyTo)}`,
    `Subject: ${encodeSubject(message.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
  ];
  const body = message.text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join(CRLF);
  return `${headers.join(CRLF)}${CRLF}${CRLF}${body}`;
}

/**
 * Run one SMTP submission over an already-connected socket (TLS or, in tests,
 * plain). Sequence: greeting → EHLO → AUTH PLAIN → MAIL FROM → RCPT TO →
 * DATA → message → QUIT. Throws SmtpError on any negative reply; the socket
 * is always destroyed by the caller's `finally`.
 */
export async function runSmtpSession(
  socket: Duplex,
  credentials: SmtpCredentials,
  message: SmtpMessage,
): Promise<void> {
  const { nextLine } = createLineReader(socket);
  const write = (line: string) => socket.write(line + CRLF);
  const ehloName = credentials.user.split('@')[1] || credentials.host;

  expectCode(await readCode(nextLine), [220], 'greeting');
  write(`EHLO ${ehloName}`);
  expectCode(await readCode(nextLine), [250], 'EHLO');
  write(`AUTH PLAIN ${Buffer.from(`\0${credentials.user}\0${credentials.pass}`).toString('base64')}`);
  expectCode(await readCode(nextLine), [235], 'AUTH');
  write(`MAIL FROM:<${headerSafe(message.from)}>`);
  expectCode(await readCode(nextLine), [250], 'MAIL FROM');
  write(`RCPT TO:<${headerSafe(message.to)}>`);
  expectCode(await readCode(nextLine), [250, 251], 'RCPT TO');
  write('DATA');
  expectCode(await readCode(nextLine), [354], 'DATA');
  socket.write(`${buildData(message)}${CRLF}.${CRLF}`);
  expectCode(await readCode(nextLine), [250], 'message body');
  write('QUIT');
  // The 221 reply is optional — delivery already succeeded at this point.
}

/**
 * Connect over implicit TLS (port 465) and deliver one message. Rejects with
 * SmtpError on timeout so a stalled server can't hang the server action.
 */
export async function sendSmtpMail(credentials: SmtpCredentials, message: SmtpMessage): Promise<void> {
  const timeoutMs = credentials.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const socket = tls.connect({
    host: credentials.host,
    port: credentials.port,
    servername: credentials.host,
    rejectUnauthorized: true,
  });
  socket.setTimeout(timeoutMs, () => {
    socket.destroy(new SmtpError(`SMTP connection to ${credentials.host} timed out`));
  });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('secureConnect', () => resolve());
      socket.once('error', reject);
    });
    await runSmtpSession(socket, credentials, message);
  } finally {
    socket.destroy();
  }
}
