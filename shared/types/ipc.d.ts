import type { HyprrideBridge } from '../../preload/index';

declare global {
  interface Window {
    hyprride: HyprrideBridge;
  }
}

export {};
