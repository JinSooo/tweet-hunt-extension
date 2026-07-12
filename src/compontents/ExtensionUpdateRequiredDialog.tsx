import React from 'react';
import { ExternalLink } from 'lucide-react';
import { useI18n } from '~contents/hooks/i18n.ts';
import { openNewTab } from '~contents/utils';
import type { ExtensionUpdateRequiredInfo } from '~utils/extensionUpdateRequired';

interface ExtensionUpdateRequiredDialogProps {
  open: boolean;
  info: ExtensionUpdateRequiredInfo | null;
  onClose: () => void;
  mode?: 'absolute' | 'fixed';
}

export function ExtensionUpdateRequiredDialog({
  open,
  info,
  onClose,
  mode = 'absolute',
}: ExtensionUpdateRequiredDialogProps) {
  const { t } = useI18n();

  if (!open || !info) return null;

  const wrapperClass =
    mode === 'fixed'
      ? 'fixed inset-0 z-[998500] flex items-start justify-center'
      : 'absolute inset-0 z-[998500] flex items-start justify-center';
  const overlayClass =
    mode === 'fixed'
      ? 'fixed inset-0 z-[998501] theme-bg-secondary'
      : 'absolute inset-0 z-[998501] theme-bg-secondary';

  return (
    <div className={wrapperClass}>
      <div className={overlayClass} style={{ opacity: 0.8 }} onClick={onClose} />
      <div className='relative z-[998502] theme-bg-secondary theme-text-primary rounded-lg border theme-border p-4 w-[360px] shadow-xl mt-4 space-y-3'>
        <div className='space-y-1'>
          <div className='text-sm font-semibold'>
            {t('extensionUpdateRequiredTitle')}
          </div>
          <p className='text-xs theme-text-secondary leading-relaxed'>
            {info.message || t('extensionUpdateRequiredDescription')}
          </p>
        </div>

        {info.minVersion && (
          <div className='px-2 py-1 rounded-md border theme-border bg-black/5 dark:bg-white/5'>
            <span className='text-[11px] theme-text-secondary'>
              {t('extensionUpdateRequiredMinVersion').replace(
                '{version}',
                info.minVersion
              )}
            </span>
          </div>
        )}

        <div className='mt-1 flex justify-end gap-2'>
          <button
            type='button'
            className='px-3 py-1.5 text-xs rounded-md theme-hover border theme-border theme-text-primary'
            onClick={onClose}
          >
            {t('cancel')}
          </button>
          <button
            type='button'
            className='px-3 py-1.5 text-xs rounded-md bg-blue-500 text-white hover:bg-blue-600 inline-flex items-center gap-1'
            onClick={() => openNewTab(info.updateUrl)}
          >
            <span>{t('extensionUpdateRequiredCta')}</span>
            <ExternalLink className='w-3 h-3' />
          </button>
        </div>
      </div>
    </div>
  );
}
