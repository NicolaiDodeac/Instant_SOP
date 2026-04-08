import { redirect } from 'next/navigation'
import { loadDashboardBootstrap } from '@/lib/server/dashboard-bootstrap'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const result = await loadDashboardBootstrap()
  if (!result.ok) {
    redirect('/auth/login')
  }
  const { isEditor, isSuperUser, trainingModules } = result.data
  return (
    <DashboardClient
      initialIsEditor={isEditor}
      initialIsSuperUser={isSuperUser}
      initialTrainingModules={trainingModules}
    />
  )
}
