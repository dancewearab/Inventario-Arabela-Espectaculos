'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  X,
  Camera,
  FlipHorizontal,
  Zap,
  ZapOff,
  Keyboard,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Html5Qrcode } from 'html5-qrcode'

interface QRScannerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface CameraDeviceItem {
  id: string
  label: string
}

export function QRScannerModal({ open, onOpenChange }: QRScannerModalProps) {
  const router = useRouter()
  const [mode, setMode] = useState<'camera' | 'manual'>('camera')
  const [manualCode, setManualCode] = useState('')
  const [cameraLoading, setCameraLoading] = useState(true)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [hasTorch, setHasTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [availableCameras, setAvailableCameras] = useState<CameraDeviceItem[]>([])
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0)

  // Referencias para el ciclo de vida y control concurrente
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const isScanningRef = useRef(false)
  const sessionCountRef = useRef(0)
  const observerRef = useRef<MutationObserver | null>(null)
  const readerElementId = 'html5-qr-reader-container'

  // Configura y fuerza los atributos necesarios para reproducción inline en iOS/Android
  const ensureVideoPlaying = useCallback((containerEl: HTMLElement) => {
    const video = containerEl.querySelector('video') as HTMLVideoElement | null
    if (!video) return

    // Atributos indispensables para evitar pantalla negra en Safari (iOS) y Chrome (Android)
    video.setAttribute('playsinline', 'true')
    video.setAttribute('webkit-playsinline', 'true')
    video.setAttribute('autoplay', 'true')
    video.setAttribute('muted', 'true')
    video.muted = true
    video.playsInline = true

    // Estilos inline forzados para que cubra exactamente el contenedor
    video.style.width = '100%'
    video.style.height = '100%'
    video.style.objectFit = 'cover'
    video.style.display = 'block'
    video.style.position = 'absolute'
    video.style.top = '0'
    video.style.left = '0'
    video.style.zIndex = '1'

    const playPromise = video.play()
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Si el navegador bloqueó el autoplay, reintentar cuando carguen metadatos
        const onMetadata = () => {
          video.play().catch(() => {})
          video.removeEventListener('loadedmetadata', onMetadata)
        }
        video.addEventListener('loadedmetadata', onMetadata)
      })
    }
  }, [])

  // Detener y liberar el escáner y la cámara
  const stopScanner = useCallback(async () => {
    isScanningRef.current = false
    setTorchOn(false)
    setHasTorch(false)

    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }

    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState()
        // Html5QrcodeScannerState: SCANNING = 2, PAUSED = 3
        if (state === 2 || state === 3) {
          await scannerRef.current.stop()
        }
        await scannerRef.current.clear()
      } catch (err) {
        console.warn('Error al detener escáner:', err)
      } finally {
        scannerRef.current = null
      }
    }
  }, [])

  const handleScanSuccess = useCallback(
    (decodedText: string) => {
      // Feedback táctil/vibración si está disponible
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(100)
        } catch {
          // Ignorar
        }
      }

      // Detener escáner antes de redirigir
      stopScanner()
      onOpenChange(false)

      const trimmed = decodedText.trim()
      if (!trimmed) return

      // Extraer identificador si es URL de /qr/
      if (trimmed.includes('/qr/')) {
        const parts = trimmed.split('/qr/')
        const slug = parts[parts.length - 1].split('?')[0].split('#')[0]
        router.push(`/qr/${slug}`)
      } else if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        try {
          const urlObj = new URL(trimmed)
          router.push(urlObj.pathname)
        } catch {
          router.push(`/qr/${trimmed}`)
        }
      } else {
        router.push(`/qr/${trimmed}`)
      }
    },
    [router, onOpenChange, stopScanner]
  )

  // Iniciar la cámara de forma robusta con fallbacks automáticos
  const startScanner = useCallback(
    async (cameraId?: string) => {
      if (typeof window === 'undefined') return

      const currentSession = ++sessionCountRef.current
      setCameraLoading(true)
      setCameraError(null)

      // Verificar contexto seguro (HTTPS o localhost)
      if (
        !window.isSecureContext &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1'
      ) {
        setCameraLoading(false)
        setCameraError(
          'El acceso a la cámara requiere conexión segura (HTTPS). En desarrollo local desde celular, accede mediante un túnel HTTPS o localhost.'
        )
        return
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraLoading(false)
        setCameraError('Este navegador no tiene soporte para la cámara o los permisos están restringidos.')
        return
      }

      // Esperar a que el elemento contenedor exista en el DOM (máximo 1 segundo)
      let container: HTMLElement | null = null
      for (let i = 0; i < 20; i++) {
        container = document.getElementById(readerElementId)
        if (container) break
        await new Promise((r) => setTimeout(r, 50))
      }

      if (!container || currentSession !== sessionCountRef.current) {
        if (!container) {
          setCameraLoading(false)
          setCameraError('No se encontró el contenedor de video en pantalla.')
        }
        return
      }

      // Limpiar escáner anterior si existía
      await stopScanner()

      if (currentSession !== sessionCountRef.current) return

      // Observador de mutaciones para inyectar playsinline y autoplay tan pronto se cree el <video>
      if (observerRef.current) observerRef.current.disconnect()
      observerRef.current = new MutationObserver(() => {
        if (container) ensureVideoPlaying(container)
      })
      observerRef.current.observe(container, { childList: true, subtree: true })

      try {
        const { Html5Qrcode: QrScannerEngine } = await import('html5-qrcode')
        const scanner = new QrScannerEngine(readerElementId)
        scannerRef.current = scanner

        // Escaneo full frame: sin qrbox para que no inyecte el div #qr-shaded-region con bordes negros opacos
        const scanConfig = {
          fps: 15,
        }

        const onScanSuccess = (decodedText: string) => {
          handleScanSuccess(decodedText)
        }
        const onScanError = () => {
          // Ignorar frames sin código QR
        }

        let started = false

        if (cameraId) {
          // Si el usuario seleccionó una cámara específica
          await scanner.start(cameraId, scanConfig, onScanSuccess, onScanError)
          started = true
        } else {
          // 1. Intentar cámara trasera (ideal para móvil)
          try {
            await scanner.start(
              { facingMode: 'environment' },
              scanConfig,
              onScanSuccess,
              onScanError
            )
            started = true
          } catch (envError) {
            console.warn('Cámara trasera no disponible, probando cámara frontal o predeterminada:', envError)
            if (currentSession !== sessionCountRef.current) return

            // 2. Fallback a cámara frontal/predeterminada (laptop, PC, webcam, etc.)
            try {
              await scanner.start(
                { facingMode: 'user' },
                scanConfig,
                onScanSuccess,
                onScanError
              )
              started = true
            } catch (userError) {
              console.warn('Cámara frontal no disponible, probando cualquier cámara disponible:', userError)
              if (currentSession !== sessionCountRef.current) return

              // 3. Fallback a enumeración directa de dispositivos de video
              const devices = await navigator.mediaDevices.enumerateDevices()
              const videoDevices = devices.filter((d) => d.kind === 'videoinput')
              if (videoDevices.length > 0) {
                await scanner.start(
                  videoDevices[0].deviceId,
                  scanConfig,
                  onScanSuccess,
                  onScanError
                )
                started = true
              } else {
                throw userError
              }
            }
          }
        }

        if (currentSession !== sessionCountRef.current) {
          await stopScanner()
          return
        }

        if (started) {
          isScanningRef.current = true
          setCameraLoading(false)

          // Asegurar que el video se esté reproduciendo activamente y con atributos correctos
          if (container) {
            ensureVideoPlaying(container)
            // Doble chequeo en 200ms y 500ms por seguridad ante retardos de hardware móvil
            setTimeout(() => {
              if (container && currentSession === sessionCountRef.current) {
                ensureVideoPlaying(container)
              }
            }, 200)
            setTimeout(() => {
              if (container && currentSession === sessionCountRef.current) {
                ensureVideoPlaying(container)
              }
            }, 500)
          }

          // Enumerar cámaras disponibles de forma segura sin interrumpir el stream
          try {
            const devices = await navigator.mediaDevices.enumerateDevices()
            const videoDevices = devices
              .filter((d) => d.kind === 'videoinput')
              .map((d, index) => ({
                id: d.deviceId,
                label: d.label || `Cámara ${index + 1}`,
              }))

            if (videoDevices.length > 0) {
              setAvailableCameras(videoDevices)
            }
          } catch {
            // Ignorar errores al enumerar
          }

          // Verificar soporte de linterna/flash
          try {
            const videoElem = document.querySelector(`#${readerElementId} video`) as HTMLVideoElement | null
            if (videoElem && videoElem.srcObject) {
              const track = (videoElem.srcObject as MediaStream).getVideoTracks()[0]
              const capabilities = track.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined
              if (capabilities && 'torch' in capabilities && capabilities.torch) {
                setHasTorch(true)
              }
            }
          } catch {
            // Ignorar
          }
        }
      } catch (err: unknown) {
        if (currentSession !== sessionCountRef.current) return

        console.error('Error al iniciar cámara:', err)
        isScanningRef.current = false
        setCameraLoading(false)

        let msg = 'No se pudo acceder a la cámara.'
        const errObj = err as { name?: string; message?: string }
        const name = errObj?.name || ''
        const text = String(errObj?.message || '')

        if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || text.includes('Permission')) {
          msg = 'Permiso de cámara denegado. Permite el acceso a la cámara en los ajustes de tu navegador.'
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          msg = 'No se detectó ninguna cámara disponible en este dispositivo.'
        } else if (name === 'NotReadableError' || name === 'TrackStartError' || text.includes('already in use')) {
          msg = 'La cámara está siendo usada por otra aplicación. Ciérrala y reintenta.'
        } else if (name === 'OverconstrainedError') {
          msg = 'No se pudo configurar la cámara con la resolución requerida. Reintenta con otra cámara.'
        }
        setCameraError(msg)
      }
    },
    [handleScanSuccess, stopScanner, ensureVideoPlaying]
  )

  // Iniciar/Detener según apertura del modal y modo
  useEffect(() => {
    let active = true

    if (open && mode === 'camera') {
      const timer = setTimeout(() => {
        if (active) {
          startScanner()
        }
      }, 50)
      return () => {
        active = false
        clearTimeout(timer)
        stopScanner()
      }
    } else {
      stopScanner()
    }

    return () => {
      active = false
      stopScanner()
    }
  }, [open, mode, startScanner, stopScanner])

  const toggleTorch = async () => {
    try {
      const videoElem = document.querySelector(`#${readerElementId} video`) as HTMLVideoElement | null
      if (videoElem && videoElem.srcObject) {
        const track = (videoElem.srcObject as MediaStream).getVideoTracks()[0]
        const nextState = !torchOn
        await track.applyConstraints({
          // @ts-expect-error torch constraint
          advanced: [{ torch: nextState }],
        })
        setTorchOn(nextState)
      }
    } catch (e) {
      console.warn('Error al activar linterna:', e)
    }
  }

  const switchCamera = async () => {
    if (availableCameras.length <= 1) return
    const nextIndex = (currentCameraIndex + 1) % availableCameras.length
    setCurrentCameraIndex(nextIndex)
    await startScanner(availableCameras[nextIndex].id)
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = manualCode.trim()
    if (trimmed) {
      stopScanner()
      onOpenChange(false)
      setManualCode('')
      if (trimmed.includes('/qr/')) {
        const parts = trimmed.split('/qr/')
        const slug = parts[parts.length - 1].split('?')[0].split('#')[0]
        router.push(`/qr/${slug}`)
      } else {
        router.push(`/qr/${trimmed}`)
      }
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          stopScanner()
        }
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-3xl border-0 shadow-2xl bg-gray-950 text-white">
        <DialogHeader className="p-4 pb-2 text-center relative z-10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-violet-400">
              {mode === 'camera' ? 'Cámara Activa' : 'Ingreso Manual'}
            </span>
            <button
              onClick={() => {
                stopScanner()
                onOpenChange(false)
              }}
              className="p-1.5 rounded-full bg-white/10 text-gray-300 hover:text-white hover:bg-white/20 transition-colors"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <DialogTitle className="text-xl font-bold text-white mt-1">
            {mode === 'camera' ? 'Escanear Código QR' : 'Ingresar Código Manual'}
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-400">
            {mode === 'camera'
              ? 'Apunta la cámara del dispositivo al código QR del vestuario o lista'
              : 'Escribe el código o ID del vestuario'}
          </DialogDescription>
        </DialogHeader>

        {mode === 'camera' ? (
          <div className="relative w-full h-[400px] bg-black overflow-hidden flex items-center justify-center">
            {/* Contenedor donde Html5Qrcode monta el stream de video */}
            <div
              id={readerElementId}
              className="w-full h-full relative overflow-hidden [&_video]:!w-full [&_video]:!h-full [&_video]:!object-cover [&_video]:!block [&_video]:!absolute [&_video]:!inset-0 [&_video]:!z-0 [&_#qr-shaded-region]:!hidden [&_canvas]:!hidden"
            />

            {/* Overlay visual del visor de escaneo */}
            {!cameraLoading && !cameraError && (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10">
                {/* Cuadro de enfoque limpio sin shadow hack para evitar incompatibilidades de GPU en móviles */}
                <div className="relative w-64 h-64 rounded-2xl border-2 border-violet-500/40">
                  {/* Esquinas estilizadas iluminadas */}
                  <div className="absolute -top-1 -left-1 w-7 h-7 border-t-4 border-l-4 border-violet-400 rounded-tl-xl shadow-[0_0_10px_#a855f7]" />
                  <div className="absolute -top-1 -right-1 w-7 h-7 border-t-4 border-r-4 border-violet-400 rounded-tr-xl shadow-[0_0_10px_#a855f7]" />
                  <div className="absolute -bottom-1 -left-1 w-7 h-7 border-b-4 border-l-4 border-violet-400 rounded-bl-xl shadow-[0_0_10px_#a855f7]" />
                  <div className="absolute -bottom-1 -right-1 w-7 h-7 border-b-4 border-r-4 border-violet-400 rounded-br-xl shadow-[0_0_10px_#a855f7]" />

                  {/* Línea láser animada */}
                  <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-violet-400 to-transparent shadow-[0_0_8px_#a855f7] animate-pulse top-1/2 -translate-y-1/2" />
                </div>
                <p className="mt-4 text-xs font-medium text-gray-300/80 bg-black/60 px-3 py-1 rounded-full backdrop-blur-sm border border-white/10">
                  Enfoca el código QR en el recuadro
                </p>
              </div>
            )}

            {/* Spinner de carga inicial de cámara */}
            {cameraLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950/90 gap-3 z-10">
                <Loader2 className="w-10 h-10 text-violet-400 animate-spin" />
                <p className="text-sm font-medium text-gray-300">Iniciando cámara...</p>
                <p className="text-xs text-gray-500">Permite el acceso a la cámara si el navegador lo solicita</p>
              </div>
            )}

            {/* Error de cámara */}
            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950 p-6 text-center gap-3 z-10">
                <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <p className="text-sm text-gray-200 font-medium max-w-xs">{cameraError}</p>
                <div className="flex flex-col gap-2 w-full max-w-xs mt-2">
                  <Button
                    onClick={() => startScanner()}
                    variant="outline"
                    className="border-white/20 text-white hover:bg-white/10 rounded-xl text-sm"
                  >
                    Reintentar cámara
                  </Button>
                  <Button
                    onClick={() => {
                      stopScanner()
                      setMode('manual')
                    }}
                    className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm"
                  >
                    Ingresar código manualmente
                  </Button>
                </div>
              </div>
            )}

            {/* Controles flotantes en la cámara: Flash, Cambiar cámara, Código manual */}
            {!cameraLoading && !cameraError && (
              <div className="absolute bottom-4 left-0 right-0 px-4 flex items-center justify-between z-20">
                {hasTorch ? (
                  <button
                    onClick={toggleTorch}
                    className={`p-3 rounded-full backdrop-blur-md transition-colors ${
                      torchOn ? 'bg-amber-400 text-black' : 'bg-black/50 text-white hover:bg-black/70'
                    }`}
                    aria-label="Linterna"
                  >
                    {torchOn ? <Zap className="w-5 h-5 fill-black" /> : <ZapOff className="w-5 h-5" />}
                  </button>
                ) : (
                  <div className="w-11" />
                )}

                <button
                  onClick={() => {
                    stopScanner()
                    setMode('manual')
                  }}
                  className="px-4 py-2 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-xs font-semibold text-gray-200 hover:text-white flex items-center gap-1.5 shadow-lg active:scale-95 transition-transform"
                >
                  <Keyboard className="w-4 h-4 text-violet-400" />
                  Escribir código
                </button>

                {availableCameras.length > 1 ? (
                  <button
                    onClick={switchCamera}
                    className="p-3 rounded-full bg-black/50 backdrop-blur-md text-white hover:bg-black/70 transition-colors active:scale-95"
                    aria-label="Cambiar cámara"
                    title="Cambiar cámara"
                  >
                    <FlipHorizontal className="w-5 h-5" />
                  </button>
                ) : (
                  <div className="w-11" />
                )}
              </div>
            )}
          </div>
        ) : (
          /* Modo Ingreso Manual */
          <div className="p-6 bg-gray-900 min-h-[320px] flex flex-col justify-between">
            <form onSubmit={handleManualSubmit} className="space-y-4 pt-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-300">
                  Código de vestuario, lista o ID:
                </label>
                <Input
                  placeholder="Ej. VES-001 o pega el enlace..."
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  className="h-12 text-base text-center font-medium rounded-xl bg-gray-950 border-gray-700 text-white placeholder:text-gray-500 focus:border-violet-500 focus:ring-violet-500"
                  autoFocus
                />
              </div>

              <Button
                type="submit"
                disabled={!manualCode.trim()}
                className="w-full h-12 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-base shadow-lg shadow-violet-500/25 disabled:opacity-50"
              >
                Buscar y Continuar
              </Button>
            </form>

            <div className="pt-6 border-t border-gray-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setMode('camera')
                }}
                className="text-xs font-semibold text-violet-400 hover:text-violet-300 flex items-center gap-1.5 py-1"
              >
                <Camera className="w-4 h-4" />
                Volver a la cámara
              </button>
              <button
                type="button"
                onClick={() => {
                  stopScanner()
                  onOpenChange(false)
                }}
                className="text-xs text-gray-400 hover:text-gray-300"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
