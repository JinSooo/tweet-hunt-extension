// src/background/services/realtime.ts
// Open-source realtime service placeholder.

export const REALTIME_CONSTANTS = {} as const;
export const DEFAULT_USERNAMES: string[] = [];

export class RealtimeSubscriptionService {
  start(): void {}
  stop(): void {}
  debouncedPollerTick(): void {}
  isUsingSSE(): boolean {
    return false;
  }
  isPolling(): boolean {
    return false;
  }
}

export const realtimeService = new RealtimeSubscriptionService();
