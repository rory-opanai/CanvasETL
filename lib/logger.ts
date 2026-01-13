const MAX_STRING_LENGTH = 120;

type LogLevel = "info" | "warn" | "error";

function normalizeString(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, limit = MAX_STRING_LENGTH) {
  const normalized = normalizeString(value);
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit)}...`;
}

function safeValue(value: unknown) {
  if (typeof value === "string") {
    return truncate(value);
  }
  if (Array.isArray(value)) {
    return `array(len=${value.length})`;
  }
  if (value && typeof value === "object") {
    return "[object]";
  }
  return value;
}

export function log(level: LogLevel, message: string, meta: Record<string, unknown> = {}) {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    sanitized[key] = safeValue(value);
  }

  const entry = {
    level,
    message,
    ...sanitized,
    timestamp: new Date().toISOString()
  };

  console.log(JSON.stringify(entry));
}
