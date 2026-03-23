/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LANGUAGE: string;
  readonly VITE_APP_NAME: string;
  readonly VITE_BRAND_PREFIX: string;
  readonly VITE_BRAND_SUFFIX: string;
  readonly VITE_TAGLINE: string;
  readonly VITE_BRAND_COLOR: string;
  readonly VITE_LANG_DISPLAY: string;
  readonly VITE_DOMAIN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
