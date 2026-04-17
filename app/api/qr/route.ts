import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { z } from 'zod'
import { createClientServer } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClientServer()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const rawUrl = searchParams.get('url')

  if (!rawUrl) {
    return new NextResponse('Missing url parameter', { status: 400 })
  }

  try {
    const parsedUrl = z.string().trim().min(1).max(2048).safeParse(rawUrl)
    if (!parsedUrl.success) {
      return new NextResponse('Invalid url parameter', { status: 400 })
    }

    // Only allow same-origin URLs (or relative paths) to reduce abuse/phishing risks.
    let target: URL
    try {
      target = new URL(parsedUrl.data, request.nextUrl.origin)
    } catch {
      return new NextResponse('Invalid url parameter', { status: 400 })
    }
    if (target.origin !== request.nextUrl.origin) {
      return new NextResponse('URL must be same-origin', { status: 400 })
    }

    const qrCodeDataUrl = await QRCode.toDataURL(target.toString(), {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    })

    // Convert data URL to buffer
    const base64Data = qrCodeDataUrl.split(',')[1]
    const buffer = Buffer.from(base64Data, 'base64')

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    console.error('Error generating QR code:', error)
    return new NextResponse('Error generating QR code', { status: 500 })
  }
}
