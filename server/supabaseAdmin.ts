import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

let client: SupabaseClient | null = null;
let passwordAuthClient: SupabaseClient | null = null;

export interface AdminAuthUserInput {
  email: string;
  password: string;
  name: string;
}

export interface AdminPasswordResetInput {
  userId: string;
  password: string;
}

export interface AdminAuthUser {
  id: string;
  email: string;
  createdAt: string;
}

export interface PasswordAuthUser {
  id: string;
  email: string;
}

export function getSupabaseAdminClient(): SupabaseClient {
  if (client) return client;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Supabase admin operations.');
  }

  client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return client;
}

export function getSupabasePasswordAuthClient(): SupabaseClient {
  if (passwordAuthClient) return passwordAuthClient;

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required for password login.');
  }

  passwordAuthClient = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return passwordAuthClient;
}

export async function authenticateSupabasePassword(email: string, password: string): Promise<PasswordAuthUser> {
  const supabase = getSupabasePasswordAuthClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error || !data.user) {
    throw new Error('账号或密码错误');
  }

  return {
    id: data.user.id,
    email: data.user.email || email.trim().toLowerCase(),
  };
}

export async function createSupabaseAuthUser(input: AdminAuthUserInput): Promise<AdminAuthUser> {
  if (process.env.AUTH_MODE !== 'supabase') {
    return {
      id: `user_${randomUUID()}`,
      email: input.email.trim().toLowerCase(),
      createdAt: new Date().toISOString(),
    };
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name },
  });

  if (error) {
    throw new Error(formatSupabaseAuthError(error.message));
  }

  if (!data.user) {
    throw new Error('Supabase did not return the created user.');
  }

  return mapAuthUser(data.user);
}

export async function findSupabaseAuthUserByEmail(email: string): Promise<AdminAuthUser | null> {
  if (process.env.AUTH_MODE !== 'supabase') {
    return null;
  }

  const supabase = getSupabaseAdminClient();
  const normalizedEmail = email.trim().toLowerCase();
  let page = 1;

  while (page < 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) {
      throw new Error(formatSupabaseAuthError(error.message));
    }

    const users = data.users as User[];
    const user = users.find(item => item.email?.toLowerCase() === normalizedEmail);
    if (user) return mapAuthUser(user);
    if (users.length < 100) return null;
    page += 1;
  }

  return null;
}


export async function resetSupabaseAuthUserPassword(input: AdminPasswordResetInput): Promise<void> {
  if (process.env.AUTH_MODE !== 'supabase') {
    return;
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.auth.admin.updateUserById(input.userId, {
    password: input.password,
  });

  if (error) {
    throw new Error(formatSupabaseAuthError(error.message));
  }
}

export async function updateSupabaseAuthUserMetadata(input: { userId: string; email?: string; name?: string }): Promise<void> {
  if (process.env.AUTH_MODE !== 'supabase') {
    return;
  }

  const patch: { email?: string; user_metadata?: Record<string, unknown> } = {};
  if (input.email) patch.email = input.email.trim().toLowerCase();
  if (input.name) patch.user_metadata = { name: input.name };

  if (Object.keys(patch).length === 0) return;

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.auth.admin.updateUserById(input.userId, patch);
  if (error) {
    throw new Error(formatSupabaseAuthError(error.message));
  }
}

function mapAuthUser(user: User): AdminAuthUser {
  return {
    id: user.id,
    email: user.email || '',
    createdAt: user.created_at,
  };
}

function formatSupabaseAuthError(message: string): string {
  if (/already|registered|exists|duplicate/i.test(message)) {
    return 'Email already exists.';
  }
  return message;
}
