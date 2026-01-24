import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { filename, contentType } = await request.json()

    if (!filename || !contentType) {
      return NextResponse.json(
        { error: 'Missing filename or contentType' },
        { status: 400 }
      )
    }

    const supabase = createServiceRoleClient()
    const storagePath = `sop-videos/${filename}`

    const { data, error } = await supabase.storage
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
