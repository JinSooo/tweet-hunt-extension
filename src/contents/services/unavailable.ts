// The upstream public repository omits the private backend and request signing.
export const PUBLIC_API_UNAVAILABLE =
  '公开源码未包含 XHunt 后端/API；此功能不可用。 The public source does not include the XHunt backend/API.';

export async function unavailable(..._args: any[]): Promise<any> {
  throw new Error(PUBLIC_API_UNAVAILABLE);
}
