// Private campaign configuration is not included in the upstream public source.
export type CampaignDomain = 'web3' | 'ai';
type TaskInfo = { campaignKey: string; taskId: string };
export const taskVerificationMap: Record<string, TaskInfo[]> = {};
export const isTaskMapReady = () => true;
export async function ensureTaskMapReady(): Promise<void> {}
export const getTaskInfoByHandle = (_handle: string): TaskInfo[] => [];
export async function getActiveCampaignForUserAsync(_userId: string): Promise<null> {
  return null;
}
export async function getActiveHunterCampaignsByDomainAsync(
  _domain: CampaignDomain,
): Promise<any[]> {
  return [];
}
