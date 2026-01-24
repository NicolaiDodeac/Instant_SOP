import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

// export function createClientServer() {
//   const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
//   const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

//   if (!supabaseUrl || !supabaseAnonKey) {
//     throw new Error(
//       'Missing Supabase environment variables. Please create a .env.local file with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. See SETUP_CHECKLIST.md for instructions.'
//     )
//   }

//   if (!supabaseUrl.startsWith('http://') && !supabaseUrl.startsWith('https://')) {
//     throw new Error(
//       `Invalid NEXT_PUBLIC_SUPABASE_URL: "${supabaseUrl}". Must be a valid HTTP or HTTPS URL.`
//     )
//   }

//   const cookieStore = cookies()

//   return createServerClient(supabaseUrl, supabaseAnonKey, {
//     cookies: {
//       getAll() {
//         return cookieStore.getAll()
//       },
//       setAll(cookiesToSet) {
//         try {
//           cookiesToSet.forEach(({ name, value, options }) =>
//             cookieStore.set(name, value, options)
//           )
//         } catch {
//           // The `setAll` method was called from a Server Component.
//           // This can be ignored if you have middleware refreshing
//           // user sessions.
//         }
//       },
//     },
//   })
// }
export async function createClientServer() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables. Please create a .env.local file with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. See SETUP_CHECKLIST.md for instructions.'
    )
  }

  if (!supabaseUrl.startsWith('http://') && !supabaseUrl.startsWith('https://')) {
    throw new Error(
      `Invalid NEXT_PUBLIC_SUPABASE_URL: "${supabaseUrl}". Must be a valid HTTP or HTTPS URL.`
    )
  }

  const cookieStore = await cookies() // ✅ Next 15 fix

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Called from a Server Component; ignore if middleware refreshes sessions.
        }
      },
    },
  })
}

export function createServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase environment variables. Please create a .env.local file with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. See SETUP_CHECKLIST.md for instructions.'
    )
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
