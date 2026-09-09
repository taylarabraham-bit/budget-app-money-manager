/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional default sync server (see app/.env.example); Settings can override at runtime. */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
