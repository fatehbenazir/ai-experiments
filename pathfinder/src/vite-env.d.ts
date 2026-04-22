/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GCS_MODELS_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
