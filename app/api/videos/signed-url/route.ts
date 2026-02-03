import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/supabase/server'

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

    // Verify user has access to this video by checking the step that owns it
    const { data: step, error: stepError } = await supabase
      .from('sop_steps')
      .select('sop_id, sops!inner(owner, published)')
      .eq('video_path', path)
      .maybeSingle()

    if (step && !stepError) {
      const sop = step.sops as { owner: string; published: boolean } | null
      if (sop) {
        // Check if user is owner or SOP is published
        if (sop.owner !== user.id && !sop.published) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
      }
    }

    // Create signed URL
    // Path format: '{userId}/{filename}.mp4' (bucket name is already in .from())
    const filePath = path
    
    const { data, error } = await supabase.storage
      .from('sop-videos')
      .createSignedUrl(filePath, 3600) // 1 hour expiry

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error creating signed URL:', {
          error: error.message,
          code: error.statusCode,
          path: filePath,
          originalPath: path,
        })
      }
      return NextResponse.json(
        { 
          error: error.message || 'Failed to create signed URL',
          details: process.env.NODE_ENV === 'development' ? error : undefined
        },
        { status: 500 }
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
