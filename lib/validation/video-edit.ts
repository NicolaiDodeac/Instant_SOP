import { z } from 'zod'

/**
 * POST `/api/videos/cut` — JSON uses `videoPath` (client); server maps to resolver as `videoPathFromBody`.
 */
export const videoCutBodySchema = z
  .object({
    sopId: z.string().trim().min(1).max(255),
    stepId: z.string().trim().min(1).max(255),
    startMs: z.number().finite().min(0),
    endMs: z.number().finite().min(0),
    videoPath: z.string().trim().min(1).max(1024).nullable().optional(),
    async: z.boolean().optional(),
  })
  .refine((v) => v.endMs > v.startMs, { message: 'endMs must be greater than startMs' })

export type VideoCutBody = z.infer<typeof videoCutBodySchema>

export const videoSpeedBodySchema = z
  .object({
    sopId: z.string().trim().min(1).max(255),
    stepId: z.string().trim().min(1).max(255),
    startMs: z.number().finite().min(0),
    endMs: z.number().finite().min(0),
    speedFactor: z.number().finite(),
    videoPath: z.string().trim().min(1).max(1024).nullable().optional(),
    async: z.boolean().optional(),
  })
  .refine((v) => v.endMs > v.startMs, { message: 'endMs must be greater than startMs' })
  .superRefine((v, ctx) => {
    const f = v.speedFactor
    const ok =
      f > 0 &&
      f <= 16 &&
      f !== 1 &&
      ((f > 0 && f < 1) || (f > 1 && f <= 16))
    if (!ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'speedFactor must be between 0 and 1 (slow) or between 1 and 16 (fast), not 1',
        path: ['speedFactor'],
      })
    }
  })

export type VideoSpeedBody = z.infer<typeof videoSpeedBodySchema>

/** POST `/api/videos/sign-upload` */
export const videoSignUploadBodySchema = z.union([
  z.object({
    filename: z.string().trim().min(1).max(255),
    contentType: z.string().trim().min(1).max(255),
  }),
  z.object({
    sopId: z.string().trim().min(1).max(255),
    stepId: z.string().trim().min(1).max(255),
    file: z.enum(['video', 'thumbnail', 'image']),
    videoContentType: z.string().trim().min(1).max(255).optional(),
    imageContentType: z.string().trim().min(1).max(255).optional(),
  }),
])

export type VideoSignUploadBody = z.infer<typeof videoSignUploadBodySchema>
