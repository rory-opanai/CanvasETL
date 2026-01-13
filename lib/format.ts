import type { SummarizeInput } from "@/lib/schema";

const MAX_ITEMS = 8;

function clean(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function limitItems<T>(items: T[]) {
  if (items.length <= MAX_ITEMS) {
    return { items, remaining: 0 };
  }
  return { items: items.slice(0, MAX_ITEMS), remaining: items.length - MAX_ITEMS };
}

function formatList(items: string[]) {
  if (!items.length) {
    return "- None";
  }
  const limited = limitItems(items);
  const lines = limited.items.map((item) => `- ${clean(item)}`);
  if (limited.remaining) {
    lines.push(`- ... (+${limited.remaining} more)`);
  }
  return lines.join("\n");
}

function formatQuestions(items: SummarizeInput["context"]["open_questions"]) {
  if (!items.length) {
    return "- None";
  }
  const limited = limitItems(items);
  const lines = limited.items
    .map((item) => {
      const meta: string[] = [];
      if (item.owner) meta.push(`Owner: ${clean(item.owner)}`);
      if (item.due) meta.push(`Due: ${clean(item.due)}`);
      const metaText = meta.length ? ` (${meta.join("; ")})` : "";
      return `- ${clean(item.question)}${metaText}`;
    });
  if (limited.remaining) {
    lines.push(`- ... (+${limited.remaining} more)`);
  }
  return lines.join("\n");
}

function formatNextSteps(items: SummarizeInput["context"]["next_steps"]) {
  if (!items.length) {
    return "- None";
  }
  const limited = limitItems(items);
  const lines = limited.items
    .map((item) => {
      const meta: string[] = [`Status: ${item.status}`];
      if (item.owner) meta.push(`Owner: ${clean(item.owner)}`);
      if (item.due) meta.push(`Due: ${clean(item.due)}`);
      return `- ${clean(item.action)} (${meta.join("; ")})`;
    });
  if (limited.remaining) {
    lines.push(`- ... (+${limited.remaining} more)`);
  }
  return lines.join("\n");
}

function formatRisks(items: SummarizeInput["context"]["risks"]) {
  if (!items.length) {
    return "- None";
  }
  const limited = limitItems(items);
  const lines = limited.items
    .map((item) => {
      const severity = item.severity.toUpperCase();
      const mitigation = item.mitigation ? ` (Mitigation: ${clean(item.mitigation)})` : "";
      return `- [${severity}] ${clean(item.risk)}${mitigation}`;
    });
  if (limited.remaining) {
    lines.push(`- ... (+${limited.remaining} more)`);
  }
  return lines.join("\n");
}

function formatStakeholders(items: SummarizeInput["context"]["stakeholders"]) {
  if (!items.length) {
    return "- None";
  }
  const limited = limitItems(items);
  const lines = limited.items
    .map((item) => {
      const meta: string[] = [];
      if (item.role) meta.push(`Role: ${clean(item.role)}`);
      if (item.influence) meta.push(`Influence: ${clean(item.influence)}`);
      const metaText = meta.length ? ` (${meta.join("; ")})` : "";
      return `- ${clean(item.name)}${metaText}`;
    });
  if (limited.remaining) {
    lines.push(`- ... (+${limited.remaining} more)`);
  }
  return lines.join("\n");
}

export function formatSummary(input: SummarizeInput) {
  const { deal_id, deal_name, source_canvas_name, context, output_format } = input;
  const dealLabel = deal_name ?? deal_id ?? "Unspecified";
  const lines: string[] = [];

  lines.push("## Deal Summary");
  lines.push(`- Deal: ${clean(dealLabel)}`);
  lines.push(`- Summary: ${clean(context.summary)}`);
  if (deal_name && deal_id) {
    lines.push(`- Deal ID: ${clean(deal_id)}`);
  }
  if (source_canvas_name) {
    lines.push(`- Source Canvas: ${clean(source_canvas_name)}`);
  }
  if (context.last_updated) {
    lines.push(`- Last Updated: ${clean(context.last_updated)}`);
  }

  lines.push("");
  lines.push("## Key Points");
  lines.push(formatList(context.key_points));

  lines.push("");
  lines.push("## Risks");
  lines.push(formatRisks(context.risks));

  lines.push("");
  lines.push("## Open Questions");
  lines.push(formatQuestions(context.open_questions));

  lines.push("");
  lines.push("## Next Steps");
  lines.push(formatNextSteps(context.next_steps));

  lines.push("");
  lines.push("## Stakeholders");
  lines.push(formatStakeholders(context.stakeholders));

  if (output_format !== "exec_bullets") {
    lines.push("");
    lines.push("### Structured Payload (for ETL)");
    lines.push("```json");
    lines.push(JSON.stringify(input, null, 2));
    lines.push("```");
  }

  return lines.join("\n");
}
