import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient, createClientServer } from '@/lib/supabase/server'

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
    const { filename, contentType, sopId, stepId, file } = body as {
      filename?: string
      contentType?: string
      sopId?: string
      stepId?: string
      file?: 'video' | 'thumbnail' | 'image'
    }

    let storagePath: string

    // New: structured path userId/sopId/stepId/video.mp4, thumbnail.jpg, or image.jpg
    if (sopId != null && stepId != null && file === 'video') {
      if (!isValidSegment(sopId) || !isValidSegment(stepId)) {
        return NextResponse.json(
          { error: 'Invalid sopId or stepId for video upload.' },
          { status: 400 }
        )
      }
      storagePath = `${user.id}/${sopId}/${stepId}/video.mp4`
    } else if (sopId != null && stepId != null && file === 'thumbnail') {
      if (!isValidSegment(sopId) || !isValidSegment(stepId)) {
        return NextResponse.json(
          { error: 'Invalid sopId or stepId for thumbnail upload.' },
          { status: 400 }
        )
      }
      storagePath = `${user.id}/${sopId}/${stepId}/thumbnail.jpg`
    } else if (sopId != null && stepId != null && file === 'image') {
      if (!isValidSegment(sopId) || !isValidSegment(stepId)) {
        return NextResponse.json(
          { error: 'Invalid sopId or stepId for image upload.' },
          { status: 400 }
        )
      }
      storagePath = `${user.id}/${sopId}/${stepId}/image.jpg`
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
    } else {
      return NextResponse.json(
        { error: 'Missing (filename + contentType) or (sopId + stepId + file).' },
        { status: 400 }
      )
    }

    const serviceSupabase = createServiceRoleClient()
    const { data, error } = await serviceSupabase.storage
      .from('sop-videos')
      .createSignedUploadUrl(storagePath, {
        upsert: true,
      })

    if (error) {
      console.error('Error creating signed upload URL:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      signedUrl: data.signedUrl,
      storagePath,
    })
  } catch (error) {
    console.error('Error in sign-upload:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
