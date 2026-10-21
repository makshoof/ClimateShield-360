import { z } from 'zod';

const envelope = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    generated_at: z.string(),
    is_sample: z.boolean(),
  });

export const metaSchema = envelope(
  z.object({
    app_name: z.string(),
    version: z.string(),
    is_sample: z.boolean(),
    timezone_stored: z.string().optional(),
    timezone_display: z.string().optional(),
    db_path: z.string().optional(),
    last_run: z
      .object({
        run_id: z.string().nullable().optional(),
        started_at: z.string().nullable().optional(),
        finished_at: z.string().nullable().optional(),
        status: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
  })
);

export function parseApi<T>(schema: z.ZodType<T>, payload: unknown, label: string): T | null {
  const result = schema.safeParse(payload);
  if (!result.success) {
    console.error(`[ClimateShield] Unexpected data format for ${label}`, result.error.flatten());
    return null;
  }
  return result.data;
}

export function sanitizeText(value: unknown): string {
  return String(value ?? '')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
