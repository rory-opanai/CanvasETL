import { NextRequest, NextResponse } from "next/server";
import { formatSummary } from "@/lib/format";
import { log } from "@/lib/logger";
import { formatZodError, summarizeInputSchema } from "@/lib/schema";
import { getHealthPayload, isBaseUrlConfigured, SERVER_NAME, SERVER_VERSION } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROTOCOL_VERSION = "2024-11-05";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store"
};

type JsonRpcId = string | number | null;

function coerceJsonRpcId(value: unknown): JsonRpcId {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function getDocWebhookConfig() {
  const url = process.env.DOC_WEBHOOK_URL;
  const token = process.env.DOC_WEBHOOK_TOKEN;
  if (!url || !token) {
    return null;
  }
  return { url, token };
}

async function pushSummaryToDocWebhook(input: { requestId: string; title: string; text: string }) {
  const cfg = getDocWebhookConfig();
  if (!cfg) {
    return { ok: false as const, error: "DOC_WEBHOOK_URL / DOC_WEBHOOK_TOKEN not configured." };
  }

  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      // Apps Script web apps frequently respond with redirects; avoid auto-follow because
      // follow can convert POST -> GET and drop the body. We treat 3xx as success.
      redirect: "manual",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: cfg.token,
        title: input.title,
        text: input.text,
        source: "CanvasETL"
      })
    });

    const ok = res.status >= 200 && res.status < 400;
    if (!ok) {
      const body = await res.text().catch(() => "");
      return { ok: false as const, error: `Webhook HTTP ${res.status}: ${body.slice(0, 300)}` };
    }

    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: String(error) };
  }
}

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
};

const TOOL_DEFS = [
  {
    name: "healthcheck",
    description: "Return server version, uptime, and server_time.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "summarize_context",
    description:
      "Read the full relevant conversation context and (if specified) the canvas named source_canvas_name before calling this tool. " +
      "Do not ask the user to paste anything. " +
      "Prefer structured extraction; keep evidence excerpts short and minimal. " +
      "If the canvas name is provided, prioritize the canvas for canonical fields, and use the chat for recent deltas.",
    inputSchema: {
      type: "object",
      properties: {
        deal_id: { type: "string" },
        deal_name: { type: "string" },
        source_canvas_name: { type: "string" },
        doc_title: { type: "string" },
        context: {
          type: "object",
          properties: {
            summary: { type: "string" },
            key_points: { type: "array", items: { type: "string" } },
            open_questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  question: { type: "string" },
                  owner: { type: "string" },
                  due: { type: "string" }
                },
                required: ["question"],
                additionalProperties: false
              }
            },
            next_steps: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  action: { type: "string" },
                  owner: { type: "string" },
                  due: { type: "string" },
                  status: { type: "string", enum: ["open", "done"] }
                },
                required: ["action", "status"],
                additionalProperties: false
              }
            },
            risks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  risk: { type: "string" },
                  severity: { type: "string", enum: ["low", "med", "high"] },
                  mitigation: { type: "string" }
                },
                required: ["risk", "severity"],
                additionalProperties: false
              }
            },
            stakeholders: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  role: { type: "string" },
                  influence: { type: "string" }
                },
                required: ["name"],
                additionalProperties: false
              }
            },
            evidence: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["conversation", "canvas"] },
                  pointer: { type: "string" },
                  excerpt: { type: "string" }
                },
                required: ["type", "pointer", "excerpt"],
                additionalProperties: false
              }
            },
            last_updated: {
              type: "string",
              description: "YYYY-MM-DD"
            }
          },
          required: ["summary"],
          additionalProperties: false
        },
        output_format: {
          type: "string",
          enum: ["exec_bullets", "se_deal_update", "memo"]
        }
      },
      required: ["context", "output_format"],
      additionalProperties: false
    }
  }
];

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function makeError(id: JsonRpcId, code: number, message: string, data?: unknown) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      data
    }
  };
}

function makeResult(id: JsonRpcId, result: unknown) {
  return {
    jsonrpc: "2.0",
    id,
    result
  };
}

function getContextStats(input: unknown) {
  if (!isObject(input)) {
    return {};
  }
  const context = isObject(input.context) ? input.context : undefined;
  if (!context) {
    return {};
  }
  const stats: Record<string, number> = {};
  const arrays: Array<[string, unknown]> = [
    ["key_points", context.key_points],
    ["open_questions", context.open_questions],
    ["next_steps", context.next_steps],
    ["risks", context.risks],
    ["stakeholders", context.stakeholders],
    ["evidence", context.evidence]
  ];

  for (const [name, value] of arrays) {
    stats[`${name}_count`] = Array.isArray(value) ? value.length : 0;
  }

  return stats;
}

async function handleMessage(message: unknown) {
  if (!isObject(message)) {
    return makeError(null, -32600, "Invalid Request", "Expected JSON object.");
  }

  const hasId = Object.prototype.hasOwnProperty.call(message, "id");
  const id = hasId ? coerceJsonRpcId(message.id) : null;
  const requestId = hasId ? String(id) : "notification";

  if (message.jsonrpc !== "2.0") {
    return makeError(id, -32600, "Invalid Request", "Missing jsonrpc: '2.0'.");
  }

  const method = typeof message.method === "string" ? message.method : "";

  if (!method) {
    return makeError(id, -32600, "Invalid Request", "Missing method.");
  }

  if (method === "initialized" || method === "notifications/initialized") {
    log("info", "mcp.initialized", { request_id: requestId });
    return hasId ? makeResult(id, {}) : null;
  }

  if (!hasId && method !== "notifications/initialized" && method !== "initialized") {
    log("warn", "mcp.notification.ignored", { request_id: requestId, method });
    return null;
  }

  switch (method) {
    case "initialize": {
      log("info", "mcp.initialize", {
        request_id: requestId,
        base_url_configured: isBaseUrlConfigured()
      });
      return makeResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: {
            listChanged: false
          }
        },
        serverInfo: {
          name: SERVER_NAME,
          version: SERVER_VERSION
        }
      });
    }
    case "tools/list": {
      log("info", "mcp.tools.list", { request_id: requestId, tool_count: TOOL_DEFS.length });
      return makeResult(id, { tools: TOOL_DEFS });
    }
    case "tools/call": {
      const params = isObject(message.params) ? message.params : {};
      const name = typeof params.name === "string" ? params.name : "";
      const args = isObject(params.arguments) ? params.arguments : {};

      if (!name) {
        log("warn", "mcp.tools.call.invalid", { request_id: requestId });
        return makeResult(id, {
          content: [{ type: "text", text: "Validation error: tool name is required." }],
          isError: true
        });
      }

      if (name === "healthcheck") {
        const payload = getHealthPayload();
        log("info", "mcp.tools.call.healthcheck", { request_id: requestId });
        return makeResult(id, {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          isError: false
        });
      }

      if (name === "summarize_context") {
        const parsed = summarizeInputSchema.safeParse(args);
        if (!parsed.success) {
          const details = formatZodError(parsed.error);
          log("warn", "mcp.tools.call.validation_error", {
            request_id: requestId,
            tool: name
          });
          return makeResult(id, {
            content: [{ type: "text", text: `Validation error:\n${details}` }],
            isError: true
          });
        }

        const summaryText = formatSummary(parsed.data);
        const title =
          parsed.data.doc_title ?? parsed.data.deal_name ?? parsed.data.deal_id ?? "CanvasETL Summary";
        const pushResult = await pushSummaryToDocWebhook({
          requestId,
          title,
          text: summaryText
        });
        if (pushResult.ok) {
          log("info", "mcp.doc_push.ok", { request_id: requestId });
        } else {
          log("error", "mcp.doc_push.failed", { request_id: requestId, error: pushResult.error });
        }
        log("info", "mcp.tools.call.summarize_context", {
          request_id: requestId,
          tool: name,
          output_format: parsed.data.output_format,
          ...getContextStats(parsed.data)
        });
        return makeResult(id, {
          content: [
            {
              type: "text",
              text: pushResult.ok ? `Doc push: ok\nTitle: ${title}` : `Doc push: failed\n${pushResult.error}`
            }
          ],
          isError: !pushResult.ok
        });
      }

      log("warn", "mcp.tools.call.unknown_tool", { request_id: requestId, tool: name });
      return makeResult(id, {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true
      });
    }
    default: {
      log("warn", "mcp.method.not_found", { request_id: requestId, method });
      return makeError(id, -32601, "Method not found", { method });
    }
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;

  try {
    body = await req.json();
  } catch (error) {
    log("error", "mcp.parse_error", { error: String(error) });
    return jsonResponse(makeError(null, -32700, "Parse error"), 400);
  }

  if (Array.isArray(body)) {
    const responses: unknown[] = [];
    for (const message of body) {
      const response = await handleMessage(message);
      if (response) {
        responses.push(response);
      }
    }

    if (!responses.length) {
      return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
    }

    return jsonResponse(responses);
  }

  const response = await handleMessage(body);
  if (!response) {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  return jsonResponse(response);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
