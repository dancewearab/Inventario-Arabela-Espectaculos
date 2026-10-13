'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Shield,
  Mail,
  KeyRound,
  Edit2,
  Trash2,
  UserPlus,
  Search,
  AlertTriangle,
  Loader2,
  Save,
  Lock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { useUser } from '@/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { getInitials, formatDate } from '@/utils'
import { toast } from 'sonner'
import Link from 'next/link'
import type { UserRole } from '@/types'

interface ManagedUser {
  id: string
  email: string
  full_name: string
  role: UserRole
  created_at: string
}

export default function SettingsPage() {
  const { user, loading: userLoading } = useUser()
  const [activeTab, setActiveTab] = useState<'users' | 'profile'>('users')

  // Estado para gestión de usuarios
  const [usersList, setUsersList] = useState<ManagedUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Modal para editar usuario
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null)
  const [editFullName, setEditFullName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editRole, setEditRole] = useState<UserRole>('dancer')
  const [editPassword, setEditPassword] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // Modal para crear usuario
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [newFullName, setNewFullName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<UserRole>('dancer')
  const [creatingUser, setCreatingUser] = useState(false)

  // Perfil personal del admin
  const [myFullName, setMyFullName] = useState('')
  const [savingMyProfile, setSavingMyProfile] = useState(false)
  const [myNewPassword, setMyNewPassword] = useState('')
  const [changingMyPassword, setChangingMyPassword] = useState(false)

  const fetchUsers = useCallback(async () => {
    try {
      setLoadingUsers(true)
      const res = await fetch('/api/admin/users')
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson?.error || 'Error al obtener usuarios')
      }
      const data = await res.json()
      setUsersList(data || [])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(msg)
    } finally {
      setLoadingUsers(false)
    }
  }, [])

  useEffect(() => {
    if (user && user.role === 'admin') {
      fetchUsers()
      setMyFullName(user.full_name)
    }
  }, [user, fetchUsers])

  const handleOpenEdit = (targetUser: ManagedUser) => {
    setEditingUser(targetUser)
    setEditFullName(targetUser.full_name)
    setEditEmail(targetUser.email)
    setEditRole(targetUser.role)
    setEditPassword('')
  }

  const handleSaveEdit = async () => {
    if (!editingUser) return
    if (!editFullName.trim()) {
      toast.error('El nombre no puede estar vacío')
      return
    }
    if (!editEmail.trim() || !editEmail.includes('@')) {
      toast.error('Ingresa un correo electrónico válido')
      return
    }
    if (editPassword && editPassword.trim().length < 6) {
      toast.error('La contraseña debe tener mínimo 6 caracteres')
      return
    }

    try {
      setSavingEdit(true)
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingUser.id,
          full_name: editFullName.trim(),
          email: editEmail.trim(),
          role: editRole,
          password: editPassword.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Error al actualizar usuario')

      toast.success('Usuario actualizado con éxito')
      setEditingUser(null)
      fetchUsers()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(msg)
    } finally {
      setSavingEdit(false)
    }
  }

  const handleCreateUser = async () => {
    if (!newFullName.trim() || !newEmail.trim() || !newPassword.trim()) {
      toast.error('Todos los campos son requeridos')
      return
    }
    if (newPassword.length < 6) {
      toast.error('La contraseña debe tener mínimo 6 caracteres')
      return
    }

    try {
      setCreatingUser(true)
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: newFullName.trim(),
          email: newEmail.trim(),
          password: newPassword.trim(),
          role: newRole,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Error al crear usuario')

      toast.success('Usuario creado exitosamente')
      setCreateModalOpen(false)
      setNewFullName('')
      setNewEmail('')
      setNewPassword('')
      setNewRole('dancer')
      fetchUsers()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(msg)
    } finally {
      setCreatingUser(false)
    }
  }

  const handleDeleteUser = async (targetUser: ManagedUser) => {
    if (targetUser.id === user?.id) {
      toast.error('No puedes eliminar tu propia cuenta')
      return
    }
    const confirmDelete = window.confirm(
      `¿Estás seguro de que deseas eliminar a ${targetUser.full_name} (${targetUser.email})? Esta acción no se puede deshacer.`
    )
    if (!confirmDelete) return

    try {
      const res = await fetch(`/api/admin/users?userId=${targetUser.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Error al eliminar usuario')

      toast.success('Usuario eliminado')
      fetchUsers()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(msg)
    }
  }

  const handleSaveMyProfile = async () => {
    if (!myFullName.trim()) {
      toast.error('El nombre no puede estar vacío')
      return
    }
    try {
      setSavingMyProfile(true)
      const supabase = createClient()
      const { error } = await supabase
        .from('users')
        .update({ full_name: myFullName.trim() })
        .eq('id', user!.id)
      if (error) throw error
      toast.success('Perfil actualizado')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(msg)
    } finally {
      setSavingMyProfile(false)
    }
  }

  const handleChangeMyPassword = async () => {
    if (!myNewPassword || myNewPassword.length < 6) {
      toast.error('La contraseña debe tener mínimo 6 caracteres')
      return
    }
    try {
      setChangingMyPassword(true)
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: myNewPassword })
      if (error) throw error
      toast.success('Tu contraseña ha sido actualizada')
      setMyNewPassword('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(msg)
    } finally {
      setChangingMyPassword(false)
    }
  }

  // Si está cargando la sesión
  if (userLoading) {
    return (
      <div className="max-w-4xl space-y-4">
        <div className="h-10 w-48 bg-gray-100 rounded-lg animate-pulse" />
        <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  // Control de Acceso: Exclusivo para administradores
  if (!user || user.role !== 'admin') {
    return (
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Acceso Restringido</h2>
        <p className="text-sm text-gray-500 mb-6">
          La sección de Configuración está reservada exclusivamente para usuarios con rol de{' '}
          <strong className="text-gray-700">Administrador</strong>.
        </p>
        <Link href="/dashboard">
          <Button className="w-full bg-violet-600 hover:bg-violet-700 text-white">
            Volver al Inicio
          </Button>
        </Link>
      </div>
    )
  }

  const filteredUsers = usersList.filter(
    (u) =>
      u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200">
            <Shield className="w-3 h-3" />
            Administrador
          </span>
        )
      case 'coordinator':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200">
            Coordinador
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
            Bailarín
          </span>
        )
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-6 h-6 text-violet-600" />
            Configuración y Usuarios
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Panel administrativo exclusivo: gestiona los usuarios, contraseñas y roles del sistema.
          </p>
        </div>

        {/* Selector de pestañas */}
        <div className="flex p-1 bg-gray-100 rounded-xl max-w-xs">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'users'
                ? 'bg-white text-violet-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Gestión de Usuarios ({usersList.length})
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'profile'
                ? 'bg-white text-violet-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Mi Cuenta
          </button>
        </div>
      </div>

      {activeTab === 'users' ? (
        /* Pestaña: Gestión de Usuarios */
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Buscar por nombre o correo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10 rounded-xl bg-white border-gray-200"
              />
            </div>
            <Button
              onClick={() => setCreateModalOpen(true)}
              className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl flex items-center gap-2 h-10 shadow-sm shadow-violet-200"
            >
              <UserPlus className="w-4 h-4" />
              Nuevo Usuario
            </Button>
          </div>

          <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden bg-white">
            <CardHeader className="p-4 sm:p-5 border-b border-gray-50">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-gray-900">
                    Usuarios del Sistema
                  </CardTitle>
                  <CardDescription className="text-xs text-gray-400">
                    Puedes modificar el nombre, correo, asignar contraseñas o cambiar roles.
                  </CardDescription>
                </div>
                <span className="text-xs font-medium text-gray-400">
                  Total: {filteredUsers.length}
                </span>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {loadingUsers ? (
                <div className="py-12 flex flex-col items-center justify-center text-gray-400 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
                  <span className="text-xs">Cargando usuarios...</span>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm">
                  No se encontraron usuarios
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredUsers.map((u) => (
                    <div
                      key={u.id}
                      className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50/70 transition-colors"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-violet-500 to-indigo-500 text-white flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-sm">
                          {getInitials(u.full_name || u.email)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-900 text-sm truncate">
                              {u.full_name}
                            </p>
                            {getRoleBadge(u.role)}
                            {u.id === user?.id && (
                              <span className="text-[10px] bg-gray-100 text-gray-600 font-bold px-2 py-0.5 rounded-full">
                                Tú
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5 truncate">
                            <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            {u.email}
                            <span className="text-gray-300">·</span>
                            <span className="text-[11px] text-gray-400">
                              Registrado el {formatDate(u.created_at)}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(u)}
                          className="h-9 px-3 rounded-xl border-gray-200 text-gray-700 hover:text-violet-700 hover:border-violet-200 hover:bg-violet-50 text-xs font-semibold gap-1.5"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          Editar / Clave
                        </Button>
                        {u.id !== user?.id && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteUser(u)}
                            className="h-9 px-2.5 rounded-xl border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 text-xs"
                            title="Eliminar usuario"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        /* Pestaña: Mi Cuenta / Perfil Propio */
        <div className="max-w-xl space-y-4">
          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-gray-900">Mi Perfil</CardTitle>
              <CardDescription className="text-xs text-gray-400">
                Tu información personal como administrador
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="my-name">Nombre completo</Label>
                <Input
                  id="my-name"
                  className="mt-1.5 rounded-xl"
                  value={myFullName}
                  onChange={(e) => setMyFullName(e.target.value)}
                />
              </div>

              <div>
                <Label>Correo electrónico</Label>
                <Input
                  className="mt-1.5 rounded-xl bg-gray-50 text-gray-500"
                  value={user?.email || ''}
                  disabled
                />
              </div>

              <div>
                <Label>Rol del Sistema</Label>
                <div className="mt-1.5 flex items-center gap-2 px-3 py-2 bg-purple-50 rounded-xl border border-purple-100">
                  <Shield className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-semibold text-purple-700">Administrador General</span>
                </div>
              </div>

              <Button
                onClick={handleSaveMyProfile}
                loading={savingMyProfile}
                className="w-full rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold"
              >
                <Save className="w-4 h-4 mr-2" />
                Guardar Mi Perfil
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-gray-900">
                Cambiar Mi Contraseña
              </CardTitle>
              <CardDescription className="text-xs text-gray-400">
                Actualiza tu clave de acceso a la plataforma
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="my-pass">Nueva Contraseña</Label>
                <Input
                  id="my-pass"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  className="mt-1.5 rounded-xl"
                  value={myNewPassword}
                  onChange={(e) => setMyNewPassword(e.target.value)}
                />
              </div>
              <Button
                onClick={handleChangeMyPassword}
                loading={changingMyPassword}
                disabled={!myNewPassword}
                variant="outline"
                className="w-full rounded-xl font-semibold border-gray-200"
              >
                <Lock className="w-4 h-4 mr-2" />
                Actualizar Mi Contraseña
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* MODAL: EDITAR USUARIO, CAMBIAR CORREO, CONTRASEÑA Y ROL */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-violet-600" />
              Editar Usuario
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Modifica los datos de acceso, contraseña o rol de {editingUser?.full_name}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="edit-name" className="text-xs font-semibold text-gray-700">
                Nombre Completo
              </Label>
              <Input
                id="edit-name"
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
                className="mt-1 rounded-xl"
              />
            </div>

            <div>
              <Label htmlFor="edit-email" className="text-xs font-semibold text-gray-700">
                Correo Electrónico (Usuario)
              </Label>
              <Input
                id="edit-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="mt-1 rounded-xl"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-gray-700">Rol en la App</Label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as UserRole)}>
                <SelectTrigger className="mt-1 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="admin">🛡️ Administrador (Acceso total)</SelectItem>
                  <SelectItem value="coordinator">📋 Coordinador (Gestión de vestuarios/eventos)</SelectItem>
                  <SelectItem value="dancer">💃 Bailarín (Consulta y escaneo)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="pt-2 border-t border-gray-100">
              <Label htmlFor="edit-pass" className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-violet-600" />
                Asignar Nueva Contraseña
              </Label>
              <Input
                id="edit-pass"
                type="password"
                placeholder="Dejar en blanco si no deseas cambiarla"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                className="mt-1 rounded-xl placeholder:text-gray-400"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Escribe una nueva clave aquí si el usuario la olvidó o necesitas restablecerla.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setEditingUser(null)}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveEdit}
              loading={savingEdit}
              className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-semibold shadow-sm shadow-violet-200"
            >
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: REGISTRAR NUEVO USUARIO */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-violet-600" />
              Nuevo Usuario
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Crea una cuenta de acceso para un miembro del equipo o academia.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="new-name" className="text-xs font-semibold text-gray-700">
                Nombre Completo
              </Label>
              <Input
                id="new-name"
                placeholder="Ej. María Gómez"
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                className="mt-1 rounded-xl"
              />
            </div>

            <div>
              <Label htmlFor="new-email" className="text-xs font-semibold text-gray-700">
                Correo Electrónico
              </Label>
              <Input
                id="new-email"
                type="email"
                placeholder="maria@arabela.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="mt-1 rounded-xl"
              />
            </div>

            <div>
              <Label htmlFor="new-pass" className="text-xs font-semibold text-gray-700">
                Contraseña Inicial
              </Label>
              <Input
                id="new-pass"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 rounded-xl"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-gray-700">Rol Inicial</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as UserRole)}>
                <SelectTrigger className="mt-1 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="dancer">💃 Bailarín (Consulta y escaneo)</SelectItem>
                  <SelectItem value="coordinator">📋 Coordinador (Gestión de vestuarios)</SelectItem>
                  <SelectItem value="admin">🛡️ Administrador (Acceso total)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setCreateModalOpen(false)}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateUser}
              loading={creatingUser}
              className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-semibold shadow-sm shadow-violet-200"
            >
              Crear Usuario
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
