import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api-error-response'
import { resolveIsSuperUser } from '@/lib/auth/resolve-is-super-user'
import { revalidatePublishedShareViewerCache } from '@/lib/server/share-viewer-bundle-cache'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'

/** DELETE: remove an SOP. Caller must be owner or super user. Uses service role so delete always runs. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ sopId: string }> }
) {
  try {
    const { sopId } = await params
    const supabase = await createClientServer()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return apiErrorResponse('Unauthorized', 401, { retryable: false })
    }

    const service = createServiceRoleClient()
    const { data: sop } = await service
      .from('sops')
      .select('owner, share_slug')
      .eq('id', sopId)
      .single()

    if (!sop) {
      return apiErrorResponse('SOP not found', 404, { retryable: false })
    }

    const shareSlug = String((sop as { share_slug: string | null }).share_slug ?? '').trim()

    const isOwner = sop.owner === user.id
    const isSuperUser = await resolveIsSuperUser(service, user.id)

    if (!isOwner && !isSuperUser) {
      return apiErrorResponse(
        'Forbidden: only the owner or a super user can delete this SOP',
        403,
        { retryable: false }
      )
    }

    if (shareSlug) {
      revalidatePublishedShareViewerCache(shareSlug)
    }

    await service.from('sops').delete().eq('id', sopId)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/sops/[sopId] error:', err)
    return apiErrorResponse(err instanceof Error ? err.message : 'Server error', 500)
  }
}
