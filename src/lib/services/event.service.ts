import { createClient } from '@/lib/supabase/client'
import type { Event, EventCostume } from '@/types'
import { costumeService } from '@/lib/services/costume.service'

interface RawEventRecord extends Omit<Event, 'coordinator' | 'event_costumes'> {
  coordinator?: Event['coordinator']
  event_costumes?: Event['event_costumes']
}

function extractStartTime(event: RawEventRecord | null): Event {
  if (!event) return event as unknown as Event
  if (event.start_time) return event as Event
  if (event.description && typeof event.description === 'string') {
    const match = event.description.match(/^\[Hora:\s*([0-9]{1,2}:[0-9]{2})\]\s*/i)
    if (match) {
      return {
        ...event,
        start_time: match[1],
        description: event.description.replace(/^\[Hora:\s*([0-9]{1,2}:[0-9]{2})\]\s*/i, '').trim(),
      } as Event
    }
  }
  return event as Event
}

export const eventService = {
  async getAll(): Promise<Event[]> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('events')
      .select(`
        *,
        coordinator:users!events_coordinator_id_fkey(id, full_name),
        event_costumes(
          id,
          costume:costumes(id, name, code, status),
          dancer:users!event_costumes_dancer_id_fkey(id, full_name)
        )
      `)
      .order('date', { ascending: false })

    if (error) throw error
    return ((data || []) as RawEventRecord[]).map(extractStartTime)
  },

  async getById(id: string): Promise<Event | null> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('events')
      .select(`
        *,
        coordinator:users!events_coordinator_id_fkey(id, full_name, email),
        event_costumes(
          id,
          notes,
          costume:costumes(id, name, code, status, category, size),
          dancer:users!event_costumes_dancer_id_fkey(id, full_name, email)
        )
      `)
      .eq('id', id)
      .single()

    if (error) return null
    return extractStartTime(data as RawEventRecord)
  },

  async create(event: Omit<Event, 'id' | 'created_at' | 'updated_at'>): Promise<Event> {
    const supabase = createClient()
    const payload: Record<string, unknown> = { ...event }
    let resultData: RawEventRecord | null = null

    const { data, error } = await supabase
      .from('events')
      .insert(payload)
      .select()
      .single()

    if (error && (error.message?.includes('start_time') || error.code === 'PGRST204')) {
      delete payload.start_time
      if (event.start_time) {
        payload.description = `[Hora: ${event.start_time}] ${event.description || ''}`.trim()
      }
      const retryRes = await supabase.from('events').insert(payload).select().single()
      if (retryRes.error) throw retryRes.error
      resultData = retryRes.data as RawEventRecord
    } else if (error) {
      throw error
    } else {
      resultData = data as RawEventRecord
    }

    return extractStartTime(resultData)
  },

  async update(id: string, updates: Partial<Event>): Promise<Event> {
    const supabase = createClient()
    const payload: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() }
    let resultData: RawEventRecord | null = null

    const { data, error } = await supabase
      .from('events')
      .update(payload)
      .eq('id', id)
      .select()
      .single()

    if (error && (error.message?.includes('start_time') || error.code === 'PGRST204')) {
      delete payload.start_time
      if (updates.start_time !== undefined) {
        payload.description = `[Hora: ${updates.start_time}] ${updates.description || ''}`.trim()
      }
      const retryRes = await supabase
        .from('events')
        .update(payload)
        .eq('id', id)
        .select()
        .single()
      if (retryRes.error) throw retryRes.error
      resultData = retryRes.data as RawEventRecord
    } else if (error) {
      throw error
    } else {
      resultData = data as RawEventRecord
    }

    return extractStartTime(resultData)
  },

  async delete(id: string): Promise<void> {
    const supabase = createClient()
    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) throw error
  },

  async assignCostume(
    eventId: string,
    costumeId: string,
    dancerId?: string,
    notes?: string,
    status: 'borrowed' | 'reserved' = 'reserved',
    userId?: string
  ): Promise<EventCostume> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('event_costumes')
      .upsert(
        { event_id: eventId, costume_id: costumeId, dancer_id: dancerId || null, notes },
        { onConflict: 'event_id,costume_id' }
      )
      .select()
      .single()

    if (error) throw error

    // Update costume status
    await costumeService.updateStatus(
      costumeId,
      status,
      userId || dancerId || 'system',
      {
        eventId,
        dancerId,
        notes,
      }
    )

    return data
  },

  async removeCostume(eventCostumeId: string, costumeId: string): Promise<void> {
    const supabase = createClient()
    const { error } = await supabase
      .from('event_costumes')
      .delete()
      .eq('id', eventCostumeId)

    if (error) throw error

    await supabase
      .from('costumes')
      .update({ status: 'available', current_event_id: null })
      .eq('id', costumeId)
  },
}
