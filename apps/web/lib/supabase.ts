import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv } from "./env";

let browserClient: SupabaseClient | null = null;

export function createBrowserSupabaseClient() {
  const { anonKey, url } = getSupabasePublicEnv();

  if (typeof window === "undefined") {
    return createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  if (browserClient) {
    return browserClient;
  }

  browserClient = createClient(url, anonKey, {
    auth: {
      storageKey: "cmr-web-auth",
      autoRefreshToken: true,
      persistSession: true
    }
  });

  return browserClient;
}
