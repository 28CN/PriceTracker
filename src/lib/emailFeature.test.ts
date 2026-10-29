// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMAIL_DISABLED_MESSAGE,
  accountUpdateNeedsEmail,
  flagOn,
  isEmailEnabled,
  isEmailUiEnabled
} from './emailFeature.ts';

test('flag is on only for the exact string "true"', () => {
  assert.equal(flagOn('true'), true);
  for (const v of [undefined, '', 'false', 'TRUE', 'True', '1', 'yes', ' true', 'true ']) {
    assert.equal(flagOn(v), false, String(v));
  }
});

test('server and UI flags read their own variables and default off', () => {
  assert.equal(isEmailEnabled(undefined), false);
  assert.equal(isEmailEnabled('true'), true);
  assert.equal(isEmailUiEnabled(undefined), false);
  assert.equal(isEmailUiEnabled('true'), true);
});

test('server flag reads EMAIL_ENABLED, not NEXT_PUBLIC_EMAIL_ENABLED', () => {
  const saved = { ...process.env };
  try {
    delete process.env.EMAIL_ENABLED;
    process.env.NEXT_PUBLIC_EMAIL_ENABLED = 'true';
    assert.equal(isEmailEnabled(), false);
    process.env.EMAIL_ENABLED = 'true';
    assert.equal(isEmailEnabled(), true);
  } finally {
    process.env = saved;
  }
});

test('disabled message is the agreed text', () => {
  assert.equal(EMAIL_DISABLED_MESSAGE, '邮件功能开发中，暂不可用');
});

const off = { target_price_email: false, popular_deals_email: false, personalised_recommendations_email: false };

test('unchanged contact email and prefs are allowed', () => {
  assert.equal(
    accountUpdateNeedsEmail({ contactEmail: 'A@x.com', prefs: off }, { contactEmail: 'a@x.com', prefs: off }),
    false
  );
});

test('setting or changing the contact email is blocked', () => {
  assert.equal(accountUpdateNeedsEmail({ contactEmail: null, prefs: off }, { contactEmail: 'a@x.com', prefs: off }), true);
  assert.equal(accountUpdateNeedsEmail({ contactEmail: 'a@x.com', prefs: off }, { contactEmail: 'b@x.com', prefs: off }), true);
});

test('clearing the contact email is allowed', () => {
  assert.equal(accountUpdateNeedsEmail({ contactEmail: 'a@x.com', prefs: off }, { contactEmail: null, prefs: off }), false);
});

test('turning any email preference on is blocked, turning off or keeping on is allowed', () => {
  for (const key of Object.keys(off) as (keyof typeof off)[]) {
    assert.equal(
      accountUpdateNeedsEmail({ contactEmail: null, prefs: off }, { contactEmail: null, prefs: { ...off, [key]: true } }),
      true,
      key
    );
  }
  const on = { ...off, target_price_email: true };
  assert.equal(accountUpdateNeedsEmail({ contactEmail: null, prefs: on }, { contactEmail: null, prefs: on }), false);
  assert.equal(accountUpdateNeedsEmail({ contactEmail: null, prefs: on }, { contactEmail: null, prefs: off }), false);
  assert.equal(accountUpdateNeedsEmail({ contactEmail: null, prefs: null }, { contactEmail: null, prefs: on }), true);
});
