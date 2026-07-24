import { describe, it, expect } from 'vitest';
import generatedOtp from '../utils/generatedOtp.js';

describe('generatedOtp', () => {
  it('should generate a 6-digit number', () => {
    const otp = generatedOtp();
    expect(otp).toBeGreaterThanOrEqual(100000);
    expect(otp).toBeLessThanOrEqual(999999);
  });

  it('should generate different numbers on subsequent calls', () => {
    const otp1 = generatedOtp();
    const otp2 = generatedOtp();
    expect(otp1).not.toBe(otp2);
  });
});
