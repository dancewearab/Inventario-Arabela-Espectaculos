'use client'

import { useState, useEffect, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Calendar, Clock, MapPin, Shirt, User, X, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/ui/status-badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { eventService } from '@/lib/services/event.service'
import { costumeService } from '@/lib/services/costume.service'
import { authService } from '@/lib/services/auth.service'
import { useUser } from '@/hooks/use-user'
import { formatDate } from '@/utils'
import type { Event, Costume, User as UserType } from '@/types'
import { toast } from 'sonner'
import Link from 'next/link'

function AssignCostumeModal({
  eventId,
  userId,
  onSuccess,
  onClose,
}: {
  eventId: string
  userId?: string
  onSuccess: () => void
  onClose: () => void
}) {
  const [costumes, setCostumes] = useState<Costume[]>([])
  const [users, setUsers] = useState<UserType[]>([])
  const [search, setSearch] = useState('')
  const [selectedCostume, setSelectedCostume] = useState('')
  const [selectedDancer, setSelectedDancer] = useState('')
  const [actionType, setActionType] = useState<'checkout' | 'reserve'>('checkout')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [c, u] = await Promise.all([
          costumeService.getAll(),
          authService.getUsers(),
        ])
        // Filter costumes that are available or reserved for this event
        setCostumes(c.filter((item) => item.status === 'available' || item.status === 'reserved'))
        setUsers(u)
      } finally {
        setFetching(false)
      }
    }
    load()
  }, [])

  const filtered = costumes.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase())
  )

  const handleAssign = async () => {
    if (!selectedCostume) { toast.error('Selecciona un vestuario'); return }
    if (actionType === 'checkout' && !selectedDancer) {
      toast.error('Selecciona el bailarín al que entregas el vestuario')
      return
    }
    try {
      setLoading(true)
      const statusToSet = actionType === 'checkout' ? 'borrowed' : 'reserved'
      await eventService.assignCostume(
        eventId,
        selectedCostume,
        selectedDancer || undefined,
        undefined,
        statusToSet,
        userId
      )
      toast.success(actionType === 'checkout' ? 'Vestuario retirado y asignado' : 'Vestuario reservado')
      onSuccess()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al procesar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Retirar / Asignar vestuario a evento</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Modo de asignación</Label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              <button
                type="button"
                onClick={() => setActionType('checkout')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold border text-center transition-all ${
                  actionType === 'checkout'
                    ? 'bg-amber-50 border-amber-300 text-amber-800 ring-2 ring-amber-200'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                🔴 Retirar ahora (Prestado)
              </button>
              <button
                type="button"
                onClick={() => setActionType('reserve')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold border text-center transition-all ${
                  actionType === 'reserve'
                    ? 'bg-blue-50 border-blue-300 text-blue-800 ring-2 ring-blue-200'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                🔵 Reservar para el evento
              </button>
            </div>
          </div>

          <div>
            <Label>Buscar vestuario</Label>
            <Input
              className="mt-1.5"
              placeholder="Nombre o código..."
              leftIcon={<Search className="w-4 h-4" />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="border border-gray-100 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
            {fetching ? (
              <div className="p-4 text-center text-sm text-gray-400">Cargando vestuarios...</div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-400">Sin vestuarios disponibles</div>
            ) : (
              filtered.map((costume) => (
                <button
                  key={costume.id}
                  onClick={() => setSelectedCostume(costume.id)}
                  className={`w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 ${
                    selectedCostume === costume.id ? 'bg-violet-50' : ''
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                    selectedCostume === costume.id ? 'border-violet-600 bg-violet-600' : 'border-gray-300'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{costume.name}</p>
                    <p className="text-xs text-gray-400">{costume.code} · {costume.category} · {costume.size}</p>
                  </div>
                  <StatusBadge status={costume.status} size="sm" />
                </button>
              ))
            )}
          </div>

          <div>
            <Label>Bailarín asignado {actionType === 'checkout' ? '*' : '(opcional)'}</Label>
            <Select value={selectedDancer || 'none'} onValueChange={(v) => setSelectedDancer(v === 'none' ? '' : v)}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Selecciona el bailarín" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin asignar</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={handleAssign} loading={loading} disabled={!selectedCostume}>
            <Plus className="w-4 h-4" />
            {actionType === 'checkout' ? 'Confirmar Retiro' : 'Confirmar Reserva'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { user } = useUser()
  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAssign, setShowAssign] = useState(false)

  const fetchEvent = useCallback(async () => {
    try {
      setLoading(true)
      const data = await eventService.getById(id)
      setEvent(data)
    } catch {
      toast.error('Error al cargar el evento')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchEvent() }, [fetchEvent])

  const handleRemoveCostume = async (eventCostumeId: string, costumeId: string) => {
    if (!confirm('¿Quitar este vestuario del evento?')) return
    try {
      await eventService.removeCostume(eventCostumeId, costumeId)
      toast.success('Vestuario removido del evento')
      fetchEvent()
    } catch {
      toast.error('Error al remover')
    }
  }

  const handleQuickCheckout = async (costumeId: string, dancerId?: string) => {
    if (!user) return
    try {
      await costumeService.updateStatus(costumeId, 'borrowed', user.id, {
        eventId: event!.id,
        dancerId: dancerId || undefined,
        notes: 'Retirado desde detalle de evento',
      })
      toast.success('Vestuario retirado')
      fetchEvent()
    } catch {
      toast.error('Error al registrar retiro')
    }
  }

  const handleQuickReturn = async (costumeId: string) => {
    if (!user) return
    try {
      await costumeService.updateStatus(costumeId, 'available', user.id, {
        notes: 'Devuelto desde detalle de evento',
      })
      toast.success('Vestuario devuelto a disponible')
      fetchEvent()
    } catch {
      toast.error('Error al devolver vestuario')
    }
  }

  if (loading) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 bg-gray-100 rounded-lg animate-pulse" />
          <div className="h-5 w-40 bg-gray-100 rounded animate-pulse" />
        </div>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Evento no encontrado</p>
        <Button variant="ghost" onClick={() => router.back()} className="mt-4">Volver</Button>
      </div>
    )
  }

  const isPast = new Date(event.date) < new Date()

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 leading-tight">{event.name}</h1>
          {event.description && (
            <p className="text-sm text-gray-400 mt-0.5">{event.description}</p>
          )}
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
          isPast ? 'bg-gray-100 text-gray-500' : 'bg-violet-50 text-violet-700'
        }`}>
          {isPast ? 'Pasado' : 'Próximo'}
        </span>
      </div>

      {/* Info */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-2">
          <Calendar className="w-4 h-4 text-gray-400 mt-0.5" />
          <div>
            <p className="text-xs text-gray-400">Fecha</p>
            <p className="text-sm font-semibold text-gray-800 mt-0.5">{formatDate(event.date)}</p>
          </div>
        </div>
        {event.start_time && (
          <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-2">
            <Clock className="w-4 h-4 text-violet-500 mt-0.5" />
            <div>
              <p className="text-xs text-gray-400">Hora de Inicio</p>
              <p className="text-sm font-semibold text-violet-700 mt-0.5">{event.start_time}</p>
            </div>
          </div>
        )}
        {event.location && (
          <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-2">
            <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
            <div>
              <p className="text-xs text-gray-400">Lugar</p>
              <p className="text-sm font-semibold text-gray-800 mt-0.5">{event.location}</p>
            </div>
          </div>
        )}
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-2">
          <Shirt className="w-4 h-4 text-gray-400 mt-0.5" />
          <div>
            <p className="text-xs text-gray-400">Vestuarios</p>
            <p className="text-sm font-semibold text-gray-800 mt-0.5">{event.event_costumes?.length || 0}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-2">
          <User className="w-4 h-4 text-gray-400 mt-0.5" />
          <div>
            <p className="text-xs text-gray-400">Coordinador</p>
            <p className="text-sm font-semibold text-gray-800 mt-0.5 truncate">
              {event.coordinator?.full_name || '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Costumes section */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="p-5 border-b border-gray-50 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Vestuarios asignados al evento</h2>
          {(user?.role === 'coordinator' || user?.role === 'admin') && !isPast && (
            <Button size="sm" onClick={() => setShowAssign(true)}>
              <Plus className="w-3.5 h-3.5" />Retirar / Asignar
            </Button>
          )}
        </div>

        {!event.event_costumes || event.event_costumes.length === 0 ? (
          <div className="p-8 text-center">
            <Shirt className="w-10 h-10 mx-auto mb-2 text-gray-200" />
            <p className="text-sm text-gray-400">Sin vestuarios asignados</p>
            {(user?.role === 'coordinator' || user?.role === 'admin') && !isPast && (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowAssign(true)}>
                Asignar primer vestuario
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {event.event_costumes.map((ec) => {
              const costumeStatus = (ec.costume as { status: string })?.status
              const isBorrowed = costumeStatus === 'borrowed'
              const dancerName = (ec.dancer as { full_name: string })?.full_name

              return (
                <div key={ec.id} className="p-4 flex items-center gap-3 hover:bg-gray-50/50">
                  <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
                    <Shirt className="w-5 h-5 text-violet-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {(ec.costume as { name: string })?.name || 'Vestuario'}
                      </p>
                      <StatusBadge status={costumeStatus as never} size="sm" />
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-xs text-gray-400 font-mono">
                        {(ec.costume as { code: string })?.code}
                      </p>
                      {dancerName ? (
                        <p className="text-xs text-violet-700 font-medium flex items-center gap-1 bg-violet-50 px-2 py-0.5 rounded-md">
                          <User className="w-3 h-3 text-violet-500" />
                          Bailarín: {dancerName}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400 flex items-center gap-1">
                          <User className="w-3 h-3 text-gray-300" />
                          Sin bailarín asignado
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Quick action button based on current status */}
                    {(user?.role === 'coordinator' || user?.role === 'admin') && !isPast && (
                      isBorrowed ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                          onClick={() => handleQuickReturn((ec.costume as { id: string })?.id)}
                        >
                          Devolver
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs text-amber-700 border-amber-200 hover:bg-amber-50"
                          onClick={() => handleQuickCheckout((ec.costume as { id: string })?.id, (ec.dancer as { id: string })?.id)}
                        >
                          Retirar
                        </Button>
                      )
                    )}
                    <Link href={`/inventory/${(ec.costume as { id: string })?.id}`}>
                      <Button variant="ghost" size="sm" className="text-xs">Ver</Button>
                    </Link>
                    {(user?.role === 'coordinator' || user?.role === 'admin') && !isPast && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleRemoveCostume(ec.id, (ec.costume as { id: string })?.id)}
                        className="text-gray-300 hover:text-red-500 hover:bg-red-50"
                        title="Remover de evento"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showAssign && (
        <AssignCostumeModal
          eventId={event.id}
          userId={user?.id}
          onSuccess={fetchEvent}
          onClose={() => setShowAssign(false)}
        />
      )}
    </div>
  )
}
