import { redirect } from 'next/navigation'
import { loadEditorListGate } from '@/lib/server/editor-list-gate'
import EditorListClient from './EditorListClient'

export default async function EditorListPage() {
  const result = await loadEditorListGate()
  if (!result.ok) {
    if (result.error === 'unauthorized') {
      redirect('/auth/login')
    }
    redirect('/dashboard')
  }
  return (
    <EditorListClient
      initialUserId={result.data.userId}
      initialIsSuperUser={result.data.isSuperUser}
    />
  )
}
