# CanvasApp MCP Summarizer

A production-ready MCP server that validates structured context payloads and returns a concise summary for ChatGPT Developer Mode. The model reads the conversation/canvas, sends structured data to the tool, and the server returns a clean summary in tool output.

## Transport
- MCP over Streamable HTTP (JSON-RPC 2.0) via `POST /mcp`.
- SSE is not used.

## Tools
- `healthcheck`: returns `{ version, uptime, server_time }`.
- `summarize_context`: validates a structured payload, normalizes missing arrays to `[]`, pushes the generated summary into the configured Google Doc webhook, and returns only a push status (not the summary text).

## Local Development
```bash
npm install
APP_BASE_URL=http://localhost:3000 npm run dev
```

## Deploy to Vercel
1. Import the repo into Vercel.
2. Set environment variable `APP_BASE_URL` to your deployment base URL (e.g. `https://your-app.vercel.app`).
3. Vercel will run `npm run build` and `npm run start` automatically.

## Connect in ChatGPT Developer Mode
1. Create a new MCP server entry.
2. Set the MCP URL to: `https://<deployment>/mcp`.
3. Save and enable the server for the chat.

## Example Prompts
- "Summarize this deal using @CanvasApp in exec_bullets format"
- "Summarize canvas '<name>' and include next steps"

## Smoke Tests
Healthcheck (tool call):
```bash
curl -s -X POST "$APP_BASE_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"healthcheck","arguments":{}}}'
```

Summarize context (tool call):
```bash
curl -s -X POST "$APP_BASE_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "summarize_context",
      "arguments": {
        "deal_id": "D-123",
        "deal_name": "Acme Expansion",
        "source_canvas_name": "Acme Canvas",
        "doc_title": "Acme Expansion (POC)",
        "context": {
          "summary": "Renewal in negotiation with pricing sensitivity.",
          "key_points": ["Security review complete", "Procurement wants 5% discount"],
          "open_questions": [{"question": "Final signer?", "owner": "AE"}],
          "next_steps": [{"action": "Send revised quote", "status": "open"}],
          "risks": [{"risk": "Budget freeze", "severity": "high"}],
          "stakeholders": [{"name": "Jamie Lee", "role": "CFO"}],
          "evidence": [{"type": "conversation", "pointer": "msg#142", "excerpt": "We need pricing approval"}],
          "last_updated": "2025-02-14"
        },
        "output_format": "exec_bullets"
      }
    }
  }'
```

## Required Environment Variables
- `APP_BASE_URL`: Base URL for deployment (used for configuration checks and documentation).
- `DOC_WEBHOOK_URL`: Google Apps Script Web App URL (required; used to push summaries into a Google Doc).
- `DOC_WEBHOOK_TOKEN`: Shared secret token expected by the Apps Script webhook (required).
