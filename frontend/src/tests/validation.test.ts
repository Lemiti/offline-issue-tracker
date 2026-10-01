import { describe, expect, it } from 'vitest';
import { Category, Priority, type ReportInput } from '../types';
import { validateReport } from '../validation';

function getValidInput(): ReportInput {
  return {
    category: Category.WATER_POINT,
    description: 'Borehole pump handle snapped off at base.',
    location_text: 'Central village square well',
    latitude: 1.234,
    longitude: 34.567,
    priority: Priority.HIGH,
    reported_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  };
}

describe('Client-Side Report Validation (FR-VAL-1 to FR-VAL-4)', () => {
  it('passes on valid complete input', () => {
    const input = getValidInput();
    const res = validateReport(input);
    expect(res.isValid).toBe(true);
    expect(res.errors).toEqual({});
  });

  describe('FR-VAL-1: Mandatory fields', () => {
    it('rejects missing category', () => {
      const input = getValidInput();
      delete (input as any).category;
      const res = validateReport(input);
      expect(res.isValid).toBe(false);
      expect(res.errors.category).toBeDefined();
    });

    it('rejects invalid category', () => {
      const input = { ...getValidInput(), category: 'Invalid Category' };
      const res = validateReport(input);
      expect(res.isValid).toBe(false);
      expect(res.errors.category).toBeDefined();
    });

    it('rejects missing priority', () => {
      const input = getValidInput();
      delete (input as any).priority;
      const res = validateReport(input);
      expect(res.isValid).toBe(false);
      expect(res.errors.priority).toBeDefined();
    });

    it('rejects missing description', () => {
      const input = { ...getValidInput(), description: '' };
      const res = validateReport(input);
      expect(res.isValid).toBe(false);
      expect(res.errors.description).toBeDefined();
    });

    it('rejects missing location', () => {
      const input = { ...getValidInput(), location_text: '' };
      const res = validateReport(input);
      expect(res.isValid).toBe(false);
      expect(res.errors.location_text).toBeDefined();
    });
  });

  describe('FR-VAL-2: Length constraints', () => {
    it('rejects description shorter than 10 characters', () => {
      const input = { ...getValidInput(), description: '123456789' };
      const res = validateReport(input);
      expect(res.isValid).toBe(false);
      expect(res.errors.description).toContain('10 characters');
    });

    it('accepts description exactly 10 characters', () => {
      const input = { ...getValidInput(), description: '1234567890' };
      const res = validateReport(input);
      expect(res.errors.description).toBeUndefined();
    });

    it('rejects description longer than 1000 characters', () => {
      const input = { ...getValidInput(), description: 'x'.repeat(1001) };
      const res = validateReport(input);
      expect(res.isValid).toBe(false);
      expect(res.errors.description).toContain('1,000');
    });

    it('rejects location longer than 200 characters', () => {
      const input = { ...getValidInput(), location_text: 'L'.repeat(201) };
      const res = validateReport(input);
      expect(res.isValid).toBe(false);
      expect(res.errors.location_text).toContain('200');
    });
  });

  describe('FR-VAL-3: Coordinate boundaries and pair rule', () => {
    it('accepts both latitude and longitude as undefined or null', () => {
      const input = { ...getValidInput(), latitude: null, longitude: null };
      const res = validateReport(input);
      expect(res.errors.latitude).toBeUndefined();
      expect(res.errors.longitude).toBeUndefined();
    });

    it('rejects latitude without longitude', () => {
      const input = { ...getValidInput(), latitude: 12.34, longitude: null };
      const res = validateReport(input);
      expect(res.isValid).toBe(false);
      expect(res.errors.longitude).toBeDefined();
    });

    it('rejects longitude without latitude', () => {
      const input = { ...getValidInput(), latitude: null, longitude: 56.78 };
      const res = validateReport(input);
      expect(res.isValid).toBe(false);
      expect(res.errors.latitude).toBeDefined();
    });

    it('rejects latitude out of range (-90 to 90)', () => {
      const res1 = validateReport({ ...getValidInput(), latitude: -90.1, longitude: 0 });
      expect(res1.isValid).toBe(false);
      expect(res1.errors.latitude).toBeDefined();

      const res2 = validateReport({ ...getValidInput(), latitude: 90.1, longitude: 0 });
      expect(res2.isValid).toBe(false);
      expect(res2.errors.latitude).toBeDefined();
    });

    it('rejects longitude out of range (-180 to 180)', () => {
      const res1 = validateReport({ ...getValidInput(), latitude: 0, longitude: -180.1 });
      expect(res1.isValid).toBe(false);
      expect(res1.errors.longitude).toBeDefined();

      const res2 = validateReport({ ...getValidInput(), latitude: 0, longitude: 180.1 });
      expect(res2.isValid).toBe(false);
      expect(res2.errors.longitude).toBeDefined();
    });
  });

  describe('FR-VAL-4: Date/time not in the future', () => {
    it('accepts timestamp in the past', () => {
      const past = new Date(Date.now() - 3600 * 1000).toISOString();
      const res = validateReport({ ...getValidInput(), reported_at: past });
      expect(res.errors.reported_at).toBeUndefined();
    });

    it('accepts timestamp within 5-minute clock tolerance', () => {
      const nearFuture = new Date(Date.now() + 2 * 60 * 1000).toISOString();
      const res = validateReport({ ...getValidInput(), reported_at: nearFuture });
      expect(res.errors.reported_at).toBeUndefined();
    });

    it('rejects timestamp far in the future (> 5 minutes)', () => {
      const farFuture = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const res = validateReport({ ...getValidInput(), reported_at: farFuture });
      expect(res.isValid).toBe(false);
      expect(res.errors.reported_at).toBeDefined();
    });
  });
});
