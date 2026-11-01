import { describe, expect, it } from 'vitest';
import { calculateInclusiveDuration } from './requirement-form';

describe('calculateInclusiveDuration', () => {
  it('counts both start and end dates', () => {
    expect(calculateInclusiveDuration('2026-11-02', '2026-11-07')).toBe(6);
  });

  it('counts a single-day training as one day', () => {
    expect(calculateInclusiveDuration('2026-11-02', '2026-11-02')).toBe(1);
  });

  it('returns null when a date is missing or the range is reversed', () => {
    expect(calculateInclusiveDuration('', '2026-11-07')).toBeNull();
    expect(calculateInclusiveDuration('2026-11-07', '2026-11-02')).toBeNull();
  });
});
