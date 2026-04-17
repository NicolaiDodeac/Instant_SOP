import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api-error-response'
import { resolveIsSuperUser } from '@/lib/auth/resolve-is-super-user'
import { revalidatePublishedShareViewerCache } from '@/lib/server/share-viewer-bundle-cache'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'

/** Owners/super users: bust Data + route cache for `/sop/[share]` after client-side `sops` row updates. */
export async function POST(_: Request, { params }: { params: Promise<{ sopId: string }> }) {
  try {
    const { sopId } = await params
    const supabase = await createClientServer()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return apiErrorResponse('Unauthorized', 401, { retryable: false })
    }

    const service = createServiceRoleClient()
    const { data: row, error } = await service
      .from('sops')
      .select('owner, share_slug')
      .eq('id', sopId)
      .maybeSingle()

    if (error || !row) {
      return apiErrorResponse('Not found', 404, { retryable: false })
    }

    const owner = String((row as { owner: string }).owner)
    const isSuper = await resolveIsSuperUser(service, user.id)
    if (owner !== user.id && !isSuper) {
      return apiErrorResponse('Forbidden', 403, { retryable: false })
    }

    const slug = (row as { share_slug: string | null }).share_slug?.trim() ?? ''
    if (slug) {
      revalidatePublishedShareViewerCache(slug)
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('POST revalidate-share-view:', e)
    return apiErrorResponse('Server error', 500)
  }
}
