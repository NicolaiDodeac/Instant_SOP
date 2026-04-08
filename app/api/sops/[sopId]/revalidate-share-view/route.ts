import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'
import { resolveIsSuperUser } from '@/lib/auth/resolve-is-super-user'
import { shareViewerRevalidateTagForShareSlug } from '@/lib/server/share-viewer-bundle-cache'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'

/** Owners/super users: bust Data Cache for `/sop/[share]` after client-side `sops` row updates. */
export async function POST(_: Request, { params }: { params: Promise<{ sopId: string }> }) {
  try {
    const { sopId } = await params
    const supabase = await createClientServer()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const service = createServiceRoleClient()
    const { data: row, error } = await service
      .from('sops')
      .select('owner, share_slug')
      .eq('id', sopId)
      .maybeSingle()

    if (error || !row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const owner = String((row as { owner: string }).owner)
    const isSuper = await resolveIsSuperUser(service, user.id)
    if (owner !== user.id && !isSuper) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const slug = (row as { share_slug: string | null }).share_slug?.trim() ?? ''
    if (slug) {
      revalidateTag(shareViewerRevalidateTagForShareSlug(slug))
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('POST revalidate-share-view:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
