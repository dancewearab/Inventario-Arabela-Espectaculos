'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Plus,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Shirt,
  Eye,
  Trash2,
  CalendarDays,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { eventService } from '@/lib/services/event.service'
import { useUser } from '@/hooks/use-user'
import type { Event } from '@/types'
import { toast } from 'sonner'
import Link from 'next/link'
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  eachDayOfInterval,
  format,
  isToday,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
} from 'date-fns'
import { es } from 'date-fns/locale'

function CreateEventModal({
  defaultDate,
  onSuccess,
  onClose,
}: {
  defaultDate?: string
  onSuccess: () => void
  onClose: () => void
}) {
  const { user } = useUser()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    date: defaultDate || format(new Date(), 'yyyy-MM-dd'),
    start_time: '18:00',
    location: '',
    description: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.date) {
      toast.error('El nombre y la fecha son obligatorios')
      return
    }
    try {
      setLoading(true)
      await eventService.create({
        name: form.name.trim(),
        date: form.date,
        start_time: form.start_time.trim() || undefined,
        location: form.location.trim() || undefined,
        description: form.description.trim() || undefined,
        coordinator_id: user!.id,
      })
      toast.success('Evento creado con éxito')
      onSuccess()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear evento')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2 text-gray-900">
            <CalendarIcon className="w-5 h-5 text-violet-600" />
            Nuevo Evento
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-500">
            Asigna un evento con su fecha y hora de inicio para coordinar vestuarios.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div>
            <Label htmlFor="event-name" className="text-xs font-semibold text-gray-700">
              Nombre del Evento *
            </Label>
            <Input
              id="event-name"
              className="mt-1 rounded-xl"
              placeholder="Ej: Presentación Hotel Movich"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="event-date" className="text-xs font-semibold text-gray-700">
                Fecha *
              </Label>
              <Input
                id="event-date"
                type="date"
                className="mt-1 rounded-xl"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="event-time" className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-violet-600" />
                Hora de Inicio *
              </Label>
              <Input
                id="event-time"
                type="time"
                className="mt-1 rounded-xl font-medium"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="event-location" className="text-xs font-semibold text-gray-700">
              Lugar / Ubicación
            </Label>
            <Input
              id="event-location"
              className="mt-1 rounded-xl"
              placeholder="Ej: Salón Principal o Teatro"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="event-desc" className="text-xs font-semibold text-gray-700">
              Detalles / Observaciones
            </Label>
            <Textarea
              id="event-desc"
              className="mt-1 rounded-xl resize-none text-sm"
              rows={3}
              placeholder="Notas sobre el show, requerimientos o repertorio..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="rounded-xl">
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={loading}
              className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-semibold shadow-sm shadow-violet-200"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Crear Evento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function EventsPage() {
  const { user } = useUser()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [viewMode, setViewMode] = useState<'week' | 'month' | 'list'>('week')
  const [showCreate, setShowCreate] = useState(false)
  const [selectedCreateDate, setSelectedCreateDate] = useState<string | undefined>()

  const isCoordinatorOrAdmin = user?.role === 'coordinator' || user?.role === 'admin'

  const fetchEvents = async () => {
    try {
      setLoading(true)
      const data = await eventService.getAll()
      setEvents(data)
    } catch {
      toast.error('Error al cargar eventos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEvents()
  }, [])

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!confirm('¿Estás seguro de que deseas eliminar este evento?')) return
    try {
      await eventService.delete(id)
      toast.success('Evento eliminado')
      fetchEvents()
    } catch {
      toast.error('Error al eliminar')
    }
  }

  // Días de la semana actual (comenzando en Lunes)
  const weekStart = useMemo(() => startOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate])
  const weekEnd = useMemo(() => endOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate])
  const daysInWeek = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd])

  // Días del mes actual
  const monthStart = useMemo(() => startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }), [currentDate])
  const monthEnd = useMemo(() => endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 }), [currentDate])
  const daysInMonth = useMemo(() => eachDayOfInterval({ start: monthStart, end: monthEnd }), [monthStart, monthEnd])

  // Funciones de navegación
  const handlePrev = () => {
    if (viewMode === 'month') setCurrentDate((prev) => subMonths(prev, 1))
    else setCurrentDate((prev) => subWeeks(prev, 1))
  }

  const handleNext = () => {
    if (viewMode === 'month') setCurrentDate((prev) => addMonths(prev, 1))
    else setCurrentDate((prev) => addWeeks(prev, 1))
  }

  const handleToday = () => {
    setCurrentDate(new Date())
  }

  const handleDayClickToCreate = (day: Date) => {
    if (!isCoordinatorOrAdmin) return
    setSelectedCreateDate(format(day, 'yyyy-MM-dd'))
    setShowCreate(true)
  }

  // Agrupar eventos por fecha 'yyyy-MM-dd' y ordenarlos por hora de inicio
  const eventsByDate = useMemo(() => {
    const map = new Map<string, Event[]>()
    for (const evt of events) {
      const dateKey = evt.date
      if (!map.has(dateKey)) {
        map.set(dateKey, [])
      }
      map.get(dateKey)!.push(evt)
    }

    // Ordenar cada día por hora de inicio
    map.forEach((evts) => {
      evts.sort((a, b) => {
        const timeA = a.start_time || '00:00'
        const timeB = b.start_time || '00:00'
        return timeA.localeCompare(timeB)
      })
    })

    return map
  }, [events])

  // Renderizador de un recuadro de evento individual
  const EventBox = ({ event }: { event: Event }) => {
    const costumeCount = event.event_costumes?.length || 0

    return (
      <div className="group relative bg-white rounded-xl border border-violet-100/90 shadow-sm hover:shadow-md hover:border-violet-300 transition-all p-3 text-left overflow-hidden">
        {/* Barra superior de acento */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 via-purple-500 to-indigo-500" />

        {/* Hora de inicio y botones de acción */}
        <div className="flex items-center justify-between gap-1 mb-1.5 mt-0.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-violet-50 text-violet-700 border border-violet-100">
            <Clock className="w-3 h-3 text-violet-600" />
            {event.start_time ? event.start_time : 'Sin hora'}
          </span>

          <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100">
            <Link
              href={`/events/${event.id}`}
              className="p-1 rounded-md text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
              title="Ver detalle"
            >
              <Eye className="w-3.5 h-3.5" />
            </Link>
            {isCoordinatorOrAdmin && (
              <button
                onClick={(e) => handleDelete(event.id, e)}
                className="p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Eliminar evento"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Nombre del evento */}
        <Link href={`/events/${event.id}`}>
          <h4 className="font-bold text-gray-900 text-xs sm:text-sm line-clamp-2 hover:text-violet-700 transition-colors leading-snug">
            {event.name}
          </h4>
        </Link>

        {/* Ubicación */}
        {event.location && (
          <p className="text-[11px] text-gray-500 flex items-center gap-1 mt-1 truncate">
            <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
            <span className="truncate">{event.location}</span>
          </p>
        )}

        {/* Vestuarios asignados */}
        <div className="mt-2 pt-2 border-t border-gray-50 flex items-center justify-between text-[11px] text-gray-500">
          <span className="flex items-center gap-1 text-violet-600 font-medium">
            <Shirt className="w-3 h-3 text-violet-500" />
            {costumeCount} {costumeCount === 1 ? 'vestuario' : 'vestuarios'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Barra superior de título y nuevo evento */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-violet-600" />
            Calendario de Eventos
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Visualiza y programa presentaciones, horarios de inicio y asignación de vestuarios.
          </p>
        </div>

        {isCoordinatorOrAdmin && (
          <Button
            onClick={() => {
              setSelectedCreateDate(undefined)
              setShowCreate(true)
            }}
            className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl flex items-center gap-2 shadow-sm shadow-violet-200 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            Nuevo Evento
          </Button>
        )}
      </div>

      {/* Controles del Calendario (Navegación + Selector de Vista) */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Navegación por fechas */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrev}
            className="h-9 w-9 p-0 rounded-xl border-gray-200"
            title="Anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleToday}
            className="h-9 px-3 rounded-xl border-gray-200 text-xs font-semibold"
          >
            Hoy
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleNext}
            className="h-9 w-9 p-0 rounded-xl border-gray-200"
            title="Siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>

          <span className="text-sm sm:text-base font-bold text-gray-800 ml-2 capitalize">
            {viewMode === 'month'
              ? format(currentDate, 'MMMM yyyy', { locale: es })
              : `Semana: ${format(weekStart, 'd MMM', { locale: es })} - ${format(weekEnd, 'd MMM yyyy', { locale: es })}`}
          </span>
        </div>

        {/* Selector de modo de vista */}
        <div className="flex p-1 bg-gray-100 rounded-xl self-start md:self-auto">
          <button
            onClick={() => setViewMode('week')}
            className={`py-1 px-3 rounded-lg text-xs font-semibold transition-all ${
              viewMode === 'week' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Semana
          </button>
          <button
            onClick={() => setViewMode('month')}
            className={`py-1 px-3 rounded-lg text-xs font-semibold transition-all ${
              viewMode === 'month' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Mes
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`py-1 px-3 rounded-lg text-xs font-semibold transition-all ${
              viewMode === 'list' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Lista
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-gray-400 bg-white rounded-2xl border border-gray-100">
          <CalendarIcon className="w-8 h-8 animate-pulse text-violet-500 mx-auto mb-2" />
          <p className="text-sm">Cargando calendario...</p>
        </div>
      ) : viewMode === 'week' ? (
        /* VISTA SEMANAL TIPO CALENDARIO */
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {daysInWeek.map((day) => {
            const dateKey = format(day, 'yyyy-MM-dd')
            const dayEvents = eventsByDate.get(dateKey) || []
            const today = isToday(day)

            return (
              <div
                key={dateKey}
                className={`bg-white rounded-2xl border transition-all flex flex-col min-h-[220px] md:min-h-[460px] ${
                  today
                    ? 'border-violet-300 ring-2 ring-violet-500/20 shadow-sm bg-violet-50/15'
                    : 'border-gray-100 shadow-sm'
                }`}
              >
                {/* Cabecera del día */}
                <div
                  className={`p-3 border-b text-center flex items-center justify-between md:flex-col md:justify-center gap-1 ${
                    today ? 'border-violet-100 bg-violet-50/60' : 'border-gray-50'
                  }`}
                >
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 capitalize">
                    {format(day, 'EEEE', { locale: es })}
                  </span>
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                      today ? 'bg-violet-600 text-white shadow-sm shadow-violet-300' : 'text-gray-800'
                    }`}
                  >
                    {format(day, 'd')}
                  </div>
                </div>

                {/* Lista de recuadros de eventos para el día */}
                <div className="p-2.5 flex-1 flex flex-col gap-2.5 overflow-y-auto">
                  {dayEvents.length > 0 ? (
                    dayEvents.map((evt) => <EventBox key={evt.id} event={evt} />)
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center py-6 text-center text-gray-300 group">
                      <p className="text-xs">Sin eventos</p>
                      {isCoordinatorOrAdmin && (
                        <button
                          onClick={() => handleDayClickToCreate(day)}
                          className="mt-2 p-1.5 rounded-lg border border-dashed border-gray-200 text-gray-400 hover:text-violet-600 hover:border-violet-300 hover:bg-violet-50 text-[11px] font-medium flex items-center gap-1 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" /> Agregar
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Botón flotante para agregar si ya hay eventos */}
                {isCoordinatorOrAdmin && dayEvents.length > 0 && (
                  <div className="p-2 border-t border-gray-50">
                    <button
                      onClick={() => handleDayClickToCreate(day)}
                      className="w-full py-1 text-[11px] font-semibold text-gray-400 hover:text-violet-700 hover:bg-violet-50 rounded-lg transition-colors flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Añadir evento
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : viewMode === 'month' ? (
        /* VISTA MENSUAL EN CUADRÍCULA */
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden p-3 sm:p-5">
          {/* Nombres de los días de la semana */}
          <div className="grid grid-cols-7 mb-2 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider py-1">
            <span>Lun</span>
            <span>Mar</span>
            <span>Mié</span>
            <span>Jue</span>
            <span>Vie</span>
            <span>Sáb</span>
            <span>Dom</span>
          </div>

          {/* Días del mes */}
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {daysInMonth.map((day) => {
              const dateKey = format(day, 'yyyy-MM-dd')
              const dayEvents = eventsByDate.get(dateKey) || []
              const today = isToday(day)
              const isCurrentMonth = format(day, 'MM') === format(currentDate, 'MM')

              return (
                <div
                  key={dateKey}
                  onClick={() => handleDayClickToCreate(day)}
                  className={`min-h-[85px] sm:min-h-[115px] p-1.5 rounded-xl border transition-all flex flex-col justify-between cursor-pointer ${
                    today
                      ? 'border-violet-400 bg-violet-50/20 shadow-sm ring-1 ring-violet-400'
                      : isCurrentMonth
                      ? 'border-gray-100 bg-white hover:border-violet-200 hover:bg-violet-50/30'
                      : 'border-transparent bg-gray-50/50 opacity-40 hover:opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                        today ? 'bg-violet-600 text-white' : 'text-gray-700'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="text-[10px] font-bold text-violet-700 bg-violet-100 px-1.5 py-0.2 rounded-full">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>

                  {/* Recuadros compactos de eventos dentro de la casilla mensual */}
                  <div className="flex-1 my-1 space-y-1 overflow-hidden">
                    {dayEvents.slice(0, 2).map((evt) => (
                      <div
                        key={evt.id}
                        className="p-1 rounded-md bg-violet-100/70 border border-violet-200/60 text-[10px] text-violet-900 truncate font-medium flex items-center gap-1 shadow-2xs"
                        title={`${evt.start_time || ''} - ${evt.name}`}
                      >
                        {evt.start_time && (
                          <span className="font-bold text-violet-700 flex-shrink-0">{evt.start_time}</span>
                        )}
                        <span className="truncate">{evt.name}</span>
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <span className="text-[10px] text-gray-400 font-semibold block text-center">
                        +{dayEvents.length - 2} más
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* VISTA LISTA TRADICIONAL */
        <div className="space-y-4">
          {events.length === 0 ? (
            <div className="p-12 text-center text-gray-400 bg-white rounded-2xl border border-gray-100">
              <CalendarIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm">No hay eventos registrados</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {events.map((evt) => (
                <EventBox key={evt.id} event={evt} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal para crear evento */}
      {showCreate && (
        <CreateEventModal
          defaultDate={selectedCreateDate}
          onSuccess={fetchEvents}
          onClose={() => {
            setShowCreate(false)
            setSelectedCreateDate(undefined)
          }}
        />
      )}
    </div>
  )
}
