import { createClient } from '@/lib/supabase/client'
import type { Costume, CostumeMovement, CostumeStatus, DamageReport } from '@/types'
import { generateCostumeCode } from '@/utils'

export const costumeService = {
  /**
   * Paginated server-side fetch for the inventory list view.
   * Returns a slice of costumes + total count for infinite scroll.
   */
  async getAllPaginated(options?: {
    status?: CostumeStatus
    search?: string
    page?: number
    pageSize?: number
  }): Promise<{ data: Costume[]; total: number }> {
    const supabase = createClient()
    const PAGE_SIZE = options?.pageSize ?? 60
    const page = options?.page ?? 0
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let query = supabase
      .from('costumes')
      // Lightweight select for list view — no heavy relations
      .select('id, code, name, category, size, status, photos, location, list_items(id, list_id, list:lists(id, name))', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to)

    if (options?.status) query = query.eq('status', options.status)
    if (options?.search) {
      const term = options.search.trim().replace(/[%_'"(),;]/g, '')
      if (term) {
        query = query.or(
          `name.ilike.%${term}%,code.ilike.%${term}%,category.ilike.%${term}%,location.ilike.%${term}%`
        )
      }
    }

    const { data, error, count } = await query
    if (error) throw error

    return { data: (data as unknown as Costume[]) || [], total: count ?? 0 }
  },

  async getAll(filters?: {
    status?: CostumeStatus
    category?: string
    search?: string
  }): Promise<Costume[]> {
    const supabase = createClient()

    // Supabase REST default limit is 1000 rows. We fetch in pages to get all costumes.
    const PAGE_SIZE = 1000
    let page = 0
    const allData: Costume[] = []

    while (true) {
      let query = supabase
        .from('costumes')
        .select(`
          *,
          current_holder:users!costumes_current_holder_id_fkey(id, full_name, email),
          current_event:events!costumes_current_event_id_fkey(id, name, date),
          list_items(id, list_id, list:lists(id, name))
        `)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (filters?.status) query = query.eq('status', filters.status)
      if (filters?.category) query = query.eq('category', filters.category)
      if (filters?.search) {
        const term = filters.search.trim().replace(/[%_'"(),;]/g, '')
        if (term) {
          query = query.or(
            `name.ilike.%${term}%,code.ilike.%${term}%,category.ilike.%${term}%`
          )
        }
      }

      const { data, error } = await query
      if (error) throw error

      const rows = data || []
      allData.push(...(rows as Costume[]))

      // If fewer rows than page size returned, we've reached the last page
      if (rows.length < PAGE_SIZE) break
      page++
    }

    return allData
  },

  async getById(idOrCode: string): Promise<Costume | null> {
    const supabase = createClient()
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrCode)

    let query = supabase
      .from('costumes')
      .select(`
        *,
        current_holder:users!costumes_current_holder_id_fkey(id, full_name, email),
        current_event:events!costumes_current_event_id_fkey(id, name, date),
        list_items(id, list_id, list:lists(id, name))
      `)

    if (isUuid) {
      query = query.or(`id.eq.${idOrCode},code.eq.${idOrCode}`)
    } else {
      query = query.eq('code', idOrCode)
    }

    const { data, error } = await query.maybeSingle()

    if (error) return null
    return data
  },

  async create(costume: Omit<Costume, 'id' | 'created_at' | 'updated_at' | 'code'>): Promise<Costume> {
    const supabase = createClient()
    const code = generateCostumeCode()
    const qrToken = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

    const insertPayload: Record<string, unknown> = {
      ...costume,
      code,
      status: 'available',
      qr_token: qrToken,
    }

    let { data, error } = await supabase
      .from('costumes')
      .insert(insertPayload)
      .select()
      .single()

    if (error) {
      const message = error.message || ''
      const isQrTokenMissing = message.includes('qr_token') || message.includes("Could not find the 'qr_token' column")

      if (isQrTokenMissing) {
        delete insertPayload.qr_token
        const retryResult = await supabase
          .from('costumes')
          .insert(insertPayload)
          .select()
          .single()

        data = retryResult.data
        error = retryResult.error
      }
    }

    if (error) throw error
    return data
  },

  async createMany(costumes: Omit<Costume, 'id' | 'created_at' | 'updated_at' | 'code' | 'qr_token'>[]): Promise<Costume[]> {
    const supabase = createClient()
    const insertPayloads = costumes.map((c, index) => {
      const baseCode = generateCostumeCode()
      const code = `${baseCode}-${index + 1}`
      const qrToken = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${index}`
      return {
        ...c,
        code,
        status: c.status || 'available',
        qr_token: qrToken,
      }
    })

    let { data, error } = await supabase
      .from('costumes')
      .insert(insertPayloads)
      .select()

    if (error) {
      const message = error.message || ''
      const isQrTokenMissing = message.includes('qr_token') || message.includes("Could not find the 'qr_token' column")

      if (isQrTokenMissing) {
        const cleanedPayloads = insertPayloads.map(payload => {
          const { qr_token, ...rest } = payload
          return rest
        })
        const retryResult = await supabase
          .from('costumes')
          .insert(cleanedPayloads)
          .select()

        data = retryResult.data
        error = retryResult.error
      }
    }

    if (error) throw error
    return data || []
  },

  async update(id: string, updates: Partial<Costume>): Promise<Costume> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('costumes')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async updateStatus(
    costumeId: string,
    status: CostumeStatus,
    userId: string,
    options?: {
      eventId?: string
      dancerId?: string
      notes?: string
      photoUrl?: string
      action?: string
    }
  ): Promise<void> {
    const supabase = createClient()

    // Determine action based on status
    const actionMap: Record<CostumeStatus, string> = {
      available: 'return',
      borrowed: 'checkout',
      reserved: 'status_change',
      washing: 'send_wash',
      repair: 'send_repair',
      lost: 'mark_lost',
    }
    const currentAction = options?.action || actionMap[status]

    // Fetch list items containing this costume to adjust stock
    const { data: listItems } = await supabase
      .from('list_items')
      .select('id, stock')
      .eq('costume_id', costumeId)

    const finalStatus = status

    if (listItems && listItems.length > 0) {
      for (const item of listItems) {
        let newStock = item.stock
        if (currentAction === 'checkout' || currentAction === 'send_wash' || currentAction === 'send_repair' || currentAction === 'mark_lost') {
          newStock = Math.max(0, item.stock - 1)
        } else if (currentAction === 'return') {
          newStock = item.stock + 1
        }

        if (newStock !== item.stock) {
          const { error: stockErr } = await supabase
            .from('list_items')
            .update({ stock: newStock })
            .eq('id', item.id)
          if (stockErr) console.error('Error updating stock:', stockErr)
        }
      }
    }

    const updates: Partial<Costume> = {
      status: finalStatus,
      updated_at: new Date().toISOString(),
    }

    if (finalStatus === 'borrowed') {
      updates.current_holder_id = options?.dancerId || userId
      if (options?.eventId) updates.current_event_id = options.eventId
    } else if (finalStatus === 'available') {
      // Fetch current event before clearing it, so we can remove from event_costumes
      const { data: currentCostume } = await supabase
        .from('costumes')
        .select('current_event_id')
        .eq('id', costumeId)
        .single()

      const currentEventId = currentCostume?.current_event_id

      updates.current_holder_id = undefined
      updates.current_event_id = undefined

      // Update costume first
      const { error: costumeError } = await supabase
        .from('costumes')
        .update(updates)
        .eq('id', costumeId)

      if (costumeError) throw costumeError

      // Remove from event_costumes (so it disappears from the event's list)
      if (currentEventId) {
        const { error: ecErr } = await supabase
          .from('event_costumes')
          .delete()
          .eq('costume_id', costumeId)
          .eq('event_id', currentEventId)
        if (ecErr) console.error('Error removing event_costumes on return:', ecErr)
      }

      // Record movement
      const { error: movementError } = await supabase
        .from('costume_movements')
        .insert({
          costume_id: costumeId,
          user_id: userId,
          event_id: currentEventId || options?.eventId,
          action: currentAction,
          notes: options?.notes,
          photo_url: options?.photoUrl,
        })

      if (movementError) throw movementError
      return
    } else if (finalStatus === 'reserved' && options?.eventId) {
      updates.current_event_id = options.eventId
      if (options?.dancerId) updates.current_holder_id = options.dancerId
    }

    // Update costume
    const { error: costumeError } = await supabase
      .from('costumes')
      .update(updates)
      .eq('id', costumeId)

    if (costumeError) throw costumeError

    // Upsert into event_costumes if eventId is provided
    if (options?.eventId) {
      const { error: eventCostumeErr } = await supabase
        .from('event_costumes')
        .upsert(
          {
            event_id: options.eventId,
            costume_id: costumeId,
            dancer_id: options?.dancerId || null,
            notes: options?.notes || null,
          },
          { onConflict: 'event_id,costume_id' }
        )
      if (eventCostumeErr) console.error('Error upserting event_costumes:', eventCostumeErr)
    }

    // Record movement
    const { error: movementError } = await supabase
      .from('costume_movements')
      .insert({
        costume_id: costumeId,
        user_id: userId,
        event_id: options?.eventId,
        action: currentAction,
        notes: options?.notes,
        photo_url: options?.photoUrl,
      })

    if (movementError) throw movementError
  },

  async getHistory(costumeId: string): Promise<CostumeMovement[]> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('costume_movements')
      .select(`
        *,
        user:users!costume_movements_user_id_fkey(id, full_name, email),
        event:events!costume_movements_event_id_fkey(id, name)
      `)
      .eq('costume_id', costumeId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  async reportDamage(report: {
    costume_id: string
    reported_by: string
    description: string
    severity: 'low' | 'medium' | 'high'
    photo_url?: string
    movement_id?: string
  }): Promise<DamageReport> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('damage_reports')
      .insert(report)
      .select()
      .single()

    if (error) throw error

    // Record movement
    await supabase.from('costume_movements').insert({
      costume_id: report.costume_id,
      user_id: report.reported_by,
      action: 'damage_report',
      notes: report.description,
      photo_url: report.photo_url,
    })

    return data
  },

  async uploadPhoto(file: File, costumeId: string): Promise<string> {
    const supabase = createClient()
    const filename = `costumes/${costumeId}/${Date.now()}-${file.name}`
    const { data, error } = await supabase.storage
      .from('costume-photos')
      .upload(filename, file)

    if (error) throw error

    const { data: urlData } = supabase.storage
      .from('costume-photos')
      .getPublicUrl(data.path)

    return urlData.publicUrl
  },

  async addPhoto(costumeId: string, file: File): Promise<Costume> {
    const supabase = createClient()

    // 1. Upload file to storage
    const photoUrl = await this.uploadPhoto(file, costumeId)

    // 2. Get current photos array
    const { data: current, error: fetchError } = await supabase
      .from('costumes')
      .select('photos')
      .eq('id', costumeId)
      .single()

    if (fetchError) throw fetchError

    const existingPhotos: string[] = current?.photos || []
    const newPhotos = [...existingPhotos, photoUrl]

    // 3. Update costume record
    const { data, error } = await supabase
      .from('costumes')
      .update({ photos: newPhotos, updated_at: new Date().toISOString() })
      .eq('id', costumeId)
      .select(`
        *,
        current_holder:users!costumes_current_holder_id_fkey(id, full_name, email),
        current_event:events!costumes_current_event_id_fkey(id, name, date)
      `)
      .single()

    if (error) throw error
    return data
  },

  async removePhoto(costumeId: string, photoUrl: string): Promise<Costume> {
    const supabase = createClient()

    // 1. Get current photos array
    const { data: current, error: fetchError } = await supabase
      .from('costumes')
      .select('photos')
      .eq('id', costumeId)
      .single()

    if (fetchError) throw fetchError

    const existingPhotos: string[] = current?.photos || []
    const newPhotos = existingPhotos.filter((p) => p !== photoUrl)

    // 2. Update costume record
    const { data, error } = await supabase
      .from('costumes')
      .update({ photos: newPhotos, updated_at: new Date().toISOString() })
      .eq('id', costumeId)
      .select(`
        *,
        current_holder:users!costumes_current_holder_id_fkey(id, full_name, email),
        current_event:events!costumes_current_event_id_fkey(id, name, date)
      `)
      .single()

    if (error) throw error
    return data
  },

  async getDashboardStats() {
    const supabase = createClient()
    const { data: costumes, error } = await supabase
      .from('costumes')
      .select('id, status, name, updated_at')

    if (error) throw error

    const stats = {
      total: costumes?.length || 0,
      available: costumes?.filter((c) => c.status === 'available').length || 0,
      borrowed: costumes?.filter((c) => c.status === 'borrowed').length || 0,
      washing: costumes?.filter((c) => c.status === 'washing').length || 0,
      repair: costumes?.filter((c) => c.status === 'repair').length || 0,
      lost: costumes?.filter((c) => c.status === 'lost').length || 0,
      reserved: costumes?.filter((c) => c.status === 'reserved').length || 0,
    }

    return stats
  },

  async delete(id: string): Promise<void> {
    const response = await fetch(`/api/costumes/${id}`, {
      method: 'DELETE',
    })

    const result = await response.json()
    if (!response.ok) {
      throw new Error(result?.error || 'Error al eliminar el vestuario')
    }
  },
}
