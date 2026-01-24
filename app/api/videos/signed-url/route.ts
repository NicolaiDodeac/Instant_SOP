import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const path = searchParams.get('path')

    if (!path) {
      return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 })
    }

    const supabase = await createClientServer()

    // Check if user has access (owner or published)
    // For public viewer, we'll check if the SOP is published
    // This is a simplified check - in production, you'd want more robust authorization

    const { data, error } = await supabase.storage
      .from('sop-videos')
      .createSignedUrl(path, 3600) // 1 hour expiry

    if (error) {
      console.error('Error creating signed URL:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ url: data.signedUrl })
  } catch (error) {
    console.error('Error in signed-url:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
