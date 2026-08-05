import { createClient } from '@supabase/supabase-js';

// Server-only client using the service_role key — bypasses RLS. Never import
// this from client components; it must only be used inside API routes / cron
// jobs (SUPABASE_SERVICE_ROLE_KEY is not prefixed with NEXT_PUBLIC_, so it's
// never bundled to the browser, but keep it out of client code regardless).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdminConfigured = Boolean(url && serviceKey);

export const supabaseAdmin = supabaseAdminConfigured
  ? createClient(url as string, serviceKey as string, { auth: { persistSession: false } })
  : null;
