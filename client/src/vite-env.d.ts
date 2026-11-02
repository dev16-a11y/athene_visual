/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_DEV_API_TARGET?: string;
  readonly VITE_WEBGPU?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
