import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Contact server-action tests.
//
// The action writes a contact_message metaobject to Shopify via the Admin API.
// These tests mock `@/lib/shopify/admin-client` (so no network) and drive the
// action's decision logic: env-missing guard, valid submission → adminRequest
// called with the right payload + returns ok, userErrors → generic non-leaking
// error, network/throw → generic error, invalid zod → validation error, and the
// phone field is omitted when empty / included when present.
//
// Mirrors tests/checkout-actions.test.ts (mock 'server-only', mock the Shopify
// client, stub env, dynamic-import the action).
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

const VALID_INPUT = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  phone: '',
  message: 'Hello, I have a question about my order.',
};

const TOKEN = 'shpat_test_admin_token';

beforeEach(() => {
  vi.stubEnv('SHOPIFY_ADMIN_API_ACCESS_TOKEN', TOKEN);
  vi.stubEnv('CONTACT_METAOBJECT_TYPE', 'contact_message');
  mockAdminRequest.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** A successful metaobjectCreate response payload (empty userErrors). */
function createdResponse() {
  return {
    metaobjectCreate: {
      userErrors: [],
    },
  };
}

describe('submitContactMessage — env guard', () => {
  it('returns the generic error and never calls the Admin API when the token is missing', async () => {
    vi.stubEnv('SHOPIFY_ADMIN_API_ACCESS_TOKEN', '');
    const result = await submitContactMessage(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('We could not send your message. Please try again shortly.');
    }
    expect(mockAdminRequest).not.toHaveBeenCalled();
  });
});

describe('submitContactMessage — invalid input', () => {
  it('rejects a payload missing required fields with the validation message', async () => {
    const result = await submitContactMessage({ ...VALID_INPUT, message: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Please check the highlighted fields and try again.');
    expect(mockAdminRequest).not.toHaveBeenCalled();
  });

  it('rejects a malformed email without calling the Admin API', async () => {
    const result = await submitContactMessage({ ...VALID_INPUT, email: 'not-an-email' });
    expect(result.ok).toBe(false);
    expect(mockAdminRequest).not.toHaveBeenCalled();
  });
});

describe('submitContactMessage — valid submission', () => {
  it('calls metaobjectCreate and returns ok when the metaobject is created', async () => {
    mockAdminRequest.mockResolvedValueOnce(createdResponse());
    const result = await submitContactMessage(VALID_INPUT);
    expect(result.ok).toBe(true);
    expect(mockAdminRequest).toHaveBeenCalledTimes(1);
    // Called with the documented mutation string.
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

  it('omits the phone field when phone is empty', async () => {
    mockAdminRequest.mockResolvedValueOnce(createdResponse());
    await submitContactMessage({ ...VALID_INPUT, phone: '' });
    const [, vars] = mockAdminRequest.mock.calls[0];
    expect(vars.metaobject.fields.map((f: { key: string }) => f.key)).toEqual([
      'name',
      'email',
      'body',
    ]);
  });

  it('includes the phone field when phone is provided', async () => {
    mockAdminRequest.mockResolvedValueOnce(createdResponse());
    await submitContactMessage({ ...VALID_INPUT, phone: '+1 555 123 4567' });
    const [, vars] = mockAdminRequest.mock.calls[0];
    expect(vars.metaobject.fields).toContainEqual({ key: 'phone', value: '+1 555 123 4567' });
  });

  it('uses CONTACT_METAOBJECT_TYPE env var as the metaobject type', async () => {
    vi.stubEnv('CONTACT_METAOBJECT_TYPE', 'custom_contact');
    mockAdminRequest.mockResolvedValueOnce(createdResponse());
    await submitContactMessage(VALID_INPUT);
    const [, vars] = mockAdminRequest.mock.calls[0];
    expect(vars.metaobject.type).toBe('custom_contact');
  });

  it('falls back to the default type when CONTACT_METAOBJECT_TYPE is unset', async () => {
    vi.stubEnv('CONTACT_METAOBJECT_TYPE', '');
    mockAdminRequest.mockResolvedValueOnce(createdResponse());
    await submitContactMessage(VALID_INPUT);
    const [, vars] = mockAdminRequest.mock.calls[0];
    expect(vars.metaobject.type).toBe('contact_message');
  });
});

describe('submitContactMessage — failure mapping (non-leaking)', () => {
  it('returns the generic error when metaobjectCreate returns userErrors', async () => {
    mockAdminRequest.mockResolvedValueOnce({
      metaobjectCreate: {
        userErrors: [{ field: ['metaobject', 'type'], message: 'No metaobject definition exists', code: 'UNDEFINED_OBJECT_TYPE' }],
      },
    });
    const result = await submitContactMessage(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Generic message — does NOT leak the Shopify error text.
      expect(result.error).toBe('We could not send your message. Please try again shortly.');
      expect(result.error).not.toContain('No metaobject definition exists');
    }
  });

  it('returns the generic error when the Admin API client throws', async () => {
    mockAdminRequest.mockRejectedValueOnce(new ShopifyAdminClientError('Shopify Admin API request failed', 401));
    const result = await submitContactMessage(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('We could not send your message. Please try again shortly.');
      // Generic message — does NOT leak the status code or the Admin error text.
      expect(result.error).not.toContain('401');
      expect(result.error).not.toContain('Admin API');
    }
  });

  it('returns the generic error on an unexpected thrown error', async () => {
    mockAdminRequest.mockRejectedValueOnce(new Error('boom'));
    const result = await submitContactMessage(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('We could not send your message. Please try again shortly.');
      expect(result.error).not.toContain('boom');
    }
  });
});