export const SERVER_NAME = "CanvasApp MCP Summarizer";
export const SERVER_VERSION = "0.1.0";

export function getHealthPayload() {
  return {
    version: SERVER_VERSION,
    uptime: Math.floor(process.uptime()),
    server_time: new Date().toISOString()
  };
}

export function isBaseUrlConfigured() {
  return Boolean(process.env.APP_BASE_URL);
}
