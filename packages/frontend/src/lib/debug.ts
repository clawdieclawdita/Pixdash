const PIXDASH_DEBUG = typeof window !== 'undefined' && (window as any).__pixdashDebug;
const PIXDASH_DEBUG_AGENT = typeof window !== 'undefined' && (window as any).__pixdashDebugAgent;

export const isDebug = () => PIXDASH_DEBUG;
export const isDebugAgent = (agentId: string) => PIXDASH_DEBUG_AGENT === agentId;

export const debugLog = (msg: string, data?: any) => {
  if (!PIXDASH_DEBUG) return;
  console.log(msg, data);
};

export const debugAgent = (agentId: string, msg: string, data?: any) => {
  if (PIXDASH_DEBUG_AGENT !== agentId) return;
  console.log(msg, data);
};
