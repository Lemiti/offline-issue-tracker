import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError, api } from '../api';
import { Category, Priority, Role, Status } from '../types';

describe('HTTP API Client (api.ts)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('distinguishes network errors from HTTP errors', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(api.checkHealth('http://fake-api')).rejects.toThrow(NetworkError);
  });

  it('surfaces status, error code and field errors on HTTP 422', async () => {
    const errorPayload = {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed for one or more fields.',
      fields: {
        description: 'Description must be between 10 and 1,000 characters.',
        location_text: 'Location is mandatory.',
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: async () => errorPayload,
    } as Response);

    try {
      await api.putReport(
        'rep-1',
        {
          category: Category.WATER_POINT,
          description: 'Short',
          location_text: '',
          priority: Priority.HIGH,
          reported_at: new Date().toISOString(),
        },
        'http://fake-api'
      );
      expect.fail('Expected putReport to throw ApiError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(422);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.fields.description).toBeDefined();
      expect(err.fields.location_text).toBeDefined();
    }
  });

  it('surfaces 409 ID_CONTENT_MISMATCH', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: async () => ({
        code: 'ID_CONTENT_MISMATCH',
        message: 'Report with this ID already exists with different content.',
        fields: {},
      }),
    } as Response);

    await expect(
      api.putReport(
        'rep-1',
        {
          category: Category.WATER_POINT,
          description: 'Valid description here',
          location_text: 'Valid location',
          priority: Priority.HIGH,
          reported_at: new Date().toISOString(),
        },
        'http://fake-api'
      )
    ).rejects.toMatchObject({
      status: 409,
      code: 'ID_CONTENT_MISMATCH',
    });
  });

  it('passes X-Role header on transition request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'rep-1', status: Status.ASSIGNED }),
    } as Response);
    globalThis.fetch = fetchMock;

    const res = await api.transitionReport(
      'rep-1',
      { to: Status.ASSIGNED, expected_status: Status.SUBMITTED },
      Role.COORDINATOR,
      'http://fake-api'
    );

    expect(res.status).toBe(Status.ASSIGNED);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://fake-api/reports/rep-1/transition',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Role': Role.COORDINATOR,
        }),
      })
    );
  });
});
