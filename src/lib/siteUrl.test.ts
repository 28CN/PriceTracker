// Run with: npm test  (Node >= 22.18 strips TypeScript natively)
import { test } from 'node:test';
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
