import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function temporaryPassword() {
  return `${randomBytes(18).toString('base64url')}-change-me`;
}

const url = process.env.SUPABASE_URL || required('NEXT_PUBLIC_SUPABASE_URL');
const secret = required('SUPABASE_SERVICE_ROLE_KEY');
const adminRecoveryEmail = required('BOOTSTRAP_ADMIN_EMAIL').trim().toLowerCase();
const bootstrapTokenHash = createHash('sha256')
  .update(required('BOOTSTRAP_ACCOUNT_TOKEN'))
  .digest('hex');
const supabase = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function ensureAccount({ username, role, contactEmail, isPublic }) {
  const expectedAuthEmail = `${username}@users.invalid`;
  let { data: existing, error: lookupError } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('username', username)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (!existing) {
    const { data: interruptedAccount, error: interruptedError } = await supabase
      .from('account_private')
      .select('user_id')
      .eq('auth_email', expectedAuthEmail)
      .maybeSingle();
    if (interruptedError) throw interruptedError;
    if (interruptedAccount) {
      existing = { id: interruptedAccount.user_id, username: '' };
    }
  }

  let userId = existing?.id;
  let password = null;
  let created = false;
  let recovering = false;
  if (existing) {
    const { data: authRecord, error: authError } =
      await supabase.auth.admin.getUserById(existing.id);
    if (authError || !authRecord.user) {
      throw authError || new Error(`Could not verify ${username}`);
    }
    if (authRecord.user.app_metadata?.bootstrap_token_hash !== bootstrapTokenHash) {
      throw new Error(
        `${username} already exists but was not created by this bootstrap token. Refusing to trust or elevate it.`
      );
    }
    const { data: privateAccount, error: accountError } = await supabase
      .from('account_private')
      .select('auth_email')
      .eq('user_id', existing.id)
      .single();
    if (accountError) throw accountError;
    if (privateAccount.auth_email !== expectedAuthEmail) {
      throw new Error(
        `${username} already belongs to an unexpected auth identity. Resolve it manually.`
      );
    }
    recovering = authRecord.user.app_metadata?.bootstrap_completed !== true;
    if (recovering) {
      password = temporaryPassword();
      const { error: recoveryError } = await supabase.auth.admin.updateUserById(
        existing.id,
        { password }
      );
      if (recoveryError) throw recoveryError;
    }
    console.log(`${username}: already exists (${existing.id}); repairing account state.`);
  } else {
    password = temporaryPassword();
    const { data, error } = await supabase.auth.admin.createUser({
      email: expectedAuthEmail,
      password,
      email_confirm: true,
      user_metadata: {
        username: role === 'admin' ? null : username,
        contact_email: contactEmail || null
      },
      app_metadata: {
        bootstrap_token_hash: bootstrapTokenHash,
        bootstrap_completed: false
      }
    });
    if (error || !data.user) throw error || new Error(`Could not create ${username}`);
    userId = data.user.id;
    created = true;
  }

  if (!userId) throw new Error(`Could not resolve ${username}`);
  const updates = [
    supabase
      .from('profiles')
      .update({
        username,
        watchlist_visibility: isPublic ? 'public' : 'private'
      })
      .eq('id', userId)
  ];
  if (created || recovering) {
    updates.push(
      supabase
        .from('user_security')
        .update({ must_change_password: true })
        .eq('user_id', userId)
    );
  }
  if (contactEmail) {
    updates.push(
      supabase
        .from('account_private')
        .update({ contact_email: contactEmail })
        .eq('user_id', userId)
    );
  }
  if (role === 'admin') {
    updates.push(
      supabase.from('user_roles').upsert({ user_id: userId, role: 'admin' })
    );
  }
  const results = await Promise.all(updates);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;

  if (created || recovering) {
    console.log('');
    console.log(created ? `${username} created.` : `${username} bootstrap recovered.`);
    console.log(`Temporary password: ${password}`);
    console.log('Save it now. It is not written to a file and must be changed at first sign-in.');
  } else {
    console.log(`${username}: roles, visibility and account state verified.`);
  }
  if (created || recovering) {
    const { error: completedError } = await supabase.auth.admin.updateUserById(userId, {
      app_metadata: {
        bootstrap_token_hash: bootstrapTokenHash,
        bootstrap_completed: true
      }
    });
    if (completedError) throw completedError;
  }
  return { id: userId, created };
}

console.log('Bootstrapping PriceTracker accounts...');
const admin = await ensureAccount({
  username: 'admin',
  role: 'admin',
  contactEmail: adminRecoveryEmail,
  isPublic: false
});
const melody = await ensureAccount({
  username: 'melody2251',
  role: 'user',
  contactEmail: null,
  isPublic: true
});

const { data: migrationResult, error: migrationError } = await supabase.rpc(
  'claim_legacy_data',
  { target_username: 'melody2251' }
);
if (migrationError) throw migrationError;

console.log('');
console.log('Legacy watchlist migration:', migrationResult);
console.log(`Admin user id: ${admin.id}`);
console.log(`melody2251 user id: ${melody.id}`);
console.log('Bootstrap complete.');
