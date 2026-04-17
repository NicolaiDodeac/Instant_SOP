import { z } from 'zod'

/** JSON often has explicit `null`; Zod's `.optional()` only allows `undefined`. */
function nullToUndefined<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => (v === null ? undefined : v), schema)
}

/** Matches PUT `/api/sops/[sopId]/sync` body — shared with `EditorPageClient` before fetch. */
const annotationItemSchema = z.discriminatedUnion('kind', [
  z.object({
    t_start_ms: z.number().finite().min(0),
    t_end_ms: z.number().finite().min(0),
    kind: z.literal('arrow'),
    x: z.number().finite(),
    y: z.number().finite(),
    angle: nullToUndefined(z.number().finite().optional()),
    text: nullToUndefined(z.string().max(2000).optional()),
    style: z.unknown().optional(),
  }),
  z.object({
    t_start_ms: z.number().finite().min(0),
    t_end_ms: z.number().finite().min(0),
    kind: z.literal('label'),
    x: z.number().finite(),
    y: z.number().finite(),
    angle: nullToUndefined(z.number().finite().optional()),
    text: nullToUndefined(z.string().trim().min(1).max(2000)),
    style: z.unknown().optional(),
  }),
]).superRefine((v, ctx) => {
  if (!(v.t_end_ms > v.t_start_ms)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 't_end_ms must be greater than t_start_ms',
      path: ['t_end_ms'],
    })
  }
})

const stepSchema = z.object({
  id: z.string().trim().min(1).max(255),
  idx: z.number().finite(),
  title: nullToUndefined(z.string().max(2000).optional()),
  kind: z.enum(['media', 'text']).optional(),
  instructions: z.string().max(20000).nullable().optional(),
  video_path: z.string().max(2048).nullable().optional(),
  thumbnail_path: z.string().max(2048).nullable().optional(),
  image_path: z.string().max(2048).nullable().optional(),
  text_payload: z.unknown().nullable().optional(),
  duration_ms: z.number().finite().min(0).nullable().optional(),
})

const annotationStepKeySchema = z.string().trim().min(1).max(255)

export const sopSyncPutBodySchema = z
  .object({
    title: nullToUndefined(z.string().max(2000).optional()),
    description: z.string().max(20000).nullable().optional(),
    steps: z.array(stepSchema).max(2000).optional().default([]),
    annotations: z
      .record(annotationStepKeySchema, z.array(annotationItemSchema))
      .optional()
      .default({}),
  })
  .superRefine((v, ctx) => {
    const keys = Object.keys(v.annotations ?? {})
    if (keys.length > 2000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Too many annotation step keys',
        path: ['annotations'],
      })
    }
  })

export type SopSyncPutBody = z.infer<typeof sopSyncPutBodySchema>
