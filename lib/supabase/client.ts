'use client'

import { createBrowserClient } from '@supabase/ssr'
import { useMemo } from 'react'

// Singleton instance to avoid multiple GoTrueClient instances
let supabaseClientInstance: ReturnType<typeof createBrowserClient> | null = null

function getSupabaseClient() {
  if (typeof window === 'undefined') {
    throw new Error('Supabase client can only be used on the client side')
  }

  if (supabaseClientInstance) {
    return supabaseClientInstance
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables. Please create a .env.local file with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. See SETUP_CHECKLIST.md for instructions.'
    )
  }

  // Use @supabase/ssr for browser to ensure cookies are set properly
  supabaseClientInstance = createBrowserClient(supabaseUrl, supabaseAnonKey)

  return supabaseClientInstance
}

// Hook version for React components (ensures single instance per component)
export function useSupabaseClient() {
  return useMemo(() => {
    if (typeof window === 'undefined') {
      return null as any // Return null during SSR, will be set on client
    }
    return getSupabaseClient()
  }, [])
}

// Direct function for non-component usage
export function createClient() {
  return getSupabaseClient()
}
