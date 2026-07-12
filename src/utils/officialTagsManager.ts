// 官方标签管理器 - 获取和管理官方标签配置
import packageJson from '../../package.json';
import { fetchXHuntUserTags } from '~contents/services/api.ts';
import type { XHuntUserTagsPayload } from '~contents/services/api.ts';
import { localStorageInstance } from '~storage';

// 🆕 开发环境日志函数
const devLog = (level: 'log' | 'warn' | 'error', ...args: any[]) => {
  if (process.env.PLASMO_PUBLIC_ENV === 'dev') {
    console[level](...args);
  }
};

// 官方标签配置类型
export interface OfficialTagsConfig {
  [username: string]: string[];
}

function normalizeUsername(value?: string | null) {
  return String(value || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
}

function normalizeTwitterId(value?: string | null) {
  return String(value || '').trim();
}

function normalizeLang(lang?: string | null): 'zh' | 'en' {
  return lang === 'en' ? 'en' : 'zh';
}

class OfficialTagsManager {
  private tagsPayload: XHuntUserTagsPayload | null = null;
  private tagsByLang: Record<'zh' | 'en', OfficialTagsConfig> = {
    zh: {},
    en: {},
  };
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private currentLang: 'zh' | 'en' = 'zh';

  // 初始化标签管理器：新版标签由 /api/xhunt/tags 返回全量双语数据。
  // 后端已有 Redis + ETag/浏览器缓存，前端只保留本次页面生命周期内的内存数据。
  public async init(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.initInternal();
    return this.initPromise;
  }

  private async initInternal(): Promise<void> {
    try {
      devLog(
        'log',
        `🏷️ [v${packageJson.version}] OfficialTagsManager initializing...`,
      );

      await this.getCurrentLanguage();
      await this.fetchTags();

      devLog(
        'log',
        `🏷️ [v${packageJson.version}] OfficialTagsManager initialized with ${this.tagsPayload?.count || 0} users`,
      );
    } catch (error) {
      devLog(
        'error',
        `🏷️ [v${packageJson.version}] Failed to initialize OfficialTagsManager:`,
        error,
      );
    } finally {
      this.isInitialized = true;
      this.initPromise = null;
    }
  }

  // 获取当前语言设置
  private async getCurrentLanguage(): Promise<void> {
    try {
      const lang = await localStorageInstance.get('@settings/language1');
      this.currentLang = normalizeLang(lang as string | null);
      devLog(
        'log',
        `🏷️ [v${packageJson.version}] Current language set to: ${this.currentLang}`,
      );
    } catch (error) {
      this.currentLang = 'zh';
      devLog(
        'warn',
        `🏷️ [v${packageJson.version}] Failed to get current language, using default:`,
        error,
      );
    }
  }

  private async fetchTags(): Promise<void> {
    try {
      const payload = await fetchXHuntUserTags();

      if (!this.isValidTagsPayload(payload)) {
        throw new Error('Invalid remote official tags format');
      }

      this.applyTagsPayload(payload);
      devLog(
        'log',
        `🏷️ [v${packageJson.version}] Official tags updated: ${payload.count} users`,
      );
    } catch (error) {
      // 请求失败时保留空数据，不做前端二级缓存；后续页面刷新/重新初始化再走后端缓存。
      this.tagsPayload = null;
      this.tagsByLang = { zh: {}, en: {} };
      devLog(
        'warn',
        `🏷️ [v${packageJson.version}] Failed to fetch official tags:`,
        error,
      );
    }
  }

  private applyTagsPayload(payload: XHuntUserTagsPayload): void {
    this.tagsPayload = payload;
    this.tagsByLang = {
      zh: this.buildLanguageTags(payload, 'zh'),
      en: this.buildLanguageTags(payload, 'en'),
    };
  }

  private buildLanguageTags(
    payload: XHuntUserTagsPayload,
    lang: 'zh' | 'en',
  ): OfficialTagsConfig {
    const result: OfficialTagsConfig = {};
    const tagKey = lang === 'zh' ? 'tagsZh' : 'tagsEn';

    Object.entries(payload.byUsername || {}).forEach(([username, value]) => {
      const normalizedUsername = normalizeUsername(username);
      if (normalizedUsername && Array.isArray(value?.[tagKey])) {
        result[normalizedUsername] = [...value[tagKey]];
      }
    });

    return result;
  }

  // 获取指定用户的官方标签 - 支持语言参数，优先按 twitterId 匹配
  public getUserTags(
    username: string,
    lang?: 'zh' | 'en',
    twitterId?: string | null,
  ): string[] {
    if (!this.isInitialized) {
      return [];
    }

    const useLang = normalizeLang(lang || this.currentLang);
    const tagKey = useLang === 'zh' ? 'tagsZh' : 'tagsEn';
    const normalizedTwitterId = normalizeTwitterId(twitterId);

    if (
      normalizedTwitterId &&
      this.tagsPayload?.byTwitterId?.[normalizedTwitterId]?.[tagKey]
    ) {
      return [...this.tagsPayload.byTwitterId[normalizedTwitterId][tagKey]];
    }

    const normalizedUsername = normalizeUsername(username);
    const userByName = normalizedUsername
      ? this.tagsPayload?.byUsername?.[normalizedUsername]
      : null;
    if (userByName?.[tagKey]) {
      return [...userByName[tagKey]];
    }

    const tags = normalizedUsername
      ? this.tagsByLang[useLang][normalizedUsername]
      : null;
    return tags ? [...tags] : [];
  }

  // 更新当前语言。新版接口一次返回双语数据，不需要重新请求。
  public async updateLanguage(lang: 'zh' | 'en'): Promise<void> {
    const nextLang = normalizeLang(lang);
    if (nextLang === this.currentLang) return;

    this.currentLang = nextLang;
    devLog(
      'log',
      `🏷️ [v${packageJson.version}] Language updated to: ${nextLang}`,
    );
  }

  // 获取所有官方标签配置 - 支持语言参数
  public getAllTags(lang?: 'zh' | 'en'): OfficialTagsConfig {
    if (!this.isInitialized) {
      return {};
    }

    const useLang = normalizeLang(lang || this.currentLang);
    return { ...this.tagsByLang[useLang] };
  }

  // 检查用户是否有官方标签 - 支持语言参数
  public hasUserTags(
    username: string,
    lang?: 'zh' | 'en',
    twitterId?: string | null,
  ): boolean {
    return this.getUserTags(username, lang, twitterId).length > 0;
  }

  private isValidTagsPayload(payload: any): payload is XHuntUserTagsPayload {
    if (!payload || typeof payload !== 'object') return false;
    if (!payload.byUsername || typeof payload.byUsername !== 'object') {
      return false;
    }
    if (!payload.byTwitterId || typeof payload.byTwitterId !== 'object') {
      return false;
    }

    const checkTags = (value: any) =>
      value &&
      Array.isArray(value.tagsZh) &&
      Array.isArray(value.tagsEn) &&
      value.tagsZh.every((tag: any) => typeof tag === 'string') &&
      value.tagsEn.every((tag: any) => typeof tag === 'string');

    return (
      Object.values(payload.byUsername).every(checkTags) &&
      Object.values(payload.byTwitterId).every(checkTags)
    );
  }

  // 获取统计信息
  public async getStats() {
    await this.getCurrentLanguage(); // 确保语言是最新的

    const stats = {
      currentLanguage: this.currentLang,
      languages: {} as Record<string, any>,
      isInitialized: this.isInitialized,
      source: '/api/xhunt/tags',
      payload: this.tagsPayload
        ? {
            version: this.tagsPayload.version,
            count: this.tagsPayload.count,
          }
        : null,
      version: packageJson.version,
    };

    // 为每种语言添加统计信息
    for (const lang of ['zh', 'en'] as const) {
      const tags = this.tagsByLang[lang];
      const totalUsers = Object.keys(tags).length;
      const totalTags = Object.values(tags).reduce(
        (sum, userTags) => sum + userTags.length,
        0,
      );
      const avgTagsPerUser =
        totalUsers > 0 ? (totalTags / totalUsers).toFixed(2) : '0';

      stats.languages[lang] = {
        totalUsers,
        totalTags,
        avgTagsPerUser,
        sampleUsers: Object.keys(tags).slice(0, 3), // 显示前3个用户作为示例
      };
    }

    return stats;
  }

  // 清理方法
  public cleanup(): void {
    this.isInitialized = false;
    this.initPromise = null;
    devLog(
      'log',
      `🏷️ [v${packageJson.version}] OfficialTagsManager cleaned up`,
    );
  }
}

// 创建全局实例
// @ts-ignore
export const officialTagsManager = new OfficialTagsManager();

// @ts-ignore
export default OfficialTagsManager;
