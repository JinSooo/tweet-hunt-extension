import { useEffect } from 'react';
import useWaitForElement from '~contents/hooks/useWaitForElement.ts';
import useCurrentUrl from '~contents/hooks/useCurrentUrl.ts';
import { checkMainSectionAndFixZIndex } from '~contents/hooks/useShadowContainer.ts';

export function UICheckSection() {
  const currentUrl = useCurrentUrl();

  const sectionDom = useWaitForElement('main [aria-label] section', [
    currentUrl,
  ]);
  useEffect(() => {
    if (!sectionDom) return;
    checkMainSectionAndFixZIndex();
  }, [sectionDom]);

  return (
    <div
      style={{
        opacity: 0,
      }}
    />
  );
}
