import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service role no configurado')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function verifyAdminSession() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return null

  const cookieStore = await cookies()
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll() {},
    },
  })

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return null

  // Verificar que el usuario tenga rol 'admin'
  const { data: profile } = await supabase
    .from('users')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || profile.role !== 'admin') return null

  return user
}

export async function GET() {
  const adminUser = await verifyAdminSession()
  if (!adminUser) {
    return NextResponse.json({ error: 'Acceso no autorizado. Se requiere rol de Administrador.' }, { status: 403 })
  }

  const adminClient = getAdminClient()
  const { data, error } = await adminClient
    .from('users')
    .select('id, email, full_name, role, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function PATCH(request: Request) {
  const adminUser = await verifyAdminSession()
  if (!adminUser) {
    return NextResponse.json({ error: 'Acceso no autorizado. Se requiere rol de Administrador.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { userId, full_name, email, role, password } = body || {}

  if (!userId) {
    return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
  }

  const adminClient = getAdminClient()

  // 1. Si se envió una nueva contraseña o email, actualizar en auth.users
  const authUpdates: { password?: string; email?: string; user_metadata?: Record<string, unknown> } = {}
  if (password && typeof password === 'string' && password.trim().length >= 6) {
    authUpdates.password = password.trim()
  }
  if (email && typeof email === 'string' && email.trim().includes('@')) {
    authUpdates.email = email.trim()
  }
  if (full_name) {
    authUpdates.user_metadata = { full_name: full_name.trim(), role }
  }

  if (Object.keys(authUpdates).length > 0) {
    const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, authUpdates)
    if (authUpdateError) {
      return NextResponse.json({ error: `Error en Auth: ${authUpdateError.message}` }, { status: 400 })
    }
  }

  // 2. Actualizar en public.users
  const userTableUpdates: Record<string, unknown> = {}
  if (full_name !== undefined) userTableUpdates.full_name = full_name.trim()
  if (email !== undefined) userTableUpdates.email = email.trim()
  if (role !== undefined) {
    if (!['admin', 'coordinator', 'dancer'].includes(role)) {
      return NextResponse.json({ error: 'Rol no válido' }, { status: 400 })
    }
    userTableUpdates.role = role
  }

  if (Object.keys(userTableUpdates).length > 0) {
    userTableUpdates.updated_at = new Date().toISOString()
    const { error: tableError } = await adminClient
      .from('users')
      .update(userTableUpdates)
      .eq('id', userId)

    if (tableError) {
      return NextResponse.json({ error: `Error en base de datos: ${tableError.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true, message: 'Usuario actualizado correctamente' })
}

export async function POST(request: Request) {
  const adminUser = await verifyAdminSession()
  if (!adminUser) {
    return NextResponse.json({ error: 'Acceso no autorizado. Se requiere rol de Administrador.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { email, password, full_name, role = 'dancer' } = body || {}

  if (!email || !password || !full_name) {
    return NextResponse.json({ error: 'email, password y full_name son requeridos' }, { status: 400 })
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })
  }

  const adminClient = getAdminClient()

  // Crear usuario con admin api
  const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
    email: email.trim(),
    password: password.trim(),
    email_confirm: true,
    user_metadata: {
      full_name: full_name.trim(),
      role: role || 'dancer',
    },
  })

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 })
  }

  // Asegurar registro en public.users
  if (newUser?.user) {
    await adminClient.from('users').upsert({
      id: newUser.user.id,
      email: email.trim(),
      full_name: full_name.trim(),
      role: role || 'dancer',
    })
  }

  return NextResponse.json({ success: true, user: newUser.user })
}

export async function DELETE(request: Request) {
  const adminUser = await verifyAdminSession()
  if (!adminUser) {
    return NextResponse.json({ error: 'Acceso no autorizado. Se requiere rol de Administrador.' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')

  if (!userId) {
    return NextResponse.json({ error: 'userId requerido' }, { status: 400 })
  }

  // Prevenir que el admin se elimine a sí mismo
  if (userId === adminUser.id) {
    return NextResponse.json({ error: 'No puedes eliminar tu propia cuenta de administrador' }, { status: 400 })
  }

  const adminClient = getAdminClient()
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId)
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 })
  }

  // Eliminar también de public.users
  await adminClient.from('users').delete().eq('id', userId)

  return NextResponse.json({ success: true })
}
