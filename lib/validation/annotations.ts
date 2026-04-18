import { z } from 'zod'

/** POST `/api/annotations` — shared with `EditorPageClient` before fetch. */
export const annotationCreateBodySchema = z.discriminatedUnion('kind', [
  z.object({
    step_id: z.string().trim().min(1).max(255),
    t_start_ms: z.number().finite().min(0),
    t_end_ms: z.number().finite().min(0),
    kind: z.literal('arrow'),
    x: z.number().finite(),
    y: z.number().finite(),
    angle: z.number().finite().optional(),
    text: z.string().max(2000).optional(),
    style: z.unknown().optional(),
  }),
  z.object({
    step_id: z.string().trim().min(1).max(255),
    t_start_ms: z.number().finite().min(0),
    t_end_ms: z.number().finite().min(0),
    kind: z.literal('label'),
    x: z.number().finite(),
    y: z.number().finite(),
    angle: z.number().finite().optional(),
    text: z.string().trim().min(1).max(2000),
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

export type AnnotationCreateBody = z.infer<typeof annotationCreateBodySchema>
