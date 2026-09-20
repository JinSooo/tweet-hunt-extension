import { createElement, useEffect, useRef, useCallback } from 'react';
import { useDebounceFn } from 'ahooks';
import { subscribeToMutation } from './useGlobalMutationObserver';
import { useLocalStorage } from '~storage/useLocalStorage';
import { cleanerRuleManager } from '~contents/utils/cleaner/ruleManager';
import {
  applyAction,
  restoreArticle,
} from '~contents/utils/cleaner/domRenderer';
import {
  recordInterceptedAccount,
  removeInterceptedAccount,
  updateInterceptedBlockStatus,
} from '~contents/utils/cleaner/interceptedManager';
import { consumePendingBlockIntent } from '~contents/utils/cleaner/profileBlockLauncher';
import useCurrentUrl from './useCurrentUrl';
import { extractUsernameFromUrl } from '~contents/utils';
import { useI18n } from './i18n';
import { RankCacheManager } from '~utils/rankCacheManager';
import type { RankCacheNamespace } from '~utils/rankCacheManager';
import { rankService } from '~utils/rankService';
import type { CleanerMode } from '~contents/utils/cleaner/types';
const TWEET_SELECTOR = 'article[data-testid="tweet"], article[role="article"], article';

// 从推文节点中提取作者 handle（统一供检测与身份校验使用）
const extractTweetHandle = (article: HTMLElement): string => {
  const userNameEl = article.querySelector(
    "div[data-testid='User-Name'], div[data-testid='UserName']"
  );
  const handleMatch = userNameEl?.textContent?.match(/@([a-zA-Z0-9_]+)/);
  return handleMatch ? handleMatch[1].toLowerCase() : '';
};

export function TweetCleaner() {
  const [enabled] = useLocalStorage<boolean>('@settings/cleaner-enabled', false);

  // 页面加载后若存在“去屏蔽”跳转标记，自动唤起 X 官方屏蔽确认弹窗
  useEffect(() => {
    consumePendingBlockIntent();
  }, []);

  return enabled ? createElement(EnabledTweetCleaner, { enabled }) : null;
}

function EnabledTweetCleaner({ enabled }: { enabled: boolean }) {
  const currentUrl = useCurrentUrl();
  const [mode] = useLocalStorage<CleanerMode>(
    '@settings/cleaner-mode',
    'collapse'
  );
  const [whitelist] = useLocalStorage<string[]>(
    '@xhunt/cleaner-whitelist',
    []
  );
  const [customKeywords] = useLocalStorage<string[]>(
    '@xhunt/cleaner-custom-keywords',
    []
  );
  const [currentUsername] = useLocalStorage<string>(
    '@xhunt/current-username',
    ''
  );
  const { t } = useI18n();

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const effectiveMode: CleanerMode =
    mode === 'hide' || mode === 'mark' ? mode : 'collapse';
  const modeRef = useRef(effectiveMode);
  modeRef.current = effectiveMode;

  const whitelistRef = useRef(whitelist);
  whitelistRef.current = whitelist;

  const customKeywordsRef = useRef(customKeywords);
  customKeywordsRef.current = customKeywords;

  const currentUsernameRef = useRef(currentUsername);
  currentUsernameRef.current = currentUsername;

  useEffect(() => {
    cleanerRuleManager.init();
    void RankCacheManager.preload();

    return () => {
      const handled = document.querySelectorAll<HTMLElement>(
        "article[data-xhunt-cleaner-handled='true']"
      );
      handled.forEach((article) => restoreArticle(article));
    };
  }, []);

  const getWarnLabel = useCallback(
    (category?: string) => {
      if (category === 'custom') {
        return t('cleanerTagCustom');
      }
      if (category === 'gray') {
        return t('cleanerTagGray');
      }
      return t('cleanerTagAdult');
    },
    [t]
  );

  // 检查是否免除拦截
  const isExempt = useCallback(
    (article: HTMLElement, handle: string): boolean => {
      if (!handle) return false;
      const lowerHandle = handle.toLowerCase().replace(/^@/, '');

      // 1. 自己 (Self)
      const selfUsername = (currentUsernameRef.current || '')
        .toLowerCase()
        .replace(/^@/, '');
      if (selfUsername && lowerHandle === selfUsername) {
        return true;
      }

      // 2. 关注列表 (Following)
      const unfollowBtn = article.querySelector(
        '[data-testid$="-unfollow"], [data-testid="unfollow"]'
      );
      if (unfollowBtn) return true;

      const followBtn = article.querySelector('[data-testid$="-follow"]');
      if (followBtn) {
        const text = (followBtn.textContent || '').toLowerCase();
        const aria = (followBtn.getAttribute('aria-label') || '').toLowerCase();
        const followingKeywords = [
          'following',
          'siguiendo',
          'フォロー中',
          '正在关注',
        ];
        if (
          followingKeywords.some((k) => text.includes(k) || aria.includes(k))
        ) {
          return true;
        }
      }

      // 3. 用户本地白名单
      const localWhitelist = whitelistRef.current || [];
      if (
        localWhitelist.some(
          (w) => w.toLowerCase().replace(/^@/, '') === lowerHandle
        )
      ) {
        return true;
      }

      // 4. 云端全局豁免名单
      if (cleanerRuleManager.isGlobalExempt(lowerHandle)) {
        return true;
      }

      return false;
    },
    []
  );

  // 核心检测与处理单篇推文（完全同步判定，同帧微任务执行，消除视觉闪烁）
  const inspectArticle = useCallback(
    (article: HTMLElement) => {
      if (!enabledRef.current) return;

      // 提取作者 handle
      const userNameEl = article.querySelector(
        "div[data-testid='User-Name'], div[data-testid='UserName']"
      );
      const handle = extractTweetHandle(article);

      // 免死白名单校验
      if (isExempt(article, handle)) {
        if (article.dataset.xhuntCleanerHandled === 'true') {
          restoreArticle(article);
        }
        return;
      }

      // 提取正文文本（兼容多段文本、引用推文及不同标签形态）
      const textEls = article.querySelectorAll<HTMLElement>(
        "[data-testid='tweetText']"
      );
      if (textEls.length === 0) return;

      const texts: string[] = [];
      textEls.forEach((el) => {
        const content = el.textContent || '';
        if (content.trim()) {
          texts.push(content);
        }
      });
      if (texts.length === 0) return;

      const fullText = texts.join('\n');

      // 执行垃圾推文检测（先检测整篇组合文本，若有多段则再逐段检测以防弱词被长文本保护稀释）
      let detectResult = cleanerRuleManager.checkSpam(
        fullText,
        customKeywordsRef.current
      );

      if (!detectResult.matched && texts.length > 1) {
        for (const singleText of texts) {
          const res = cleanerRuleManager.checkSpam(
            singleText,
            customKeywordsRef.current
          );
          if (res.matched) {
            detectResult = res;
            break;
          }
        }
      }

      if (detectResult.matched) {
        // 同步校验 KOL 排名免除（若内存缓存中是知名认证 KOL 则放行）
        const namespaces: RankCacheNamespace[] = ['web3', 'ai'];
        if (handle) {
          for (const ns of namespaces) {
            const cachedRank = RankCacheManager.peekSync(handle, ns);
            if (cachedRank && cachedRank.kolRank && cachedRank.kolRank > 0) {
              return;
            }
          }
        }

        // 同帧立即应用动作（在当前微任务中直接修改，保证在浏览器进入渲染绘制前完成）
        applyAction({
          article,
          handle,
          category: detectResult.category,
          mode: modeRef.current,
          warnLabel: getWarnLabel(detectResult.category),
          collapseHint: t('cleanerCollapsedHint'),
        });

        // 记录被拦截的账号信息（加入名单列表供用户查看与手动屏蔽）
        if (handle) {
          let name = '';
          let avatar = '';

          const firstSpan = userNameEl?.querySelector('span');
          if (firstSpan?.textContent) {
            name = firstSpan.textContent.trim();
          }

          const avatarImg = article.querySelector<HTMLImageElement>(
            "div[data-testid='Tweet-User-Avatar'] img, [data-testid='avatar'] img"
          );
          if (avatarImg?.src) {
            avatar = avatarImg.src;
          }

          recordInterceptedAccount({
            handle,
            name,
            avatar,
            category: detectResult.category,
            reason: detectResult.reason || '',
            matchedWord: detectResult.matchedWord,
          });
        }

        // 排名异步复核：缓存未命中时主动查询排名接口（请求合并，与头像排名共用管线），
        // 一旦确认有排名（KOL）立即恢复该推文并撤销拦截记录，覆盖排名数据晚到的场景
        if (handle) {
          void (async () => {
            try {
              for (const ns of namespaces) {
                const rank = await rankService.getRank(handle, ns);
                if (rank && rank > 0) {
                  // 有排名的账号不允许进入违规账号屏蔽记录
                  void removeInterceptedAccount(handle);
                  if (
                    article.isConnected &&
                    article.dataset.xhuntCleanerHandled === 'true'
                  ) {
                    restoreArticle(article);
                  }
                  return;
                }
              }
            } catch {
              // ignore
            }
          })();
        }
      } else if (article.dataset.xhuntCleanerHandled === 'true') {
        // 之前处理过但不再命中
        restoreArticle(article);
      }
    },
    [getWarnLabel, isExempt]
  );

  // 方案一：感知当前推特个人主页的真实屏蔽状态，并与插件本地状态双向校正
  const syncCurrentProfileBlockStatus = useCallback(() => {
    const currentHandle = extractUsernameFromUrl(window.location.href);
    if (!currentHandle) return;

    // 检查是否为自己的主页
    const isOwnProfile = document.querySelector(
      'a[data-testid="editProfileButton"]'
    );
    if (isOwnProfile) return;

    const cleanHandle = currentHandle.toLowerCase();

    // 1. 若存在 unblock 按钮或 emptyState 屏蔽提示，说明在推特官方是“已屏蔽”状态
    const unblockBtn = document.querySelector(
      'button[data-testid$="-unblock"], button[data-testid*="-unblock"]'
    );
    const emptyState = document.querySelector('div[data-testid="emptyState"]');
    const emptyText = emptyState?.textContent?.toLowerCase() || '';
    const isBlockedState =
      Boolean(unblockBtn) ||
      emptyText.includes('blocked') ||
      emptyText.includes('屏蔽') ||
      emptyText.includes('封锁');

    if (isBlockedState) {
      void updateInterceptedBlockStatus(cleanHandle, true);
      return;
    }

    // 2. 若存在 follow 或 unfollow 按钮，说明在推特官方是“未屏蔽”状态
    const followBtn = document.querySelector(
      'button[data-testid$="-follow"], button[data-testid$="-unfollow"], button[data-testid*="-follow"], button[data-testid*="-unfollow"]'
    );
    if (followBtn) {
      void updateInterceptedBlockStatus(cleanHandle, false);
    }
  }, []);

  const { run: debouncedSyncProfile } = useDebounceFn(
    syncCurrentProfileBlockStatus,
    { wait: 150, maxWait: 500 }
  );

  const isProfilePage = Boolean(extractUsernameFromUrl(currentUrl));
  const isProfilePageRef = useRef(isProfilePage);
  isProfilePageRef.current = isProfilePage;

  // 监听路由变化，即刻触发当前个人主页的屏蔽状态感知与多阶段轮询
  useEffect(() => {
    if (!enabled || !isProfilePage) return;

    syncCurrentProfileBlockStatus();
    const timers = [
      setTimeout(syncCurrentProfileBlockStatus, 300),
      setTimeout(syncCurrentProfileBlockStatus, 800),
      setTimeout(syncCurrentProfileBlockStatus, 1600),
      setTimeout(syncCurrentProfileBlockStatus, 2600),
    ];
    return () => {
      timers.forEach(clearTimeout);
    };
  }, [currentUrl, enabled, isProfilePage, syncCurrentProfileBlockStatus]);

  // 监听用户点击推特原生操作弹窗（如确认解除屏蔽或屏蔽）
  useEffect(() => {
    if (!enabled) return;

    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (
        target.closest('[data-testid="confirmationSheetConfirm"]') ||
        target.closest('button[data-testid$="-unblock"]') ||
        target.closest('button[data-testid*="-unblock"]')
      ) {
        setTimeout(syncCurrentProfileBlockStatus, 200);
        setTimeout(syncCurrentProfileBlockStatus, 600);
        setTimeout(syncCurrentProfileBlockStatus, 1200);
      }
    };

    document.addEventListener('click', handleDocumentClick, true);
    return () => {
      document.removeEventListener('click', handleDocumentClick, true);
    };
  }, [enabled, syncCurrentProfileBlockStatus]);

  // 当 mode / whitelist 改变时响应 DOM
  useEffect(() => {
    // 全量扫描当前已渲染的推文
    const tweetArticles = document.querySelectorAll<HTMLElement>(TWEET_SELECTOR);
    tweetArticles.forEach((article) => {
      inspectArticle(article);
    });
  }, [effectiveMode, whitelist, customKeywords, inspectArticle]);

  // 订阅 DOM Mutation
  useEffect(() => {
    if (!enabled) return;

    // 走全局 observer 的即时通道（无防抖节流），在 MutationObserver 微任务中同帧即时执行
    const unsubscribe = subscribeToMutation(
      (mutations) => {
        // 方案一：若当前处于个人主页，任何 DOM 变动均触发防抖检测，不受是否有推文 article 影响
        if (isProfilePageRef.current) {
          debouncedSyncProfile();
        }

        // 增量处理：只收集本次变更涉及的推文，避免全文档扫描
        const affectedArticles = new Set<HTMLElement>();
        for (const mutation of mutations) {
          if (
            mutation.type !== 'childList' &&
            mutation.type !== 'characterData'
          ) {
            continue;
          }
          // characterData 过滤：只有影响检测判定的文本变化（正文/用户名/关注按钮）
          // 才触发重扫，避免点赞数、时间戳等高频文本变动导致整篇推文重复检测
          if (mutation.type === 'characterData') {
            const textHost =
              mutation.target instanceof HTMLElement
                ? mutation.target
                : mutation.target.parentElement;
            if (
              !textHost?.closest(
                "[data-testid='tweetText'], div[data-testid='User-Name'], div[data-testid='UserName'], [data-testid$='-follow'], [data-testid$='-unfollow']"
              )
            ) {
              continue;
            }
          }
          // 子节点增删或字符变更都发生在 mutation.target 内
          const targetEl =
            mutation.target instanceof HTMLElement
              ? mutation.target
              : mutation.target.parentElement;
          if (targetEl) {
            const host = targetEl.closest(TWEET_SELECTOR);
            if (host instanceof HTMLElement) {
              affectedArticles.add(host);
            }
          }
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              if (!(node instanceof HTMLElement)) return;
              // 新增节点本身是推文
              if (node.matches(TWEET_SELECTOR)) {
                affectedArticles.add(node);
              }
              // 新增节点内部包含的推文（如整条推文单元格挂载）
              node
                .querySelectorAll<HTMLElement>(TWEET_SELECTOR)
                .forEach((article) => affectedArticles.add(article));
            });
          }
        }

        if (affectedArticles.size === 0) return;

        // 同帧微任务内立即同步判定，在浏览器首帧绘制前应用动作，彻底消除视觉闪烁
        affectedArticles.forEach((article) => {
          if (!article.isConnected) return;
          if (article.dataset.xhuntCleanerHandled === 'true') {
            const sameMode = article.dataset.xhuntCleanerMode === modeRef.current;
            // X 时间线是虚拟化列表，会复用 article 节点渲染新推文；
            // 作者不一致时说明节点已被回收，必须强制重检防止状态错位
            const sameAuthor =
              (article.dataset.xhuntCleanerAuthor || '') ===
              extractTweetHandle(article);
            if (sameMode && sameAuthor) return;
          }
          inspectArticle(article);
        });
      },
      { childList: true, subtree: true, characterData: true }
    );

    return () => {
      unsubscribe();
    };
  }, [enabled, inspectArticle, debouncedSyncProfile]);

  return null;
}
