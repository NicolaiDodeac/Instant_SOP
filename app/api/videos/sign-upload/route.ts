import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api-error-response'
import { createClientServer } from '@/lib/supabase/server'
import { presignPutObject } from '@/lib/r2'
import { videoSignUploadBodySchema } from '@/lib/validation/video-edit'

/** Allow UUID or nanoid (alphanumeric + hyphens). No path traversal. */
function isValidSegment(s: string): boolean {
  if (typeof s !== 'string' || s.length === 0 || s.length > 255) return false
  return !s.includes('/') && !s.includes('\\') && !s.includes('..') && /^[a-zA-Z0-9_-]+$/.test(s)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClientServer()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return apiErrorResponse('Unauthorized', 401, { retryable: false })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiErrorResponse('Invalid JSON', 400, { retryable: false })
    }

    const parsed = videoSignUploadBodySchema.safeParse(body)
    if (!parsed.success) {
      return apiErrorResponse('Invalid request body', 400, { retryable: false })
    }

    let storagePath: string
    let putContentType: string | undefined

    // New: structured path userId/sopId/stepId/video.mp4, thumbnail.jpg, or image.jpg
    if ('file' in parsed.data && parsed.data.file === 'video') {
      const { sopId, stepId, videoContentType } = parsed.data
      if (!isValidSegment(sopId) || !isValidSegment(stepId)) {
        return apiErrorResponse('Invalid sopId or stepId for video upload.', 400, {
          retryable: false,
        })
      }
      storagePath = `${user.id}/${sopId}/${stepId}/video.mp4`
      putContentType =
        typeof videoContentType === 'string' && videoContentType.startsWith('video/')
          ? videoContentType
          : 'video/mp4'
    } else if ('file' in parsed.data && parsed.data.file === 'thumbnail') {
      const { sopId, stepId } = parsed.data
      if (!isValidSegment(sopId) || !isValidSegment(stepId)) {
        return apiErrorResponse('Invalid sopId or stepId for thumbnail upload.', 400, {
          retryable: false,
        })
      }
      storagePath = `${user.id}/${sopId}/${stepId}/thumbnail.jpg`
      putContentType = 'image/jpeg'
    } else if ('file' in parsed.data && parsed.data.file === 'image') {
      const { sopId, stepId, imageContentType } = parsed.data
      if (!isValidSegment(sopId) || !isValidSegment(stepId)) {
        return apiErrorResponse('Invalid sopId or stepId for image upload.', 400, {
          retryable: false,
        })
      }
      storagePath = `${user.id}/${sopId}/${stepId}/image.jpg`
      putContentType =
        typeof imageContentType === 'string' && imageContentType.startsWith('image/')
          ? imageContentType
          : 'image/jpeg'
    } else if ('filename' in parsed.data) {
      const { filename, contentType } = parsed.data
      // Legacy: single filename (userId/filename)
      if (
        !filename.endsWith('.mp4') ||
        filename.includes('/') ||
        filename.includes('\\') ||
        filename.includes('..') ||
        filename.length > 255
      ) {
        return apiErrorResponse(
          'Invalid filename format. Must be a .mp4 file with no path separators.',
          400,
          { retryable: false }
        )
      }
      storagePath = `${user.id}/${filename}`
      putContentType = contentType
    } else {
      return apiErrorResponse(
        'Missing (filename + contentType) or (sopId + stepId + file).',
        400,
        { retryable: false }
      )
    }

    const signedUrl = await presignPutObject(storagePath, { contentType: putContentType })

    return NextResponse.json({
      signedUrl,
      storagePath,
    })
  } catch (error) {
    console.error('Error in sign-upload:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return apiErrorResponse(message, 500)
  }
}
