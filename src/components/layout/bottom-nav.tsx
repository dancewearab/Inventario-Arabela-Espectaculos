'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Shirt,
  Calendar,
  Layers,
  QrCode,
} from 'lucide-react'
import { cn } from '@/utils'
import { useState } from 'react'
import { QRScannerModal } from '@/components/qr/qr-scanner-modal'

export function BottomNav() {
  const pathname = usePathname()
  const [scannerOpen, setScannerOpen] = useState(false)

  // Do not show on auth pages or QR full screen
  if (pathname === '/login' || pathname.startsWith('/qr/')) {
    return null
  }

  const navItems = [
    { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
    { href: '/inventory', label: 'Inventario', icon: Shirt },
    { isAction: true, label: 'Escanear', icon: QrCode },
    { href: '/lists', label: 'Listas', icon: Layers },
    { href: '/events', label: 'Eventos', icon: Calendar },
  ]

  return (
    <>
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200/80 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] px-2 py-1.5 safe-area-pb">
        <div className="flex items-center justify-around max-w-lg mx-auto">
          {navItems.map((item, idx) => {
            if (item.isAction) {
              return (
                <button
                  key={idx}
                  onClick={() => setScannerOpen(true)}
                  className="flex flex-col items-center -mt-5 focus:outline-none group"
                  aria-label="Escanear código QR con la cámara"
                >
                  <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-violet-600 via-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-violet-500/30 group-active:scale-95 transition-transform duration-150 ring-4 ring-white">
                    <QrCode className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-semibold text-violet-700 mt-1">Escanear</span>
                </button>
              )
            }

            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href!))
            const Icon = item.icon!

            return (
              <Link
                key={item.href}
                href={item.href!}
                className={cn(
                  'flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all duration-150',
                  isActive
                    ? 'text-violet-700 font-semibold'
                    : 'text-gray-500 hover:text-gray-800'
                )}
              >
                <div className={cn(
                  'p-1 rounded-lg transition-colors',
                  isActive ? 'bg-violet-100/70 text-violet-700' : 'text-gray-500'
                )}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] mt-0.5 tracking-tight">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Modal de escáner con cámara del dispositivo */}
      <QRScannerModal open={scannerOpen} onOpenChange={setScannerOpen} />
    </>
  )
}
