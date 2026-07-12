// src/utils/nacosCacheManager.ts
// Open-source remote-config cache placeholder.

export type NacosCacheEntry<T = any> = any;
export type NacosCacheConfig = any;

class NacosCacheManager {
  init(): void {}
  cleanup(): void {}
  async fetchWithCache<T = any>(_dataId: string, _ttl?: number): Promise<T | undefined> {
    return undefined;
  }
  clearCache(): void {}
  getStats(): Record<string, any> {
    return {};
  }
}

export const nacosCacheManager = new NacosCacheManager();
export default NacosCacheManager;
