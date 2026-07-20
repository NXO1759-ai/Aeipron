import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Contact server-action tests.
//
// The action delivers a contact message through two channels — an email to the
// store inbox (Resend HTTP API) and a `contact_message` metaobject write
// (Shopify Admin API) — and succeeds when at least one channel succeeds.
// These tests mock `@/lib/shopify/admin-client` and the global `fetch` (the
// Resend call) so nothing hits the network. They cover: the unconfigured-env
// guard, zod rejection, the honeypot + time-trap bot drops, dual-channel
// success, single-channel fallback, both-failed error mapping, and the email
// payload shape (inbox, reply-to, plain-text body, phone included/omitted).
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}));

// Mock the Admin API client so the action never hits the network.
vi.mock('@/lib/shopify/admin-client', () => ({
  adminRequest: vi.fn(),
  ShopifyAdminClientError: class ShopifyAdminClientError extends Error {
    constructor(message: string, public readonly status?: number) {
      super(message);
      this.name = 'ShopifyAdminClientError';
    }
  },
}));

const { submitContactMessage } = await import('@/app/contact/actions');
const { adminRequest, ShopifyAdminClientError } = await import('@/lib/shopify/admin-client');
const { CONTACT_METAOBJECT_CREATE_MUTATION } = await import('@/lib/shopify/admin-queries');

const mockAdminRequest = vi.mocked(adminRequest);
const mockFetch = vi.fn();

const VALID_INPUT = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  phone: '',
  message: 'Hello, I have a question about my order.',
};

const TOKEN = 'shpat_test_admin_token';
const RESEND_KEY = 're_test_key';

/** A successful metaobjectCreate response payload (empty userErrors). */
function createdResponse() {
  return {
    metaobjectCreate: {
      userErrors: [],
    },
  };
}

/** Parse the body of the most recent Resend fetch call. */
function sentEmail() {
  const calls = mockFetch.mock.calls;
  const [, init] = calls[calls.length - 1];
  return JSON.parse(init.body as string);
}

beforeEach(() => {
  vi.stubEnv('SHOPIFY_ADMIN_API_ACCESS_TOKEN', TOKEN);
  vi.stubEnv('CONTACT_METAOBJECT_TYPE', 'contact_message');
  vi.stubEnv('RESEND_API_KEY', RESEND_KEY);
  vi.stubEnv('CONTACT_EMAIL_TO', '');
  vi.stubEnv('CONTACT_EMAIL_FROM', '');
  mockAdminRequest.mockReset();
  mockFetch.mockReset();
  // Default: the Resend API accepts the email.
  mockFetch.mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('submitContactMessage — env guard', () => {
  it('returns the generic error when neither delivery channel is configured', async () => {
    vi.stubEnv('SHOPIFY_ADMIN_API_ACCESS_TOKEN', '');
    vi.stubEnv('RESEND_API_KEY', '');
    const result = await submitContactMessage(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('We could not send your message. Please try again shortly.');
    }
    expect(mockAdminRequest).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('submitContactMessage — invalid input', () => {
  it('rejects a payload missing required fields with the validation message', async () => {
    const result = await submitContactMessage({ ...VALID_INPUT, message: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Please check the highlighted fields and try again.');
    expect(mockAdminRequest).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects a malformed email without delivering', async () => {
    const result = await submitContactMessage({ ...VALID_INPUT, email: 'not-an-email' });
    expect(result.ok).toBe(false);
    expect(mockAdminRequest).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('submitContactMessage — honeypot + time-trap (bot defense)', () => {
  it('fakes success and never delivers when the honeypot field is filled', async () => {
    const result = await submitContactMessage({ ...VALID_INPUT, website: 'https://spam.example' });
    // The bot sees a success — no signal to adapt — but nothing is delivered.
    expect(result.ok).toBe(true);
    expect(mockAdminRequest).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fakes success and never delivers when the submission is implausibly fast', async () => {
    const result = await submitContactMessage({ ...VALID_INPUT, startedAt: Date.now() - 100 });
    expect(result.ok).toBe(true);
    expect(mockAdminRequest).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('processes the submission normally when the honeypot is empty and timing is human', async () => {
    mockAdminRequest.mockResolvedValueOnce(createdResponse());
    const result = await submitContactMessage({ ...VALID_INPUT, website: '', startedAt: Date.now() - 30_000 });
    expect(result.ok).toBe(true);
    expect(mockAdminRequest).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not reject when startedAt is absent (older clients still deliver)', async () => {
    mockAdminRequest.mockResolvedValueOnce(createdResponse());
    const result = await submitContactMessage(VALID_INPUT);
    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('submitContactMessage — email delivery', () => {
  it('emails the message to the store inbox with the customer as reply-to', async () => {
    mockAdminRequest.mockResolvedValueOnce(createdResponse());
    await submitContactMessage(VALID_INPUT);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer ${RESEND_KEY}`);
    const body = sentEmail();
    expect(body.to).toEqual(['hello@wearapeiron.com']);
    expect(body.reply_to).toBe('jane@example.com');
    expect(body.subject).toBe('New contact message from Jane Doe');
    // Plain text only — never HTML — so the message can't inject markup.
    expect(body.text).toContain('Hello, I have a question about my order.');
    expect(body.text).toContain('Email: jane@example.com');
    expect(body.html).toBeUndefined();
  });

  it('omits the phone line when phone is empty and includes it when provided', async () => {
    mockAdminRequest.mockResolvedValue(createdResponse());
    await submitContactMessage(VALID_INPUT);
    expect(sentEmail().text).not.toContain('Phone:');

    await submitContactMessage({ ...VALID_INPUT, phone: '+1 555 123 4567' });
    expect(sentEmail().text).toContain('Phone: +1 555 123 4567');
  });

  it('honors CONTACT_EMAIL_TO / CONTACT_EMAIL_FROM overrides', async () => {
    vi.stubEnv('CONTACT_EMAIL_TO', 'support@wearapeiron.com');
    vi.stubEnv('CONTACT_EMAIL_FROM', 'Apeiron <store@wearapeiron.com>');
    mockAdminRequest.mockResolvedValueOnce(createdResponse());
    await submitContactMessage(VALID_INPUT);
    const body = sentEmail();
    expect(body.to).toEqual(['support@wearapeiron.com']);
    expect(body.from).toBe('Apeiron <store@wearapeiron.com>');
  });
});

describe('submitContactMessage — metaobject write', () => {
  it('writes a contact_message metaobject with the mapped fields', async () => {
    mockAdminRequest.mockResolvedValueOnce(createdResponse());
    await submitContactMessage(VALID_INPUT);
    expect(mockAdminRequest).toHaveBeenCalledWith(
      CONTACT_METAOBJECT_CREATE_MUTATION,
      {
        metaobject: {
          type: 'contact_message',
          fields: [
            { key: 'name', value: 'Jane Doe' },
            { key: 'email', value: 'jane@example.com' },
            { key: 'body', value: 'Hello, I have a question about my order.' },
          ],
        },
      },
    );
  });

  it('uses CONTACT_METAOBJECT_TYPE env var as the metaobject type', async () => {
    vi.stubEnv('CONTACT_METAOBJECT_TYPE', 'custom_contact');
    mockAdminRequest.mockResolvedValueOnce(createdResponse());
    await submitContactMessage(VALID_INPUT);
    const [, vars] = mockAdminRequest.mock.calls[0];
    expect(vars.metaobject.type).toBe('custom_contact');
  });
});

describe('submitContactMessage — channel fallback + failure mapping (non-leaking)', () => {
  it('succeeds when the email succeeds even if the metaobject write fails', async () => {
    mockAdminRequest.mockRejectedValueOnce(new ShopifyAdminClientError('Shopify Admin API request failed', 401));
    const result = await submitContactMessage(VALID_INPUT);
    expect(result.ok).toBe(true);
  });

  it('succeeds when the metaobject write succeeds even if the email fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
    mockAdminRequest.mockResolvedValueOnce(createdResponse());
    const result = await submitContactMessage(VALID_INPUT);
    expect(result.ok).toBe(true);
  });

  it('returns the generic error when BOTH channels fail', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
    mockAdminRequest.mockResolvedValueOnce({
      metaobjectCreate: {
        userErrors: [{ field: ['metaobject', 'type'], message: 'No metaobject definition exists', code: 'UNDEFINED_OBJECT_TYPE' }],
      },
    });
    const result = await submitContactMessage(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Generic message — does NOT leak the Shopify error text or the status.
      expect(result.error).toBe('We could not send your message. Please try again shortly.');
      expect(result.error).not.toContain('No metaobject definition exists');
      expect(result.error).not.toContain('403');
    }
  });

  it('returns the generic error on an unexpected thrown error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('boom'));
    mockAdminRequest.mockRejectedValueOnce(new Error('boom'));
    const result = await submitContactMessage(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('We could not send your message. Please try again shortly.');
      expect(result.error).not.toContain('boom');
    }
  });
});
