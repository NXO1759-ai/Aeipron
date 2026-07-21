import { describe, it, expect, afterEach, vi } from 'vitest';
import net from 'node:net';

vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------------------
// Vendored SMTP client (lib/smtp) — protocol tests against a fake SMTP server
// on a local plain socket (the session core is transport-agnostic; TLS only
// wraps the connect). Contracts under test:
//   - exact command sequence: EHLO → AUTH PLAIN → MAIL FROM → RCPT TO →
//     DATA → body → QUIT, each gated on the right reply code
//   - any 4xx/5xx at any stage rejects with SmtpError naming the stage
//   - the DATA block is well-formed: CRLF, dot-stuffing, RFC 2047 subject,
//     and NO way to inject extra headers via interpolated values
// ---------------------------------------------------------------------------

const { runSmtpSession, SmtpError } = await import('@/lib/smtp');

const CREDS = { host: 'smtp.porkbun.com', port: 465, user: 'hello@wearapeiron.com', pass: 'secret-pw' };
const MESSAGE = {
  from: 'hello@wearapeiron.com',
  to: 'hello@wearapeiron.com',
  replyTo: 'jane@example.com',
  subject: 'New contact message from Jane Doe',
  text: 'Name: Jane Doe\nEmail: jane@example.com\n\nHello there.\n.line starting with a dot',
};

interface FakeServer {
  port: number;
  received: string[];
  close: () => Promise<void>;
}

/** Start a scripted fake SMTP server. Unmatched commands get a generic 250. */
function fakeSmtpServer(replies: Record<string, string> = {}): Promise<FakeServer> {
  const received: string[] = [];
  const conns = new Set<net.Socket>();
  const server = net.createServer((conn) => {
    conns.add(conn);
    conn.on('close', () => conns.delete(conn));
    conn.write('220 fake.test ESMTP ready\r\n');
    let buffer = '';
    let inData = false;
    conn.on('data', (chunk) => {
      buffer += chunk.toString();
      let idx = buffer.indexOf('\r\n');
      while (idx >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        received.push(line);
        if (inData) {
          if (line === '.') {
            inData = false;
            conn.write('250 2.0.0 queued\r\n');
          }
        } else if (line === 'DATA') {
          inData = true;
          conn.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else {
          const verb = line.split(' ')[0].toUpperCase();
          // AUTH defaults to success (235) — a bare 250 here means "accepted"
          // in SMTP terms but the client correctly demands the 235 signal.
          if (verb === 'AUTH') conn.write(`${replies.AUTH ?? '235 2.7.0 authentication successful'}\r\n`);
          else if (verb === 'QUIT') conn.write('221 2.0.0 Bye\r\n');
          else conn.write(`${replies[verb] ?? '250 2.1.0 OK'}\r\n`);
        }
        idx = buffer.indexOf('\r\n');
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      resolve({
        port,
        received,
        // Destroy lingering connections first so close() never waits on a
        // socket a failed assertion forgot to clean up.
        close: () =>
          new Promise<void>((done) => {
            for (const conn of conns) conn.destroy();
            server.close(() => done());
          }),
      });
    });
  });
}

function connect(port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => resolve(socket));
    socket.once('error', reject);
  });
}

let server: FakeServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
});

describe('runSmtpSession — happy path', () => {
  it('runs the full submission sequence and resolves', async () => {
    server = await fakeSmtpServer();
    const socket = await connect(server.port);
    await expect(runSmtpSession(socket, CREDS, MESSAGE)).resolves.toBeUndefined();
    // QUIT is fire-and-forget client-side; wait until the server has seen it
    // before tearing the socket down (destroy() discards unflushed writes).
    await vi.waitFor(() => {
      expect(server?.received).toContain('QUIT');
    });
    socket.destroy();

    const verbs = server.received
      .filter((l) => /^(EHLO|AUTH|MAIL|RCPT|DATA|QUIT)\b/.test(l))
      .map((l) => l.split(' ')[0]);
    expect(verbs).toEqual(['EHLO', 'AUTH', 'MAIL', 'RCPT', 'DATA', 'QUIT']);
  });

  it('sends AUTH PLAIN with the base64-encoded credentials', async () => {
    server = await fakeSmtpServer();
    const socket = await connect(server.port);
    await runSmtpSession(socket, CREDS, MESSAGE);
    socket.destroy();

    const authLine = server.received.find((l) => l.startsWith('AUTH PLAIN ')) as string;
    const decoded = Buffer.from(authLine.slice('AUTH PLAIN '.length), 'base64').toString('utf8');
    expect(decoded).toBe('\0hello@wearapeiron.com\0secret-pw');
  });

  it('builds a well-formed DATA block (headers, dot-stuffing, CRLF body)', async () => {
    server = await fakeSmtpServer();
    const socket = await connect(server.port);
    await runSmtpSession(socket, CREDS, MESSAGE);
    socket.destroy();

    expect(server.received).toContain('From: hello@wearapeiron.com');
    expect(server.received).toContain('To: hello@wearapeiron.com');
    expect(server.received).toContain('Reply-To: jane@example.com');
    expect(server.received.some((l) => l.startsWith('Subject: =?UTF-8?B?'))).toBe(true);
    expect(server.received).toContain('MIME-Version: 1.0');
    expect(server.received).toContain('Hello there.');
    // Dot-stuffed per RFC 5321 §4.5.2.
    expect(server.received).toContain('..line starting with a dot');
  });
});

describe('runSmtpSession — failure mapping', () => {
  it('rejects on AUTH failure (535)', async () => {
    server = await fakeSmtpServer({ AUTH: '535 5.7.8 authentication failed' });
    const socket = await connect(server.port);
    await expect(runSmtpSession(socket, CREDS, MESSAGE)).rejects.toThrow(SmtpError);
    await expect(runSmtpSession(await connect(server.port), CREDS, MESSAGE)).rejects.toThrow(/AUTH/);
  });

  it('rejects on RCPT refusal (550)', async () => {
    server = await fakeSmtpServer({ RCPT: '550 5.1.1 no such user' });
    const socket = await connect(server.port);
    await expect(runSmtpSession(socket, CREDS, MESSAGE)).rejects.toThrow(/RCPT TO/);
    socket.destroy();
  });

  it('rejects when the server closes mid-session', async () => {
    const closeServer = net.createServer((conn) => {
      conn.write('220 fake.test ESMTP ready\r\n');
      conn.on('data', () => conn.destroy());
    });
    await new Promise<void>((r) => closeServer.listen(0, '127.0.0.1', r));
    const { port } = closeServer.address() as net.AddressInfo;
    const socket = await connect(port);
    await expect(runSmtpSession(socket, CREDS, MESSAGE)).rejects.toThrow();
    await new Promise<void>((r) => closeServer.close(() => r()));
  });
});

describe('runSmtpSession — header injection defense', () => {
  it('CRLF-strips interpolated header values', async () => {
    server = await fakeSmtpServer();
    const socket = await connect(server.port);
    await runSmtpSession(socket, CREDS, {
      ...MESSAGE,
      replyTo: 'evil@example.com\r\nBcc: victim@example.com',
    });
    socket.destroy();

    const replyToLines = server.received.filter((l) => l.startsWith('Reply-To:'));
    expect(replyToLines).toHaveLength(1);
    expect(server.received.some((l) => l.startsWith('Bcc:'))).toBe(false);
    expect(replyToLines[0]).toContain('evil@example.com');
  });
});
