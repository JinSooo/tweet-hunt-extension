import { useEffect, useRef } from 'react';
import { useLocalStorage } from '~storage/useLocalStorage.ts';

/**
 * 登录成功后原地刷新页面：token 在其他标签页（OAuth 回调页）写入后，
 * 本页监听到 token 变化即 reload，保证各模块以最新登录态重新初始化
 */
const useReloadOnLogin = () => {
  const [token, , { isLoading }] = useLocalStorage('@xhunt/token', '');
  const initialTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (initialTokenRef.current === null) {
      initialTokenRef.current = token || '';
      return;
    }
    if (token && token !== initialTokenRef.current) {
      // OAuth 回调页自身不刷新（该页登录成功后会自行关闭）
      if (window.location.href.includes('account/xhunt')) return;
      window.location.reload();
    }
  }, [token, isLoading]);
};

export default useReloadOnLogin;
