import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/supabase/server'
import { headObjectExists, presignGetObject } from '@/lib/r2'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const path = searchParams.get('path')

    if (!path) {
      return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 })
    }

    if (path.includes('..') || !path.includes('/')) {
      return NextResponse.json({ error: 'Invalid path format' }, { status: 400 })
    }

    const supabase = await createClientServer()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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

    const { data: stepByThumb, error: stepThumbError } = await supabase
      .from('sop_steps')
      .select('sop_id, sops!inner(owner, published)')
      .eq('thumbnail_path', path)
      .maybeSingle()

    if (stepVideoError) {
      return NextResponse.json({ error: stepVideoError.message }, { status: 500 })
    }
    if (stepImageError) {
      return NextResponse.json({ error: stepImageError.message }, { status: 500 })
    }
    if (stepThumbError) {
      return NextResponse.json({ error: stepThumbError.message }, { status: 500 })
    }

    let isSuperUser = false
    const { data: superRow } = await supabase
      .from('super_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()
    isSuperUser = !!superRow
    if (process.env.SUPER_USER_ID && process.env.SUPER_USER_ID === user.id) isSuperUser = true

    const step = stepByVideo ?? stepByImage ?? stepByThumb

    if (step) {
      const sopsData = step.sops
      const sop = (Array.isArray(sopsData) ? sopsData[0] : sopsData) as
        | { owner: string; published: boolean }
        | null
        | undefined
      if (!sop) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      if (sop.owner !== user.id && !sop.published && !isSuperUser) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else {
      // Draft / not synced: no sop_steps row yet, but R2 key is userId/sopId/stepId/file
      const parts = path.split('/')
      if (parts.length < 4) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      const sopIdFromPath = parts[1]
      const uploader = parts[0]
      const { data: sop } = await supabase
        .from('sops')
        .select('owner, published')
        .eq('id', sopIdFromPath)
        .maybeSingle()
      if (!sop) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      const canReadDraftPath =
        sop.published ||
        (sop.owner === user.id && (uploader === user.id || uploader === sop.owner)) ||
        (isSuperUser && (uploader === sop.owner || uploader === user.id))
      if (!canReadDraftPath) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    let objectKey = path
    if (!(await headObjectExists(path))) {
      const filenameOnly = path.includes('/') ? path.split('/').pop()! : path
      if (filenameOnly && !filenameOnly.includes('..') && (await headObjectExists(filenameOnly))) {
        objectKey = filenameOnly
      } else {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
    }

    try {
      const url = await presignGetObject(objectKey, 3600)
      return NextResponse.json({ url })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (process.env.NODE_ENV === 'development') {
        console.error('Error creating R2 signed URL:', { message: msg, path: objectKey })
      }
      return NextResponse.json(
        { error: msg || 'Failed to create signed URL' },
        { status: 500 }
      )
    }
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
