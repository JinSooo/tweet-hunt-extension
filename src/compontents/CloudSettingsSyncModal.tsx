import React, { useState } from 'react';
import {
  Cloud,
  Upload,
  Download,
  Loader2,
  Check,
  AlertCircle,
  X,
} from 'lucide-react';
import { useLocalStorage } from '~storage/useLocalStorage.ts';
import { useI18n } from '~contents/hooks/i18n.ts';
import { useGlobalTips } from '~compontents/area/GlobalTips.tsx';
import {
  collectLocalSettings,
  uploadCloudUserSettings,
  fetchCloudUserSettings,
  applyCloudSettingsToLocal,
} from '~contents/services/userSettings.ts';

export interface CloudSettingsSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CloudSettingsSyncModal: React.FC<CloudSettingsSyncModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t, lang } = useI18n();
  const [, setTips] = useGlobalTips();
  const [token] = useLocalStorage('@xhunt/token', '');
  const [lastSyncTime, setLastSyncTime] = useLocalStorage<number | null>(
    '@xhunt/settings-last-sync-time',
    null
  );

  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  if (!isOpen) return null;

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => {
      setFeedback(null);
    }, 4000);
  };

  const handleUpload = async () => {
    if (!token) {
      const msg = t('cloudSyncLoginRequired');
      setTips({ text: msg, type: 'warning' });
      showFeedback('error', msg);
      return;
    }

    try {
      setIsUploading(true);
      setFeedback(null);
      const localPayload = await collectLocalSettings();
      const res = await uploadCloudUserSettings(localPayload);
      if (res) {
        const now = Date.now();
        setLastSyncTime(now);
        const successMsg = t('cloudSyncUploadSuccess');
        showFeedback('success', successMsg);
        setTips({ text: successMsg, type: 'suc' });
      } else {
        throw new Error('Upload returned empty response');
      }
    } catch (err: any) {
      console.error('[CloudSettingsSyncModal] Upload failed:', err);
      const errorMsg = t('cloudSyncError');
      showFeedback('error', errorMsg);
      setTips({ text: errorMsg, type: 'fail' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async () => {
    if (!token) {
      const msg = t('cloudSyncLoginRequired');
      setTips({ text: msg, type: 'warning' });
      showFeedback('error', msg);
      return;
    }

    try {
      setIsDownloading(true);
      setFeedback(null);
      const cloudData = await fetchCloudUserSettings();
      if (!cloudData || !cloudData.settings) {
        const noDataMsg = t('cloudSyncNoData');
        showFeedback('error', noDataMsg);
        setTips({ text: noDataMsg, type: 'warning' });
        return;
      }

      await applyCloudSettingsToLocal(cloudData.settings);
      const now = Date.now();
      setLastSyncTime(now);
      const successMsg = t('cloudSyncDownloadSuccess');
      showFeedback('success', successMsg);
      setTips({ text: successMsg, type: 'suc' });
    } catch (err: any) {
      console.error('[CloudSettingsSyncModal] Download failed:', err);
      const errorMsg = t('cloudSyncError');
      showFeedback('error', errorMsg);
      setTips({ text: errorMsg, type: 'fail' });
    } finally {
      setIsDownloading(false);
    }
  };

  const lastSyncTimeStr = lastSyncTime
    ? new Date(lastSyncTime).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className='absolute inset-0 z-50 flex items-center justify-center p-3 select-none'>
      {/* 半透明遮罩层 */}
      <div
        className='absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity'
        onClick={onClose}
      />

      {/* 弹框主体 */}
      <div
        className='relative z-10 w-full max-w-[280px] theme-bg-secondary theme-text-primary rounded-xl border theme-border p-3 shadow-xl flex flex-col gap-2'
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-1.5'>
            <Cloud className='w-3.5 h-3.5 text-xhunt-accent' />
            <span className='text-xs font-semibold theme-text-primary tracking-wide'>
              {t('cloudSyncTitle')}
            </span>
          </div>
          <button
            type='button'
            onClick={onClose}
            className='p-0.5 rounded-md theme-hover theme-text-secondary hover:theme-text-primary transition-colors'
          >
            <X className='w-3.5 h-3.5' />
          </button>
        </div>

        {/* 同步状态 */}
        <div className='flex items-center justify-between text-[11px] theme-text-secondary px-0.5'>
          <span>{t('cloudSyncStatusLabel')}</span>
          <span className='font-medium theme-text-primary'>
            {lastSyncTimeStr || t('cloudSyncNever')}
          </span>
        </div>

        {/* 操作按钮 */}
        <div className='flex items-center gap-2 pt-0.5'>
          <button
            type='button'
            disabled={isUploading || isDownloading}
            onClick={handleUpload}
            className='flex-1 h-7 px-2 rounded-lg bg-xhunt-accent text-white text-[11px] font-medium flex items-center justify-center gap-1 hover:bg-xhunt-accent-hover active:scale-[0.98] disabled:opacity-50 transition-all shadow-xs'
          >
            {isUploading ? (
              <Loader2 className='w-3 h-3 animate-spin' />
            ) : (
              <Upload className='w-3 h-3' />
            )}
            <span>
              {isUploading
                ? t('cloudSyncUploading')
                : t('cloudSyncUploadBtn')}
            </span>
          </button>

          <button
            type='button'
            disabled={isUploading || isDownloading}
            onClick={handleDownload}
            className='flex-1 h-7 px-2 rounded-lg border theme-border theme-bg-secondary theme-text-primary text-[11px] font-medium flex items-center justify-center gap-1 hover:theme-bg-tertiary active:scale-[0.98] disabled:opacity-50 transition-all'
          >
            {isDownloading ? (
              <Loader2 className='w-3 h-3 animate-spin' />
            ) : (
              <Download className='w-3 h-3' />
            )}
            <span>
              {isDownloading
                ? t('cloudSyncDownloading')
                : t('cloudSyncDownloadBtn')}
            </span>
          </button>
        </div>

        {/* 操作反馈 */}
        {feedback && (
          <div
            className={`text-[11px] flex items-center gap-1 pt-0.5 transition-all ${
              feedback.type === 'error' ? 'text-red-500' : 'text-emerald-500'
            }`}
          >
            {feedback.type === 'error' ? (
              <AlertCircle className='w-3 h-3 shrink-0' />
            ) : (
              <Check className='w-3 h-3 shrink-0' />
            )}
            <span className='truncate'>{feedback.text}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default CloudSettingsSyncModal;
