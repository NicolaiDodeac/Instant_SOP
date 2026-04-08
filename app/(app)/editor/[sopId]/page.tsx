import { redirect } from 'next/navigation'
import { getContextTreeForSession } from '@/lib/server/context-tree'
import { EDITOR_DB_SOP_ID_RE, loadEditorSopGate } from '@/lib/server/editor-sop-gate'
import { loadSopRoutingAttachmentsForSession } from '@/lib/server/sop-attachments-read'
import type { ContextTreePayload, SopRoutingAttachments } from '@/lib/types'
import EditorPageClient from './EditorPageClient'

export default async function EditorSopPage({
  params,
}: {
  params: Promise<{ sopId: string }>
}) {
  const { sopId } = await params
  const result = await loadEditorSopGate(sopId)
  if (!result.ok) {
    if (result.error === 'unauthorized') {
      redirect(`/auth/login?next=${encodeURIComponent(`/editor/${sopId}`)}`)
    }
    if (result.error === 'not_editor') {
      redirect('/dashboard')
    }
    redirect('/editor')
  }

  const treeRes = await getContextTreeForSession()
  const initialContextTree: ContextTreePayload | null = treeRes.ok ? treeRes.data : null

  let initialRoutingAttachments: SopRoutingAttachments | null = null
  if (EDITOR_DB_SOP_ID_RE.test(sopId)) {
    const { isSuperUser, userId, sopOwnerId } = result.data
    const canPrefetchAttachments =
      isSuperUser || (sopOwnerId != null && sopOwnerId === userId)
    if (canPrefetchAttachments) {
      const attRes = await loadSopRoutingAttachmentsForSession(sopId)
      if (attRes.ok) {
        initialRoutingAttachments = attRes.data
      }
    }
  }

  return (
    <EditorPageClient
      initialUserId={result.data.userId}
      initialIsSuperUser={result.data.isSuperUser}
      initialContextTree={initialContextTree}
      initialRoutingAttachments={initialRoutingAttachments}
    />
  )
}
