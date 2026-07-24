import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import generatedAccessToken from '../utils/generatedAccessToken.js';

describe('generatedAccessToken', () => {
  beforeEach(() => {
    process.env.SECRET_KEY_ACCESS_TOKEN = 'test-secret';
  });

  afterEach(() => {
    delete process.env.SECRET_KEY_ACCESS_TOKEN;
  });

  it('should generate a valid JWT token for a given user id', async () => {
    const userId = 'user123';
    const token = await generatedAccessToken(userId);
    
    // Verify the token
    const decoded = jwt.verify(token, 'test-secret');
    expect(decoded.id).toBe(userId);
    expect(decoded.exp).toBeDefined();
  });
});
