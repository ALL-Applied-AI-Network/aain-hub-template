/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" only in the canonical template repo's own Pages build, which is
   *  the public demo site. Forks never set it — see main.ts. */
  readonly VITE_DEMO_SITE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
