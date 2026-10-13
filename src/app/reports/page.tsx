'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  AlertTriangle,
  Shirt,
  Droplets,
  Wrench,
  RefreshCw,
  Calendar,
  Download,
  Search,
  CheckCircle2,
  User,
  LayoutGrid,
  List as ListIcon,
  Check,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { costumeService } from '@/lib/services/costume.service'
import { useUser } from '@/hooks/use-user'
import { formatDateTime } from '@/utils'
import type { DamageReport, Costume, CostumeStatus } from '@/types'
import { toast } from 'sonner'
import Link from 'next/link'

export default function ReportsPage() {
  const { user } = useUser()
  const [damageReports, setDamageReports] = useState<DamageReport[]>([])
  const [borrowedCostumes, setBorrowedCostumes] = useState<Costume[]>([])
  const [washingCostumes, setWashingCostumes] = useState<Costume[]>([])
  const [repairCostumes, setRepairCostumes] = useState<Costume[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')
  const [movingCostumeId, setMovingCostumeId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      const [damagesRes, borrowedRes, washingRes, repairRes] = await Promise.all([
        supabase
          .from('damage_reports')
          .select(`*, costume:costumes(id, name, code, status, photos), reporter:users!damage_reports_reported_by_fkey(full_name)`)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('costumes')
          .select(`*, current_holder:users!costumes_current_holder_id_fkey(full_name), current_event:events!costumes_current_event_id_fkey(name, date)`)
          .eq('status', 'borrowed')
          .order('updated_at', { ascending: true }),
        supabase
          .from('costumes')
          .select(`*, current_holder:users!costumes_current_holder_id_fkey(full_name)`)
          .eq('status', 'washing')
          .order('updated_at', { ascending: true }),
        supabase
          .from('costumes')
          .select(`*, current_holder:users!costumes_current_holder_id_fkey(full_name)`)
          .eq('status', 'repair')
          .order('updated_at', { ascending: true }),
      ])
      setDamageReports(damagesRes.data || [])
      setBorrowedCostumes(borrowedRes.data || [])
      setWashingCostumes(washingRes.data || [])
      setRepairCostumes(repairRes.data || [])
    } catch {
      toast.error('Error al cargar reportes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const resolveDamage = async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('damage_reports')
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq('id', id)
    if (!error) {
      setDamageReports((prev) => prev.map((r) => (r.id === id ? { ...r, resolved: true } : r)))
      toast.success('Reporte de daño marcado como resuelto')
    } else {
      toast.error('Error al resolver reporte')
    }
  }

  const handleMoveStatus = async (costumeId: string, newStatus: CostumeStatus, label: string) => {
    if (!user) return
    try {
      setMovingCostumeId(costumeId)
      await costumeService.updateStatus(costumeId, newStatus, user.id, {
        notes: `Cambiado a ${label} desde tablero Kanban`,
      })
      toast.success(`Vestuario movido a ${label}`)
      fetchData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al actualizar estado'
      toast.error(msg)
    } finally {
      setMovingCostumeId(null)
    }
  }

  const getDaysSince = (updatedAt: string) => {
    const diff = Date.now() - new Date(updatedAt).getTime()
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
  }

  const severityConfig = {
    low: { label: 'Leve', color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200' },
    medium: { label: 'Moderado', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
    high: { label: 'Grave', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
  }

  const unresolvedDamages = useMemo(() => damageReports.filter((r) => !r.resolved), [damageReports])
  const resolvedDamages = useMemo(() => damageReports.filter((r) => r.resolved), [damageReports])

  // Filtrado por buscador
  const filterCostumes = useCallback((list: Costume[]) => {
    if (!searchQuery.trim()) return list
    const q = searchQuery.toLowerCase()
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (c.current_holder as { full_name: string } | null)?.full_name?.toLowerCase().includes(q)
    )
  }, [searchQuery])

  const filterDamages = useCallback((list: DamageReport[]) => {
    if (!searchQuery.trim()) return list
    const q = searchQuery.toLowerCase()
    return list.filter(
      (r) =>
        (r.costume as { name: string } | null)?.name?.toLowerCase().includes(q) ||
        (r.costume as { code: string } | null)?.code?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        (r.reporter as { full_name: string } | null)?.full_name?.toLowerCase().includes(q)
    )
  }, [searchQuery])

  const filteredBorrowed = useMemo(() => filterCostumes(borrowedCostumes), [borrowedCostumes, filterCostumes])
  const filteredWashing = useMemo(() => filterCostumes(washingCostumes), [washingCostumes, filterCostumes])
  const filteredRepair = useMemo(() => filterCostumes(repairCostumes), [repairCostumes, filterCostumes])
  const filteredDamages = useMemo(() => filterDamages(unresolvedDamages), [unresolvedDamages, filterDamages])

  const exportCSV = (data: Costume[], filename: string) => {
    const headers = ['Código', 'Nombre', 'Categoría', 'Talla', 'Con quién', 'Días', 'Evento']
    const rows = data.map((c) => [
      c.code,
      c.name,
      c.category,
      c.size,
      (c.current_holder as { full_name: string } | null)?.full_name || '—',
      getDaysSince(c.updated_at),
      (c.current_event as { name: string } | null)?.name || '—',
    ])
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Componente de Tarjeta de Vestuario en Kanban
  const KanbanCostumeCard = ({
    costume,
    type,
  }: {
    costume: Costume
    type: 'borrowed' | 'washing' | 'repair'
  }) => {
    const days = getDaysSince(costume.updated_at)
    const isLate = type === 'borrowed' && days > 7
    const photo = costume.photos && costume.photos.length > 0 ? costume.photos[0] : null
    const isMoving = movingCostumeId === costume.id

    return (
      <div
        className={`bg-white rounded-2xl border p-3.5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-3 ${
          isLate ? 'border-red-200 ring-1 ring-red-300/40 bg-red-50/15' : 'border-gray-100 hover:border-violet-200'
        } ${isMoving ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <div className="flex items-start gap-3">
          {photo ? (
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-50 flex-shrink-0 border border-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt={costume.name} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0 border border-violet-100">
              <Shirt className="w-6 h-6" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-1">
              <Link
                href={`/inventory/${costume.id}`}
                className="font-bold text-gray-900 text-xs sm:text-sm hover:text-violet-700 transition-colors line-clamp-1"
                title={costume.name}
              >
                {costume.name}
              </Link>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                  isLate
                    ? 'bg-red-100 text-red-700 border border-red-200'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {days}d
              </span>
            </div>

            <p className="text-[11px] font-mono text-gray-400 mt-0.5">
              {costume.code} · Talla {costume.size}
            </p>

            {(costume.current_holder as { full_name: string } | null)?.full_name && (
              <p className="text-[11px] text-gray-600 flex items-center gap-1 mt-1 truncate font-medium">
                <User className="w-3 h-3 text-gray-400 flex-shrink-0" />
                <span className="truncate">{(costume.current_holder as { full_name: string }).full_name}</span>
              </p>
            )}

            {costume.current_event && (
              <p className="text-[11px] text-violet-600 flex items-center gap-1 mt-0.5 truncate">
                <Calendar className="w-3 h-3 text-violet-400 flex-shrink-0" />
                <span className="truncate">{(costume.current_event as { name: string }).name}</span>
              </p>
            )}
          </div>
        </div>

        {/* Acciones para mover entre estados */}
        <div className="pt-2 border-t border-gray-50 flex items-center justify-between gap-1">
          <Link
            href={`/inventory/${costume.id}`}
            className="text-[11px] font-semibold text-gray-400 hover:text-gray-700 flex items-center gap-0.5"
          >
            Detalles <ExternalLink className="w-3 h-3" />
          </Link>

          <div className="flex items-center gap-1">
            {type === 'borrowed' && (
              <>
                <button
                  onClick={() => handleMoveStatus(costume.id, 'washing', 'Lavado')}
                  className="px-2 py-1 rounded-lg text-[10px] font-bold bg-cyan-50 text-cyan-700 hover:bg-cyan-100 transition-colors flex items-center gap-1"
                  title="Enviar a lavado"
                >
                  <Droplets className="w-3 h-3" /> Lavar
                </button>
                <button
                  onClick={() => handleMoveStatus(costume.id, 'available', 'Disponible')}
                  className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors flex items-center gap-1"
                  title="Devolver al inventario disponible"
                >
                  <Check className="w-3 h-3" /> Devolver
                </button>
              </>
            )}

            {type === 'washing' && (
              <>
                <button
                  onClick={() => handleMoveStatus(costume.id, 'repair', 'Arreglo')}
                  className="px-2 py-1 rounded-lg text-[10px] font-bold bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors flex items-center gap-1"
                  title="Enviar a modista/reparación"
                >
                  <Wrench className="w-3 h-3" /> Reparar
                </button>
                <button
                  onClick={() => handleMoveStatus(costume.id, 'available', 'Disponible')}
                  className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors flex items-center gap-1"
                  title="Listo y limpio para inventario disponible"
                >
                  <Check className="w-3 h-3" /> Listo
                </button>
              </>
            )}

            {type === 'repair' && (
              <>
                <button
                  onClick={() => handleMoveStatus(costume.id, 'washing', 'Lavado')}
                  className="px-2 py-1 rounded-lg text-[10px] font-bold bg-cyan-50 text-cyan-700 hover:bg-cyan-100 transition-colors flex items-center gap-1"
                  title="Pasar a lavado"
                >
                  <Droplets className="w-3 h-3" /> Lavar
                </button>
                <button
                  onClick={() => handleMoveStatus(costume.id, 'available', 'Disponible')}
                  className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors flex items-center gap-1"
                  title="Reparado y disponible"
                >
                  <Check className="w-3 h-3" /> Reparado
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Componente de Tarjeta de Daño en Kanban
  const KanbanDamageCard = ({ report }: { report: DamageReport }) => {
    const sev = severityConfig[report.severity] || severityConfig.medium
    const costumeName = (report.costume as { name: string } | null)?.name || 'Vestuario'
    const costumeCode = (report.costume as { code: string } | null)?.code || '—'
    const costumeId = (report.costume as { id: string } | null)?.id

    return (
      <div className="bg-white rounded-2xl border border-red-100/90 p-3.5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-3">
        <div>
          <div className="flex items-start justify-between gap-1 mb-1.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sev.bg} ${sev.color} ${sev.border}`}>
              {sev.label}
            </span>
            <span className="text-[10px] text-gray-400">
              {formatDateTime(report.created_at).split(' ')[0]}
            </span>
          </div>

          {costumeId ? (
            <Link
              href={`/inventory/${costumeId}`}
              className="font-bold text-gray-900 text-xs sm:text-sm hover:text-violet-700 transition-colors line-clamp-1"
            >
              {costumeName}
            </Link>
          ) : (
            <h4 className="font-bold text-gray-900 text-xs sm:text-sm">{costumeName}</h4>
          )}

          <p className="text-[11px] font-mono text-gray-400 mt-0.5">{costumeCode}</p>

          <p className="text-xs text-gray-600 bg-red-50/40 p-2 rounded-xl mt-2 line-clamp-2 border border-red-100/40">
            {report.description}
          </p>

          {report.photo_url && (
            <div className="mt-2 rounded-xl overflow-hidden max-h-24 border border-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={report.photo_url} alt="Evidencia daño" className="w-full h-full object-cover" />
            </div>
          )}

          <p className="text-[10px] text-gray-400 mt-2 truncate">
            Por: {(report.reporter as { full_name: string } | null)?.full_name || 'Bailarín'}
          </p>
        </div>

        <div className="pt-2 border-t border-gray-50 flex items-center justify-between">
          {costumeId && (
            <Link
              href={`/inventory/${costumeId}`}
              className="text-[11px] font-semibold text-gray-400 hover:text-gray-700 flex items-center gap-0.5"
            >
              Ver prenda <ExternalLink className="w-3 h-3" />
            </Link>
          )}

          <Button
            size="sm"
            onClick={() => resolveDamage(report.id)}
            className="h-7 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10px] ml-auto"
          >
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Resolver Daño
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <LayoutGrid className="w-6 h-6 text-violet-600" />
            Tablero de Reportes
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Flujo Kanban en tiempo real de vestuarios prestados, lavandería, costura y daños.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button variant="outline" size="sm" onClick={fetchData} className="rounded-xl gap-1.5 h-10">
            <RefreshCw className="w-3.5 h-3.5" />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Métricas / Resumen rápido */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Prestados', count: borrowedCostumes.length, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: Shirt },
          { label: 'En Lavado', count: washingCostumes.length, color: 'text-cyan-700', bg: 'bg-cyan-50', border: 'border-cyan-200', icon: Droplets },
          { label: 'En Arreglo', count: repairCostumes.length, color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', icon: Wrench },
          { label: 'Daños Pendientes', count: unresolvedDamages.length, color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: AlertTriangle },
        ].map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-xs p-4 flex items-center gap-3.5">
              <div className={`w-11 h-11 rounded-xl ${s.bg} flex items-center justify-center flex-shrink-0 ${s.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className={`text-xl sm:text-2xl font-bold ${s.color}`}>{loading ? '…' : s.count}</p>
                <p className="text-xs text-gray-500 font-medium">{s.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Barra de Filtro y Toggle Kanban / Lista */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            placeholder="Buscar por vestuario, código o bailarín..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-10 rounded-xl bg-gray-50/50 border-gray-200 text-sm"
          />
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* Botones de Exportar */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCSV(borrowedCostumes, 'vestuarios_prestados')}
            className="h-9 rounded-xl text-xs font-semibold gap-1.5 border-gray-200"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </Button>

          {/* Toggle Kanban / Lista */}
          <div className="flex p-1 bg-gray-100 rounded-xl">
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'kanban' ? 'bg-white text-violet-700 shadow-xs' : 'text-gray-500 hover:text-gray-800'
              }`}
              title="Vista Kanban"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'list' ? 'bg-white text-violet-700 shadow-xs' : 'text-gray-500 hover:text-gray-800'
              }`}
              title="Vista Lista"
            >
              <ListIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-16 text-center text-gray-400 bg-white rounded-2xl border border-gray-100">
          <RefreshCw className="w-8 h-8 animate-spin text-violet-500 mx-auto mb-2" />
          <p className="text-sm">Cargando tablero...</p>
        </div>
      ) : viewMode === 'kanban' ? (
        /* ================= VISTA TABLERO KANBAN ================= */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          {/* 1. COLUMNA: PRESTADOS */}
          <div className="bg-gray-50/70 rounded-2xl p-3 border border-gray-200/60 flex flex-col min-h-[500px]">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-200/60 px-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Shirt className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-gray-800 text-sm">Prestados</h3>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                {filteredBorrowed.length}
              </span>
            </div>

            <div className="space-y-2.5 flex-1 overflow-y-auto">
              {filteredBorrowed.length === 0 ? (
                <div className="py-12 text-center text-xs text-gray-400">Sin vestuarios prestados</div>
              ) : (
                filteredBorrowed.map((c) => (
                  <KanbanCostumeCard key={c.id} costume={c} type="borrowed" />
                ))
              )}
            </div>
          </div>

          {/* 2. COLUMNA: EN LAVADO */}
          <div className="bg-gray-50/70 rounded-2xl p-3 border border-gray-200/60 flex flex-col min-h-[500px]">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-200/60 px-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-cyan-100 text-cyan-700 flex items-center justify-center">
                  <Droplets className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-gray-800 text-sm">En Lavado</h3>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800">
                {filteredWashing.length}
              </span>
            </div>

            <div className="space-y-2.5 flex-1 overflow-y-auto">
              {filteredWashing.length === 0 ? (
                <div className="py-12 text-center text-xs text-gray-400">Sin prendas en lavado</div>
              ) : (
                filteredWashing.map((c) => (
                  <KanbanCostumeCard key={c.id} costume={c} type="washing" />
                ))
              )}
            </div>
          </div>

          {/* 3. COLUMNA: EN ARREGLO */}
          <div className="bg-gray-50/70 rounded-2xl p-3 border border-gray-200/60 flex flex-col min-h-[500px]">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-200/60 px-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center">
                  <Wrench className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-gray-800 text-sm">En Arreglo</h3>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">
                {filteredRepair.length}
              </span>
            </div>

            <div className="space-y-2.5 flex-1 overflow-y-auto">
              {filteredRepair.length === 0 ? (
                <div className="py-12 text-center text-xs text-gray-400">Sin prendas en arreglo</div>
              ) : (
                filteredRepair.map((c) => (
                  <KanbanCostumeCard key={c.id} costume={c} type="repair" />
                ))
              )}
            </div>
          </div>

          {/* 4. COLUMNA: DAÑOS REPORTADOS */}
          <div className="bg-gray-50/70 rounded-2xl p-3 border border-gray-200/60 flex flex-col min-h-[500px]">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-200/60 px-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-red-100 text-red-700 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-gray-800 text-sm">Daños</h3>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800">
                {filteredDamages.length}
              </span>
            </div>

            <div className="space-y-2.5 flex-1 overflow-y-auto">
              {filteredDamages.length === 0 ? (
                <div className="py-12 text-center text-xs text-gray-400">Sin reportes de daño pendientes</div>
              ) : (
                filteredDamages.map((report) => (
                  <KanbanDamageCard key={report.id} report={report} />
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ================= VISTA LISTA / TABLA TRADICIONAL ================= */
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-gray-50">
            <h3 className="font-bold text-gray-800 text-sm">Resumen General en Lista</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {filteredBorrowed.map((c) => (
              <div key={c.id} className="p-4 flex items-center justify-between gap-3">
                <div>
                  <Link href={`/inventory/${c.id}`} className="font-bold text-gray-900 text-sm hover:text-violet-600">
                    {c.name}
                  </Link>
                  <p className="text-xs text-gray-500">
                    {c.code} · Con: {(c.current_holder as { full_name: string } | null)?.full_name || '—'}
                  </p>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                  Prestado ({getDaysSince(c.updated_at)}d)
                </span>
              </div>
            ))}
            {filteredWashing.map((c) => (
              <div key={c.id} className="p-4 flex items-center justify-between gap-3">
                <div>
                  <Link href={`/inventory/${c.id}`} className="font-bold text-gray-900 text-sm hover:text-violet-600">
                    {c.name}
                  </Link>
                  <p className="text-xs text-gray-500">{c.code} · En lavandería</p>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-cyan-100 text-cyan-700">
                  En Lavado ({getDaysSince(c.updated_at)}d)
                </span>
              </div>
            ))}
            {filteredRepair.map((c) => (
              <div key={c.id} className="p-4 flex items-center justify-between gap-3">
                <div>
                  <Link href={`/inventory/${c.id}`} className="font-bold text-gray-900 text-sm hover:text-violet-600">
                    {c.name}
                  </Link>
                  <p className="text-xs text-gray-500">{c.code} · En arreglo/modista</p>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-100 text-orange-700">
                  En Arreglo ({getDaysSince(c.updated_at)}d)
                </span>
              </div>
            ))}
            {filteredDamages.map((r) => (
              <div key={r.id} className="p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-gray-900 text-sm">
                    {(r.costume as { name: string } | null)?.name || 'Vestuario'} - {r.description}
                  </p>
                  <p className="text-xs text-gray-500">
                    Por {(r.reporter as { full_name: string } | null)?.full_name || 'Bailarín'}
                  </p>
                </div>
                <Button size="sm" onClick={() => resolveDamage(r.id)} className="h-7 text-xs bg-emerald-600 text-white rounded-xl">
                  Resolver
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historial de Daños Resueltos */}
      {resolvedDamages.length > 0 && (
        <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-xs text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>
              <strong>{resolvedDamages.length}</strong> reportes de daños han sido resueltos satisfactoriamente.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
