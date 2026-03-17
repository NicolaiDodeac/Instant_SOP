import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const path = searchParams.get('path')

    if (!path) {
      return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 })
    }

    // Validate path format to prevent path traversal attacks
    // Path should be in format: {userId}/{filename}.mp4 (no sop-videos/ prefix)
    if (path.includes('..') || !path.includes('/')) {
      return NextResponse.json({ error: 'Invalid path format' }, { status: 400 })
    }

    const supabase = await createClientServer()

    // Check if user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user has access by checking the step that owns this media (video or image)
    const { data: stepByVideo, error: stepVideoError } = await supabase
      .from('sop_steps')
      .select('sop_id, sops!inner(owner, published)')
      .eq('video_path', path)
      .maybeSingle()

    const { data: stepByImage, error: stepImageError } = await supabase
      .from('sop_steps')
      .select('sop_id, sops!inner(owner, published)')
      .eq('image_path', path)
      .maybeSingle()

    const step = stepByVideo ?? stepByImage
    const stepError = stepByVideo ? stepVideoError : stepImageError

    if (step && !stepError) {
      const sopsData = step.sops
      const sop = (Array.isArray(sopsData) ? sopsData[0] : sopsData) as { owner: string; published: boolean } | null | undefined
      if (sop) {
        // Check if user is owner or SOP is published
        if (sop.owner !== user.id && !sop.published) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
      }
    }

    // Use service role to create signed URL so any authenticated user who passed
    // the access check above can get a URL. Storage RLS only allows reading when
    // path folder = auth.uid(), which would block editors/viewers from owner's files.
    const filePath = path
    const serviceSupabase = createServiceRoleClient()
    let data: { signedUrl?: string } | null = null
    let error: { message?: string } | null = null

    const result = await serviceSupabase.storage
      .from('sop-videos')
      .createSignedUrl(filePath, 3600)
    data = result.data
    error = result.error

    // Fallback: if not found at userId/filename, try filename at bucket root (legacy or different layout)
    if (error && (error.message === 'Object not found' || error.message?.includes('not found'))) {
      const filenameOnly = path.includes('/') ? path.split('/').pop()! : path
      if (filenameOnly && !filenameOnly.includes('..')) {
        const rootResult = await serviceSupabase.storage
          .from('sop-videos')
          .createSignedUrl(filenameOnly, 3600)
        if (rootResult.data?.signedUrl) {
          return NextResponse.json({ url: rootResult.data.signedUrl })
        }
      }
    }

    if (error) {
      const isNotFound = error.message === 'Object not found' || error.message?.includes('not found')
      if (process.env.NODE_ENV === 'development' && !isNotFound) {
        console.error('Error creating signed URL:', { error: error.message, path: filePath })
      }
      return NextResponse.json(
        { error: error.message || 'Failed to create signed URL' },
        { status: isNotFound ? 404 : 500 }
      )
    }

    if (!data?.signedUrl) {
      return NextResponse.json(
        { error: 'Failed to generate signed URL' },
        { status: 500 }
      )
    }

    return NextResponse.json({ url: data.signedUrl })
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error in signed-url:', error)
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
