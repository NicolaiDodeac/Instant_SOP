import { z } from 'zod'

export const createSOPSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
})

export const updateSOPSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  published: z.boolean().optional(),
})

export const createStepSchema = z.object({
  title: z.string().min(1).max(200),
  instructions: z.string().max(2000).optional(),
  idx: z.number().int().min(0),
})

export const updateStepSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  instructions: z.string().max(2000).optional(),
  video_path: z.string().optional(),
  duration_ms: z.number().int().min(0).optional(),
})

export const createAnnotationSchema = z.object({
  t_start_ms: z.number().int().min(0),
  t_end_ms: z.number().int().min(0),
  kind: z.enum(['arrow', 'label']),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  angle: z.number().optional(),
  text: z.string().max(100).optional(),
  style: z
    .object({
      color: z.string().optional(),
      fontSize: z.number().optional(),
      strokeWidth: z.number().optional(),
    })
    .optional(),
})

export const updateAnnotationSchema = createAnnotationSchema.partial()
