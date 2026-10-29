// Run with: npm test (Vitest)
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { absoluteUrl, getSiteUrl } from './siteUrl.ts';

test('prefers NEXT_PUBLIC_SITE_URL and strips trailing slashes', () => {
  assert.equal(
    getSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://pricetracker-au.vercel.app//', VERCEL_URL: 'x.vercel.app' }),
    'https://pricetracker-au.vercel.app'
  );
});

test('falls back to legacy NEXT_PUBLIC_APP_URL', () => {
  assert.equal(getSiteUrl({ NEXT_PUBLIC_APP_URL: 'https://old.example/' }), 'https://old.example');
});

test('falls back to VERCEL_URL with https', () => {
  assert.equal(getSiteUrl({ VERCEL_URL: 'pr-1.vercel.app' }), 'https://pr-1.vercel.app');
});

test('falls back to localhost', () => {
  assert.equal(getSiteUrl({}), 'http://localhost:3000');
});

test('absoluteUrl joins paths', () => {
  const env = { NEXT_PUBLIC_SITE_URL: 'https://a.example/' };
  assert.equal(absoluteUrl('/verify-email?token=1', env), 'https://a.example/verify-email?token=1');
  assert.equal(absoluteUrl('unsubscribe', env), 'https://a.example/unsubscribe');
  assert.equal(absoluteUrl('', env), 'https://a.example');
});

test('production prefers VERCEL_PROJECT_PRODUCTION_URL over VERCEL_URL', () => {
  assert.equal(
    getSiteUrl({ VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'pricetracker-au.vercel.app', VERCEL_URL: 'x-123.vercel.app' }),
    'https://pricetracker-au.vercel.app',
  );
});

test('preview uses VERCEL_URL', () => {
  assert.equal(
    getSiteUrl({ VERCEL_ENV: 'preview', VERCEL_PROJECT_PRODUCTION_URL: 'pricetracker-au.vercel.app', VERCEL_URL: 'x-123.vercel.app' }),
    'https://x-123.vercel.app',
  );
});
