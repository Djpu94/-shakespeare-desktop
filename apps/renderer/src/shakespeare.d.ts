import type { ShakespeareApi } from "@shakespeare/shared";

declare global {
  interface Window {
    shakespeare: ShakespeareApi;
  }
}

export {};
