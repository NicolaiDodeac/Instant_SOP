import { redirect } from 'next/navigation'
import { createClientServer } from '@/lib/supabase/server'

export default async function Home() {
  try {
    const supabase = await createClientServer()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      redirect('/dashboard')
    } else {
      redirect('/auth/login')
    }
  } catch (error) {
    // If env vars are missing, show helpful error
    if (error instanceof Error && error.message.includes('Missing Supabase')) {
      throw error // This will show the error page with the message
    }
    throw error
  }
}
