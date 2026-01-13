import { z } from "zod";

const trimmedString = z.string().min(1);

const openQuestionSchema = z.object({
  question: trimmedString,
  owner: trimmedString.optional(),
  due: trimmedString.optional()
});

const nextStepSchema = z.object({
  action: trimmedString,
  owner: trimmedString.optional(),
  due: trimmedString.optional(),
  status: z.enum(["open", "done"])
});

const riskSchema = z.object({
  risk: trimmedString,
  severity: z.enum(["low", "med", "high"]),
  mitigation: trimmedString.optional()
});

const stakeholderSchema = z.object({
  name: trimmedString,
  role: trimmedString.optional(),
  influence: trimmedString.optional()
});

const evidenceSchema = z.object({
  type: z.enum(["conversation", "canvas"]),
  pointer: trimmedString,
  excerpt: trimmedString
});

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const contextSchema = z.object({
  summary: trimmedString,
  key_points: z.array(trimmedString).optional().default([]),
  open_questions: z.array(openQuestionSchema).optional().default([]),
  next_steps: z.array(nextStepSchema).optional().default([]),
  risks: z.array(riskSchema).optional().default([]),
  stakeholders: z.array(stakeholderSchema).optional().default([]),
  evidence: z.array(evidenceSchema).optional().default([]),
  last_updated: dateString.optional()
});

export const summarizeInputSchema = z.object({
  deal_id: trimmedString.optional(),
  deal_name: trimmedString.optional(),
  source_canvas_name: trimmedString.optional(),
  context: contextSchema,
  output_format: z.enum(["exec_bullets", "se_deal_update", "memo"]),
  doc_title: trimmedString.optional()
});

export type SummarizeInput = z.infer<typeof summarizeInputSchema>;

export function formatZodError(error: z.ZodError) {
  return error.errors
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "input";
      return `- ${path}: ${issue.message}`;
    })
    .join("\n");
}
