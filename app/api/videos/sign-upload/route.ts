import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient, createClientServer } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    // ✅ 1. Basic authentication check
    const supabase = await createClientServer()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { filename, contentType } = await request.json()

    if (!filename || !contentType) {
      return NextResponse.json(
        { error: 'Missing filename or contentType' },
        { status: 400 }
      )
    }

    const isVideo = contentType.startsWith('video/') && filename.toLowerCase().endsWith('.mp4')
    const isImage =
      (contentType === 'image/jpeg' || contentType === 'image/png' || contentType === 'image/webp') &&
      /\.(jpg|jpeg|png|webp)$/i.test(filename)

    if (
      !isVideo &&
      !isImage
    ) {
      return NextResponse.json(
        { error: 'Invalid file type. Use .mp4 for video or .jpg/.png/.webp for image.' },
        { status: 400 }
      )
    }

    if (
      filename.includes('/') ||
      filename.includes('\\') ||
      filename.includes('..') ||
      filename.length > 255
    ) {
      return NextResponse.json(
        { error: 'Invalid filename format. No path separators allowed.' },
        { status: 400 }
      )
    }

    const serviceSupabase = createServiceRoleClient()
    // Storage policies expect files in format: {userId}/{filename}.mp4
    // The bucket name 'sop-videos' is already specified in .from('sop-videos')
    const storagePath = `${user.id}/${filename}`

    const { data, error } = await serviceSupabase.storage
      .from('sop-videos')
      .createSignedUploadUrl(storagePath, {
        upsert: false,
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
