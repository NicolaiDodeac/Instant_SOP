import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api-error-response'
import { resolveIsSuperUser } from '@/lib/auth/resolve-is-super-user'
import { createClientServer } from '@/lib/supabase/server'
import { presignGetForVideoPath } from '@/lib/presign-video-path'
import { z } from 'zod'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const path = searchParams.get('path')

    if (!path) {
      return apiErrorResponse('Missing path parameter', 400, { retryable: false })
    }

    const parsedPath = z
      .string()
      .trim()
      .min(1)
      .max(2048)
      .refine((p) => !p.includes('..'), { message: 'Invalid path parameter' })
      .safeParse(path)
    if (!parsedPath.success) {
      return apiErrorResponse('Invalid path parameter', 400, { retryable: false })
    }

    const supabase = await createClientServer()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    const userId = user?.id ?? ''
    const isSuperUser = user?.id ? await resolveIsSuperUser(supabase, user.id) : false
    const result = await presignGetForVideoPath(supabase, userId, isSuperUser, parsedPath.data)

    if (!result.ok) {
      return apiErrorResponse(result.error, result.status, {
        retryable: result.status >= 500,
      })
    }

    return NextResponse.json({ url: result.url })
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error in signed-url:', error)
    }
    return apiErrorResponse('Internal server error', 500)
  }
}
