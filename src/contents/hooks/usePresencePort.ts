import { useEffect } from 'react';

const isExtensionContextInvalidated = (error?: unknown) => {
  try {
    // @ts-ignore
    const runtime = chrome?.runtime as any;
    if (!runtime?.id) return true;

    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : runtime.lastError?.message || '';

    return /Extension context invalidated|context invalidated/i.test(message);
  } catch {
    return true;
  }
};

/**
 * 用途：在内容脚本运行于 x.com 时，建立到 background 的长连接 Port（name: 'presence'）。
 * 背景：background 通过 onConnect/onDisconnect 感知是否存在 x.com 页面，
 * 从而在在线集合从空↔非空时触发 checkAndManageService() 实现服务启停。
 * 说明：不发送心跳，仅依赖端口连接状态；卸载时主动断开以便及时触发离线。
 */
export default function usePresencePort() {
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !window.location.href.includes('x.com')
    ) {
      return;
    }

    // @ts-ignore
    let port: chrome.runtime.Port | null = null;
    let isConnecting = false;
    let destroyed = false;

    const connect = () => {
      if (destroyed || port || isConnecting) return;

      isConnecting = true;
      try {
        // @ts-ignore
        const p: chrome.runtime.Port = chrome.runtime.connect({
          name: 'presence',
        });
        port = p;

        p.onDisconnect.addListener(() => {
          let lastError: unknown = null;
          try {
            // @ts-ignore
            lastError = chrome?.runtime?.lastError;
          } catch (error) {
            window.location.reload();
            return;
          }
          port = null;

          if (isExtensionContextInvalidated(lastError)) {
            window.location.reload();
            return;
          }

          if (!destroyed && document.visibilityState === 'visible') {

            setTimeout(() => {
              connect();
            }, 100);
          }
        });
      } catch (error) {
        if (isExtensionContextInvalidated(error)) {
          window.location.reload();
        }
      } finally {
        isConnecting = false;
      }
    };

    const onVisibility = () => {

      if (document.visibilityState === 'visible' && !port && !isConnecting) {

        connect();
      }
    };

    if (document.visibilityState === 'visible') {

      connect();
    } else {

    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      destroyed = true;

      document.removeEventListener('visibilitychange', onVisibility);
      try {
        port?.disconnect();
      } catch (_) {}
      port = null;
    };
  }, []);
}
