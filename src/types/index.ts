export type CostumeStatus =
  | 'available'
  | 'borrowed'
  | 'reserved'
  | 'washing'
  | 'repair'
  | 'lost'

export type UserRole = 'admin' | 'coordinator' | 'dancer'

export type MovementAction =
  | 'checkout'
  | 'return'
  | 'send_wash'
  | 'send_repair'
  | 'mark_lost'
  | 'damage_report'
  | 'status_change'
  | 'assign'

export interface User {
  id: string
  email: string
  full_name: string
  role: UserRole
  avatar_url?: string
  created_at: string
}

export interface Costume {
  id: string
  code: string
  qr_token?: string
  name: string
  category: string
  size: string
  description?: string
  photos: string[]
  status: CostumeStatus
  location?: string
  current_holder_id?: string
  current_event_id?: string
  notes?: string
  created_at: string
  updated_at: string
  // Relations
  current_holder?: User
  current_event?: Event
  list_items?: {
    id: string
    list_id: string
    list?: {
      id: string
      name: string
    }
  }[]
}

export interface CostumeMovement {
  id: string
  costume_id: string
  user_id: string
  event_id?: string
  action: MovementAction
  notes?: string
  photo_url?: string
  created_at: string
  // Relations
  costume?: Costume
  user?: User
  event?: Event
}

export interface Event {
  id: string
  name: string
  date: string
  start_time?: string
  location?: string
  description?: string
  coordinator_id: string
  created_at: string
  updated_at: string
  // Relations
  coordinator?: User
  event_costumes?: EventCostume[]
}

export interface EventCostume {
  id: string
  event_id: string
  costume_id: string
  dancer_id?: string
  notes?: string
  created_at: string
  // Relations
  event?: Event
  costume?: Costume
  dancer?: User
}

export interface DamageReport {
  id: string
  costume_id: string
  reported_by: string
  movement_id?: string
  description: string
  photo_url?: string
  severity: 'low' | 'medium' | 'high'
  resolved: boolean
  resolved_at?: string
  created_at: string
  // Relations
  costume?: Costume
  reporter?: User
}

export interface DashboardStats {
  total: number
  available: number
  borrowed: number
  washing: number
  repair: number
  lost: number
  reserved: number
  alerts: Alert[]
}

export interface Alert {
  id: string
  type: 'overdue' | 'damage' | 'lost' | 'repair'
  message: string
  costume_id: string
  costume_name: string
  created_at: string
}

export type StatusConfig = {
  label: string
  color: string
  bg: string
  border: string
  icon: string
}

export const STATUS_CONFIG: Record<CostumeStatus, StatusConfig> = {
  available: {
    label: 'Disponible',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: '✓',
  },
  borrowed: {
    label: 'Prestado',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: '↗',
  },
  reserved: {
    label: 'Reservado',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: '◷',
  },
  washing: {
    label: 'Lavado',
    color: 'text-cyan-700',
    bg: 'bg-cyan-50',
    border: 'border-cyan-200',
    icon: '◎',
  },
  repair: {
    label: 'Arreglo',
    color: 'text-orange-700',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    icon: '⚙',
  },
  lost: {
    label: 'Perdido',
    color: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: '✗',
  },
}

export const COSTUME_CATEGORIES = [
  'Vestido',
  'Falda',
  'Pantalón',
  'Blusa',
  'Traje completo',
  'Accesorio',
  'Calzado',
  'Tocado',
  'Capa',
  'Otro',
]

export const COSTUME_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Único']

export interface ListItem {
  id: string
  list_id: string
  costume_id: string
  stock: number
  created_at: string
  // Relations
  costume?: Costume
}

export interface List {
  id: string
  name: string
  description?: string
  created_at: string
  updated_at?: string
  // Relations
  items?: ListItem[]
}
