import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Same fallback email as the client-side gate in CalendarApp.tsx, kept in
// sync with the `handle_new_user()` DB trigger's admin bootstrap.
const ADMIN_FALLBACK_EMAIL = 'dalmac948@gmail.com';

function isDidilabsEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith('@didi-labs.com') || email.toLowerCase() === ADMIN_FALLBACK_EMAIL;
}

// These content-data routes (calendar-events, holidays, rain) run server-side
// with the plain anon-key client, which carries no browser session -- RLS's
// auth.uid() would resolve to null and the (correctly) restricted policies
// would return nothing for everyone, including legitimately signed-in
// @didi-labs.com users. So the route itself verifies the caller's bearer
// token against Supabase Auth, then -- once verified -- reads data with the
// service-role client (bypassing RLS, since authorization was just done by
// hand here).
//
// Returns the verified email if the caller is an authorized viewer, or null
// if the request should be treated as unauthenticated/unauthorized.
export async function getAuthorizedDidilabsEmail(req: NextRequest): Promise<string | null> {
  if (!supabaseAdmin) return null;
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;

  return isDidilabsEmail(data.user.email) ? (data.user.email as string) : null;
}
