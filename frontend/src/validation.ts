/**
 * Client-side validation mirroring SRS rules FR-VAL-1 to FR-VAL-4.
 */

import { Category, Priority, type ReportInput } from './types';

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

const VALID_CATEGORIES = new Set<string>(Object.values(Category));
const VALID_PRIORITIES = new Set<string>(Object.values(Priority));

export function validateReport(input: Partial<ReportInput>): ValidationResult {
  const errors: Record<string, string> = {};

  // FR-VAL-1: Category mandatory
  if (!input.category || !String(input.category).trim()) {
    errors.category = 'Category is mandatory.';
  } else if (!VALID_CATEGORIES.has(input.category)) {
    errors.category = `Category must be one of: ${Object.values(Category).join(', ')}.`;
  }

  // FR-VAL-1: Priority mandatory
  if (!input.priority || !String(input.priority).trim()) {
    errors.priority = 'Priority is mandatory.';
  } else if (!VALID_PRIORITIES.has(input.priority)) {
    errors.priority = `Priority must be one of: ${Object.values(Priority).join(', ')}.`;
  }

  // FR-VAL-1 & FR-VAL-2: Description mandatory, 10 to 1000 characters
  const desc = input.description ? String(input.description).trim() : '';
  if (!input.description || desc.length === 0) {
    errors.description = 'Description is mandatory.';
  } else if (desc.length < 10) {
    errors.description = 'Description must be at least 10 characters long.';
  } else if (String(input.description).length > 1000) {
    errors.description = 'Description must not exceed 1,000 characters.';
  }

  // FR-VAL-1 & FR-VAL-2: Location text mandatory, max 200 characters
  const loc = input.location_text ? String(input.location_text).trim() : '';
  if (!input.location_text || loc.length === 0) {
    errors.location_text = 'Location is mandatory.';
  } else if (String(input.location_text).length > 200) {
    errors.location_text = 'Location must not exceed 200 characters.';
  }

  // FR-VAL-3: Latitude and longitude both-or-neither with valid ranges
  const hasLat = input.latitude !== undefined && input.latitude !== null && input.latitude !== ('' as any);
  const hasLon = input.longitude !== undefined && input.longitude !== null && input.longitude !== ('' as any);

  if (hasLat && !hasLon) {
    errors.longitude = 'Coordinates must be given as a pair: longitude is missing.';
  } else if (!hasLat && hasLon) {
    errors.latitude = 'Coordinates must be given as a pair: latitude is missing.';
  } else if (hasLat && hasLon) {
    const lat = Number(input.latitude);
    const lon = Number(input.longitude);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      errors.latitude = 'Latitude must be a number between -90 and 90 degrees.';
    }
    if (isNaN(lon) || lon < -180 || lon > 180) {
      errors.longitude = 'Longitude must be a number between -180 and 180 degrees.';
    }
  }

  // FR-VAL-4: Date/time reported cannot be in the future (5 min tolerance)
  if (!input.reported_at) {
    errors.reported_at = 'Date/time reported is mandatory.';
  } else {
    const parsed = new Date(input.reported_at).getTime();
    if (isNaN(parsed)) {
      errors.reported_at = 'Date/time reported must be a valid date.';
    } else {
      const fiveMinutesToleranceMs = 5 * 60 * 1000;
      if (parsed > Date.now() + fiveMinutesToleranceMs) {
        errors.reported_at = 'Date/time reported cannot be in the future.';
      }
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
