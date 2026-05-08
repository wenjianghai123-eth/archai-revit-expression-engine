import 'dotenv/config';
import { createSupabaseAuthUser, findSupabaseAuthUserByEmail } from '../server/supabaseAdmin';
import { adjustCredits, createUserProfile, ensureAppDatabase, getUserProfileByEmail } from '../server/storage';

async function main(): Promise<void> {
  const email = readRequiredEnv('ADMIN_EMAIL').trim().toLowerCase();
  const password = readRequiredEnv('ADMIN_PASSWORD');
  const name = process.env.ADMIN_NAME?.trim() || 'ArchAI Admin';

  process.env.AUTH_MODE = 'supabase';

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
    type: 'grant',
    amount: Number(process.env.ADMIN_INITIAL_CREDITS || process.env.DEFAULT_INITIAL_CREDITS || 1000),
    reason: 'seed_admin',
    referenceType: 'system',
    referenceId: `seed_admin_${profile.id}`,
  });

  console.log('Admin seed completed. Password was not printed.');
}

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
