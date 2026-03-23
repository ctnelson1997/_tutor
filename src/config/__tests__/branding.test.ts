import { describe, it, expect } from 'vitest';
import { branding } from '../branding';

describe('branding config', () => {
  it('exports all required fields', () => {
    expect(branding).toHaveProperty('languageId');
    expect(branding).toHaveProperty('appName');
    expect(branding).toHaveProperty('brandPrefix');
    expect(branding).toHaveProperty('brandSuffix');
    expect(branding).toHaveProperty('tagline');
    expect(branding).toHaveProperty('brandColor');
    expect(branding).toHaveProperty('languageDisplayName');
    expect(branding).toHaveProperty('domain');
  });

  it('all fields are non-empty strings', () => {
    for (const [key, value] of Object.entries(branding)) {
      expect(typeof value, `${key} should be a string`).toBe('string');
      expect((value as string).length, `${key} should be non-empty`).toBeGreaterThan(0);
    }
  });

  it('brandColor is a valid hex color', () => {
    expect(branding.brandColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('domain looks like a hostname', () => {
    expect(branding.domain).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/);
  });

  it('appName equals brandPrefix + brandSuffix', () => {
    expect(branding.appName).toBe(branding.brandPrefix + branding.brandSuffix);
  });

  // In test mode, VITE_LANGUAGE is unset so defaults to 'js'
  it('defaults to JS branding when VITE_LANGUAGE is unset', () => {
    expect(branding.languageId).toBe('js');
    expect(branding.appName).toBe('JSTutor');
    expect(branding.brandPrefix).toBe('JS');
    expect(branding.brandSuffix).toBe('Tutor');
    expect(branding.brandColor).toBe('#DD030B');
    expect(branding.languageDisplayName).toBe('JavaScript');
    expect(branding.domain).toBe('jstutor.org');
  });
});
