import React from 'react';
import { useRequest } from 'ahooks';
import { AiHotProjectsKOLs } from '../hotProjects/AiHotProjectsKOLs';
import { getActiveHunterCampaignsByDomainAsync } from '../HunterCampaign/campaignConfigs';
import { HunterEarnSection } from '../HunterEarnSection';
import ErrorBoundary from '../ErrorBoundary';

export interface AiHomeSidebarProps {
  className?: string;
  active?: boolean;
}

export function AiHomeSidebar({
  className = '',
  active = true,
}: AiHomeSidebarProps) {
  const { data: activeHunterCampaigns = [] } = useRequest(
    () => getActiveHunterCampaignsByDomainAsync('ai'),
    {
      ready: active,
      pollingInterval: 200_000,
      pollingWhenHidden: false,
    }
  );

  return (
    <div
      className={`rounded-xl theme-border ${className}`}
      style={{
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--border-color)',
        width: '350px',
        height: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <ErrorBoundary name='AiHunterEarnSection'>
        <HunterEarnSection
          active={active}
          activeHunterCampaigns={activeHunterCampaigns}
          domain='ai'
        />
      </ErrorBoundary>

      <ErrorBoundary name='AiHotProjectsKOLs'>
        <AiHotProjectsKOLs />
      </ErrorBoundary>
    </div>
  );
}

export default AiHomeSidebar;
