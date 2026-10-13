import type { List, ListItem, Costume } from '@/types'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

function assertSupabaseEnv() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Supabase no configurado')
  }
}

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseClient>>

async function createSupabaseClient() {
  assertSupabaseEnv()
  if (typeof window === 'undefined') {
    const { cookies } = await import('next/headers')
    const { createServerClient } = await import('@supabase/ssr')
    const cookieStore = await cookies()

    return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          return undefined
        },
      },
    })
  }

  const { createClient } = await import('@/lib/supabase/client')
  return createClient()
}

async function apiFetch<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  })

  // Try to parse JSON; if response is not JSON (e.g. HTML error page), capture text for debugging.
  // Use `res.clone()` so we can safely read the body twice.
  let payload: unknown = null
  const clone = res.clone()
  try {
    payload = await res.json()
  } catch {
    const text = await clone.text()
    throw new Error(`Non-JSON response (status=${res.status}): ${text.slice(0, 1000)}`)
  }

  if (!res.ok) {
    if (typeof payload === 'object' && payload !== null) {
      const p = payload as Record<string, unknown>
      const msg = typeof p.error === 'string' ? p.error : typeof p.message === 'string' ? p.message : `Request failed with status ${res.status}`
      throw new Error(msg)
    }
    throw new Error(`Request failed with status ${res.status}`)
  }

  return payload as T
}

export const listService = {
  async getById(id: string): Promise<List | null> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    if (!isUuid) return null

    const supabase = await createSupabaseClient()
    const { data: list, error: listError } = await supabase
      .from('lists')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (listError) return null
    if (!list) return null

    const { data: items, error: itemsError } = await supabase
      .from('list_items')
      .select('*, costume:costumes(*)')
      .eq('list_id', id)

    if (itemsError) {
      // still return list without items
      return { ...list }
    }

    // Map items to expected shape
    type RawItem = {
      id: string
      list_id: string
      costume_id: string
      stock: number
      created_at: string
      costume?: Costume
    }
    const mapped: ListItem[] = ((items || []) as RawItem[]).map((it) => ({
      id: it.id,
      list_id: it.list_id,
      costume_id: it.costume_id,
      stock: it.stock || 0,
      created_at: it.created_at,
      costume: it.costume as Costume | undefined,
    }))

    return { ...list, items: mapped }
  },
  async create(payload: { name: string; description?: string }): Promise<List> {
    return apiFetch<List>('/api/lists', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async update(id: string, updates: { name?: string; description?: string }): Promise<List> {
    return apiFetch<List>('/api/lists', {
      method: 'PATCH',
      body: JSON.stringify({ id, ...updates }),
    })
  },

  async addItem(listId: string, costumeId: string, stock = 1) {
    return apiFetch<ListItem>('/api/list-items', {
      method: 'POST',
      body: JSON.stringify({ listId, costumeId, stock }),
    })
  },

  async updateItemStock(itemId: string, stock: number) {
    return apiFetch<ListItem>('/api/list-items', {
      method: 'PATCH',
      body: JSON.stringify({ itemId, stock }),
    })
  },

  async removeItem(itemId: string) {
    await apiFetch<{ success: boolean }>('/api/list-items', {
      method: 'DELETE',
      body: JSON.stringify({ itemId }),
    })
    return true
  },

  async delete(id: string): Promise<void> {
    await apiFetch<{ success: boolean }>(`/api/lists/${id}`, {
      method: 'DELETE',
    })
  },

  async getAll(): Promise<List[]> {
    const supabase = await createSupabaseClient()
    const { data, error } = await supabase.from('lists').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },
}
