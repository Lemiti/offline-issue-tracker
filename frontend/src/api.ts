/**
 * Typed HTTP client for the central server endpoints.
 * Implements endpoints from docs/DESIGN.md section 5.
 * Distinguishes network errors from HTTP API errors and surfaces error codes & field errors.
 */

import type { Category, Priority, Report, ReportEvent, Role, Status } from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export class NetworkError extends Error {
  constructor(message = 'Network error or server unreachable') {
    super(message);
    this.name = 'NetworkError';
  }
}

export interface PutReportPayload {
  id?: string;
  category: Category | string;
  description: string;
  location_text: string;
  latitude?: number | null;
  longitude?: number | null;
  priority: Priority | string;
  status?: Status | string;
  reporter_name?: string | null;
  reported_at: string;
  client_events?: Array<{
    id: string;
    type: string;
    actor_role: string;
    occurred_at: string;
    details?: Record<string, any> | null;
  }>;
}

export interface TransitionPayload {
  to: Status | string;
  reason?: string | null;
  expected_status: Status | string;
}

export interface ReportFilterParams {
  status?: Status | string;
  priority?: Priority | string;
  category?: Category | string;
  ids?: string[] | string;
}

export interface ReportDetail extends Report {
  events: ReportEvent[];
}

export function getApiBaseUrl(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) {
    return String(import.meta.env.VITE_API_URL).replace(/\/+$/, '');
  }
  return 'http://localhost:8000';
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  baseUrl = getApiBaseUrl()
): Promise<T> {
  const url = `${baseUrl}${path}`;
  let response: Response;

  try {
    response = await fetch(url, options);
  } catch (err: any) {
    // Network failure, DNS error, offline, timeout, or CORS error
    throw new NetworkError(err?.message || 'Network request failed');
  }

  if (!response.ok) {
    let code = `HTTP_${response.status}`;
    let message = response.statusText || 'Request failed';
    let fields: Record<string, string> = {};

    try {
      const data = await response.json();
      if (data && typeof data === 'object') {
        if (data.code) code = String(data.code);
        if (data.message) message = String(data.message);
        if (data.fields && typeof data.fields === 'object') {
          fields = data.fields;
        }
      }
    } catch {
      // If response body is not JSON, use default statusText message
    }

    throw new ApiError(response.status, code, message, fields);
  }

  return response.json() as Promise<T>;
}

export const api = {
  /**
   * Check central server connectivity.
   */
  async checkHealth(baseUrl?: string): Promise<{ status: string }> {
    return request<{ status: string }>('/health', { method: 'GET' }, baseUrl);
  },

  /**
   * PUT /reports/{id}: Idempotent delivery of a report with undelivered client events.
   */
  async putReport(
    id: string,
    payload: PutReportPayload,
    baseUrl?: string
  ): Promise<Report> {
    return request<Report>(
      `/reports/${id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      baseUrl
    );
  },

  /**
   * GET /reports: List reports with optional filters.
   */
  async getReports(params?: ReportFilterParams, baseUrl?: string): Promise<Report[]> {
    const searchParams = new URLSearchParams();
    if (params) {
      if (params.status) searchParams.set('status', params.status);
      if (params.priority) searchParams.set('priority', params.priority);
      if (params.category) searchParams.set('category', params.category);
      if (params.ids) {
        const idStr = Array.isArray(params.ids) ? params.ids.join(',') : params.ids;
        if (idStr) searchParams.set('ids', idStr);
      }
    }
    const query = searchParams.toString();
    const path = `/reports${query ? `?${query}` : ''}`;
    return request<Report[]>(path, { method: 'GET' }, baseUrl);
  },

  /**
   * GET /reports/{id}: Retrieve report with ordered history events.
   */
  async getReport(id: string, baseUrl?: string): Promise<ReportDetail> {
    return request<ReportDetail>(`/reports/${id}`, { method: 'GET' }, baseUrl);
  },

  /**
   * POST /reports/{id}/transition: Transition workflow status with role simulation header.
   */
  async transitionReport(
    id: string,
    payload: TransitionPayload,
    role: Role | string,
    baseUrl?: string
  ): Promise<Report> {
    return request<Report>(
      `/reports/${id}/transition`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Role': role,
        },
        body: JSON.stringify(payload),
      },
      baseUrl
    );
  },
};
