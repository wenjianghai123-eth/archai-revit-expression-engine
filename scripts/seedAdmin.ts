import 'dotenv/config';

async function main(): Promise<void> {
  const email = readRequiredEnv('ADMIN_EMAIL').trim().toLowerCase();
  const password = readRequiredEnv('ADMIN_PASSWORD');
  const name = process.env.ADMIN_NAME?.trim() || 'ArchAI Admin';
  const initialCredits = readPositiveIntegerEnv('ADMIN_INITIAL_CREDITS', process.env.DEFAULT_INITIAL_CREDITS || '1000');

  process.env.AUTH_MODE = 'supabase';
  if (!process.env.DATA_BACKEND) {
    process.env.DATA_BACKEND = 'supabase';
  }
  if (process.env.DATA_BACKEND !== 'supabase') {
    throw new Error('seed:admin requires DATA_BACKEND=supabase so the admin profile is created in Supabase.');
  }

  const [{ createSupabaseAuthUser, findSupabaseAuthUserByEmail }, {
    adjustCredits,
    createUserProfile,
    ensureAppDatabase,
    getUserProfileByEmail,
  }] = await Promise.all([
    import('../server/supabaseAdmin'),
    import('../server/storage'),
  ]);

  await ensureAppDatabase();

  let profile = await getUserProfileByEmail(email);
  if (!profile) {
    const authUser = await findSupabaseAuthUserByEmail(email)
      ?? await createSupabaseAuthUser({ email, password, name });
    profile = await createUserProfile({
      id: authUser.id,
      email,
      name,
      role: 'admin',
      status: 'active',
    });
    console.log(`Created admin profile for ${email}.`);
  } else {
    profile = await createUserProfile({
      id: profile.id,
      email,
      name,
      role: 'admin',
      status: 'active',
    });
    console.log(`Updated existing admin profile for ${email}.`);
  }

  await adjustCredits({
    userId: profile.id,
    type: 'admin_grant',
    amount: initialCredits,
    reason: 'seed_admin',
    referenceType: 'system',
    referenceId: `seed_admin_${profile.id}`,
  });

  console.log(`Admin seed completed for ${email}. Password was not printed. Credit grant is idempotent.`);
}

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function readPositiveIntegerEnv(name: string, fallback: string): number {
  const value = process.env[name] || fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
