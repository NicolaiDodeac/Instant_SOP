import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { resolveEditorFlags } from '@/lib/auth/resolve-editor-flags'
import { sanitizeInternalReturnPath } from '@/lib/sanitize-return-to'
import { getServerAuthSession } from '@/lib/server/auth-session'
import { loadPublicSopViewerPayload } from '@/lib/server/public-sop-viewer'
import PublicSopViewerClient from './PublicSopViewerClient'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ share: string }>
}): Promise<Metadata> {
  const { share } = await params
  const { user } = await getServerAuthSession()
  if (!user) {
    return { title: 'Sign in' }
  }
  const data = await loadPublicSopViewerPayload(share)
  if (!data) {
    return { title: 'SOP' }
  }
  const t = data.sop.sop_number != null ? `SOP ${data.sop.sop_number} — ${data.sop.title}` : data.sop.title
  return { title: t, description: data.sop.description ?? undefined }
}

function firstSearchParam(
  sp: Record<string, string | string[] | undefined> | undefined,
  key: string
): string | undefined {
  const v = sp?.[key]
  if (v == null) return undefined
  return Array.isArray(v) ? v[0] : v
}

export default async function PublicViewerPage({
  params,
  searchParams,
}: {
  params: Promise<{ share: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { share } = await params
  const sp = searchParams ? await searchParams : undefined
  const { supabase, user } = await getServerAuthSession()
  if (!user) {
    const returnTo = sanitizeInternalReturnPath(firstSearchParam(sp, 'returnTo'))
    const path =
      returnTo != null
        ? `/sop/${encodeURIComponent(share)}?returnTo=${encodeURIComponent(returnTo)}`
        : `/sop/${encodeURIComponent(share)}`
    redirect(`/auth/login?next=${encodeURIComponent(path)}`)
  }

  const data = await loadPublicSopViewerPayload(share)
  if (!data) {
    notFound()
  }

  const fromQuery = sanitizeInternalReturnPath(firstSearchParam(sp, 'returnTo'))
  let returnTo = fromQuery
  if (returnTo == null) {
    const { isEditor, isSuperUser } = await resolveEditorFlags(supabase, user.id)
    const isOwner = data.sop.owner === user.id
    if (isEditor && (isSuperUser || isOwner)) {
      returnTo = `/editor/${data.sop.id}`
    }
  }

  return <PublicSopViewerClient shareSlug={share} isLoggedIn returnTo={returnTo} {...data} />
}
