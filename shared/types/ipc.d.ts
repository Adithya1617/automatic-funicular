import type { LauransBridge } from '../../preload/index';

declare global {
  interface Window {
    laurans: LauransBridge;
  }
}

export {};
