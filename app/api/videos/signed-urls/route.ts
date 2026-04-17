import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api-error-response'
import { resolveIsSuperUser } from '@/lib/auth/resolve-is-super-user'
import { createClientServer } from '@/lib/supabase/server'
import { presignGetForVideoPath } from '@/lib/presign-video-path'
import { z } from 'zod'

const MAX_PATHS = 64

const signedUrlsBodySchema = z.object({
  paths: z
    .array(z.string().trim().min(1).max(2048))
    .min(1)
    .max(MAX_PATHS)
    .superRefine((paths, ctx) => {
      for (const [idx, p] of paths.entries()) {
        if (p.includes('..')) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Invalid path',
            path: [idx],
          })
        }
      }
    }),
})

/**
 * Batch presign for viewer pages: one round trip, same access checks as GET /api/videos/signed-url.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClientServer()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    const userId = user?.id ?? ''
    const isSuperUser = user?.id ? await resolveIsSuperUser(supabase, user.id) : false

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiErrorResponse('Invalid JSON', 400, { retryable: false })
    }

    const parsed = signedUrlsBodySchema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Invalid request body'
      return apiErrorResponse(msg, 400, { retryable: false })
    }

    const unique = [...new Set(parsed.data.paths)]

    const urls: Record<string, string | null> = {}
    await Promise.all(
      unique.map(async (path) => {
        const result = await presignGetForVideoPath(supabase, userId, isSuperUser, path)
        urls[path] = result.ok ? result.url : null
      })
    )

    return NextResponse.json({ urls })
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error in signed-urls:', error)
    }
    return apiErrorResponse('Internal server error', 500)
  }
}
