import { redirect } from 'next/navigation'
import { getServerAuthSession } from '@/lib/server/auth-session'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user } = await getServerAuthSession()

  if (!user) {
    redirect('/auth/login')
  }

  return <>{children}</>
}
