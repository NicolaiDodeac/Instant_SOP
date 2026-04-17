import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api-error-response'
import { createClientServer, createServiceRoleClient } from '@/lib/supabase/server'
import { requireSuperUser } from '@/lib/require-super-user-server'
import {
  adminAddEditorBodySchema,
  adminEditorUserIdParamSchema,
} from '@/lib/validation/admin'

export async function GET() {
  const supabase = await createClientServer()
  const check = await requireSuperUser(supabase)
  if (!check.ok) {
    return NextResponse.json(check.json, { status: check.status })
  }

  const service = createServiceRoleClient()
  const { data: rows, error: listError } = await service
    .from('allowed_editors')
    .select('user_id')

  if (listError) {
    return apiErrorResponse(listError.message, 500)
  }

  const editors: { user_id: string; email: string | null }[] = []
  for (const row of rows ?? []) {
    const { data: authUser } = await service.auth.admin.getUserById(row.user_id)
    editors.push({
      user_id: row.user_id,
      email: authUser?.user?.email ?? null,
    })
  }

  return NextResponse.json({ editors })
}

export async function POST(request: NextRequest) {
  const supabase = await createClientServer()
  const check = await requireSuperUser(supabase)
  if (!check.ok) {
    return NextResponse.json(check.json, { status: check.status })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiErrorResponse('Invalid JSON', 400, { retryable: false })
  }

  const parsed = adminAddEditorBodySchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid request body'
    return apiErrorResponse(msg, 400, { retryable: false })
  }

  const email = parsed.data.email

  const service = createServiceRoleClient()
  const { data: list } = await service.auth.admin.listUsers({ perPage: 1000 })
  const authUser = list?.users?.find((u) => u.email?.toLowerCase() === email)

  if (!authUser?.id) {
    return apiErrorResponse(
      'No user found with that email. They must sign in at least once.',
      404,
      { retryable: false }
    )
  }

  const { error: insertError } = await service
    .from('allowed_editors')
    .insert({ user_id: authUser.id })

  if (insertError) {
    if (insertError.code === '23505') {
      return apiErrorResponse('That user is already an editor.', 409, { retryable: false })
    }
    return apiErrorResponse(insertError.message, 500)
  }

  return NextResponse.json({
    added: { user_id: authUser.id, email: authUser.email ?? null },
  })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClientServer()
  const check = await requireSuperUser(supabase)
  if (!check.ok) {
    return NextResponse.json(check.json, { status: check.status })
  }

  const user_id = request.nextUrl.searchParams.get('user_id')
  if (!user_id) {
    return apiErrorResponse('Missing user_id', 400, { retryable: false })
  }

  const parsedUserId = adminEditorUserIdParamSchema.safeParse(user_id)
  if (!parsedUserId.success) {
    return apiErrorResponse('Invalid user_id', 400, { retryable: false })
  }

  const service = createServiceRoleClient()
  const { error } = await service
    .from('allowed_editors')
    .delete()
    .eq('user_id', parsedUserId.data)

  if (error) {
    return apiErrorResponse(error.message, 500)
  }

  return NextResponse.json({ removed: parsedUserId.data })
}
