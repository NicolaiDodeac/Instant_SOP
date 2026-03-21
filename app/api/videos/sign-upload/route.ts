import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/supabase/server'
import { presignPutObject } from '@/lib/r2'

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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { filename, contentType, sopId, stepId, file, videoContentType, imageContentType } =
      body as {
        filename?: string
        contentType?: string
        sopId?: string
        stepId?: string
        file?: 'video' | 'thumbnail' | 'image'
        /** Must match the Content-Type header on the browser PUT to R2 (SigV4). */
        videoContentType?: string
        /** For file=image — must match the PUT Content-Type (e.g. image/jpeg, image/png). */
        imageContentType?: string
      }

    let storagePath: string
    let putContentType: string | undefined

    // New: structured path userId/sopId/stepId/video.mp4, thumbnail.jpg, or image.jpg
    if (sopId != null && stepId != null && file === 'video') {
      if (!isValidSegment(sopId) || !isValidSegment(stepId)) {
        return NextResponse.json(
          { error: 'Invalid sopId or stepId for video upload.' },
          { status: 400 }
        )
      }
      storagePath = `${user.id}/${sopId}/${stepId}/video.mp4`
      putContentType =
        typeof videoContentType === 'string' && videoContentType.startsWith('video/')
          ? videoContentType
          : 'video/mp4'
    } else if (sopId != null && stepId != null && file === 'thumbnail') {
      if (!isValidSegment(sopId) || !isValidSegment(stepId)) {
        return NextResponse.json(
          { error: 'Invalid sopId or stepId for thumbnail upload.' },
          { status: 400 }
        )
      }
      storagePath = `${user.id}/${sopId}/${stepId}/thumbnail.jpg`
      putContentType = 'image/jpeg'
    } else if (sopId != null && stepId != null && file === 'image') {
      if (!isValidSegment(sopId) || !isValidSegment(stepId)) {
        return NextResponse.json(
          { error: 'Invalid sopId or stepId for image upload.' },
          { status: 400 }
        )
      }
      storagePath = `${user.id}/${sopId}/${stepId}/image.jpg`
      putContentType =
        typeof imageContentType === 'string' && imageContentType.startsWith('image/')
          ? imageContentType
          : 'image/jpeg'
    } else if (filename && contentType) {
      // Legacy: single filename (userId/filename)
      if (
        !filename.endsWith('.mp4') ||
        filename.includes('/') ||
        filename.includes('\\') ||
        filename.includes('..') ||
        filename.length > 255
      ) {
        return NextResponse.json(
          { error: 'Invalid filename format. Must be a .mp4 file with no path separators.' },
          { status: 400 }
        )
      }
      storagePath = `${user.id}/${filename}`
      putContentType = contentType
    } else {
      return NextResponse.json(
        { error: 'Missing (filename + contentType) or (sopId + stepId + file).' },
        { status: 400 }
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
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
