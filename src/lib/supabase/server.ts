import { createClient } from "@supabase/supabase-js";

// With an access token, the client acts as that user (RLS applies as in the browser).
export function createSupabaseServerClient(accessToken?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o la clave anon/publishable.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
  });
}
