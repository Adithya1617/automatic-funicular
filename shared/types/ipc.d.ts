import type { HyprrideBridge } from '../bridge';

declare global {
  interface Window {
    hyprride: HyprrideBridge;
  }
}

export {};
