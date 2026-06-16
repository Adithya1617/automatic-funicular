/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base origin for the Hyprride API. Empty / unset = same-origin
   * (dev: Vite proxies /api → API; prod: API served on the same host).
   */
  readonly VITE_API_URL?: string;
}
