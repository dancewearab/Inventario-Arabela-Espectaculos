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
import jsQR from 'jsqr'

interface QRScannerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface CameraDeviceItem {
  id: string
  label: string
}

// Interfaz para la API nativa de BarcodeDetector si está disponible en el navegador
interface NativeBarcode {
  rawValue: string
}

interface NativeBarcodeDetector {
  detect(image: HTMLVideoElement | HTMLCanvasElement): Promise<NativeBarcode[]>
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats: string[] }) => NativeBarcodeDetector
  }
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

  // Referencias directas para reproducción de video nativo y escaneo
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const isScanningRef = useRef(false)
  const activeSessionRef = useRef(0)
  const barcodeDetectorRef = useRef<NativeBarcodeDetector | null>(null)

  // Detener todos los tracks de la cámara y el ciclo de escaneo
  const stopCamera = useCallback(() => {
    isScanningRef.current = false

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop()
        } catch {
          // Ignorar
        }
      })
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setTorchOn(false)
    setHasTorch(false)
  }, [])

  const handleScanSuccess = useCallback(
    (decodedText: string) => {
      // Vibración de confirmación en móviles
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(100)
        } catch {
          // Ignorar
        }
      }

      stopCamera()
      onOpenChange(false)

      const trimmed = decodedText.trim()
      if (!trimmed) return

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
    [router, onOpenChange, stopCamera]
  )

  // Bucle de escaneo continuo (combina BarcodeDetector nativo por GPU con fallback a jsQR)
  const startScanningLoop = useCallback(() => {
    // Inicializar BarcodeDetector si el navegador lo soporta
    if (typeof window !== 'undefined' && window.BarcodeDetector && !barcodeDetectorRef.current) {
      try {
        barcodeDetectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] })
      } catch {
        barcodeDetectorRef.current = null
      }
    }

    let lastScanTime = 0
    const SCAN_INTERVAL_MS = 100 // Escanear ~10 veces por segundo para máximo rendimiento y bajo consumo

    const scanFrame = async (timestamp: number) => {
      if (!isScanningRef.current) return

      const video = videoRef.current
      if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
        if (timestamp - lastScanTime >= SCAN_INTERVAL_MS) {
          lastScanTime = timestamp

          // 1. Intentar con BarcodeDetector nativo por hardware (súper rápido en Android Chrome y navegadores modernos)
          if (barcodeDetectorRef.current) {
            try {
              const barcodes = await barcodeDetectorRef.current.detect(video)
              if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                handleScanSuccess(barcodes[0].rawValue)
                return
              }
            } catch {
              // Si falla el detector nativo, continuar con jsQR
            }
          }

          // 2. Fallback universal con jsQR (funciona en el 100% de dispositivos, incluyendo Safari iOS)
          try {
            if (!canvasRef.current) {
              canvasRef.current = document.createElement('canvas')
            }
            const canvas = canvasRef.current
            const ctx = canvas.getContext('2d', { willReadFrequently: true })

            if (ctx) {
              // Escala de análisis optimizada (máximo 480px) para escaneo instantáneo
              const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight))
              const scanWidth = Math.floor(video.videoWidth * scale)
              const scanHeight = Math.floor(video.videoHeight * scale)

              if (canvas.width !== scanWidth || canvas.height !== scanHeight) {
                canvas.width = scanWidth
                canvas.height = scanHeight
              }

              ctx.drawImage(video, 0, 0, scanWidth, scanHeight)
              const imageData = ctx.getImageData(0, 0, scanWidth, scanHeight)
              const code = jsQR(imageData.data, scanWidth, scanHeight, {
                inversionAttempts: 'dontInvert',
              })

              if (code && code.data) {
                handleScanSuccess(code.data)
                return
              }
            }
          } catch {
            // Ignorar errores de procesamiento de frame
          }
        }
      }

      if (isScanningRef.current) {
        animFrameRef.current = requestAnimationFrame(scanFrame)
      }
    }

    isScanningRef.current = true
    animFrameRef.current = requestAnimationFrame(scanFrame)
  }, [handleScanSuccess])

  // Iniciar la cámara mediante MediaDevices nativo con auto-reproducción segura
  const startCamera = useCallback(
    async (targetDeviceId?: string) => {
      if (typeof window === 'undefined') return

      const session = ++activeSessionRef.current
      setCameraLoading(true)
      setCameraError(null)

      // Verificar contexto seguro
      if (
        !window.isSecureContext &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1'
      ) {
        setCameraLoading(false)
        setCameraError(
          'La cámara requiere una conexión segura (HTTPS). En celular, accede mediante HTTPS o localhost.'
        )
        return
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraLoading(false)
        setCameraError('Tu navegador no admite acceso a la cámara o los permisos están bloqueados.')
        return
      }

      // Detener cualquier transmisión previa
      stopCamera()

      let stream: MediaStream | null = null

      try {
        // Estrategia de constraints: específica -> trasera (ideal) -> frontal/cualquiera
        if (targetDeviceId) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: targetDeviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          })
        } else {
          try {
            // 1. Intentar cámara trasera para celulares (ideal para escanear QR)
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
              audio: false,
            })
          } catch (envErr) {
            console.warn('Cámara trasera no disponible, probando cámara estándar/frontal:', envErr)
            if (session !== activeSessionRef.current) return

            // 2. Fallback a cualquier cámara (laptop, PC, webcam)
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            })
          }
        }

        if (session !== activeSessionRef.current) {
          if (stream) {
            stream.getTracks().forEach((t) => t.stop())
          }
          return
        }

        streamRef.current = stream

        // Conectar el stream directamente al elemento <video> de React
        const video = videoRef.current
        if (video) {
          video.srcObject = stream

          // Forzar atributos esenciales para iOS Safari y Android
          video.setAttribute('playsinline', 'true')
          video.setAttribute('webkit-playsinline', 'true')
          video.setAttribute('autoplay', 'true')
          video.setAttribute('muted', 'true')
          video.muted = true

          try {
            await video.play()
          } catch (playErr) {
            console.warn('Error en video.play(), esperando evento loadedmetadata:', playErr)
            video.onloadedmetadata = () => {
              video.play().catch(() => {})
            }
          }
        }

        setCameraLoading(false)

        // Verificar soporte de linterna en el track activo
        const videoTrack = stream.getVideoTracks()[0]
        if (videoTrack) {
          try {
            const capabilities = videoTrack.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined
            if (capabilities && 'torch' in capabilities && capabilities.torch) {
              setHasTorch(true)
            }
          } catch {
            // Ignorar
          }
        }

        // Listar cámaras disponibles para el botón de alternar cámara
        try {
          const devices = await navigator.mediaDevices.enumerateDevices()
          const videoInputs = devices
            .filter((d) => d.kind === 'videoinput')
            .map((d, idx) => ({
              id: d.deviceId,
              label: d.label || `Cámara ${idx + 1}`,
            }))

          if (videoInputs.length > 0) {
            setAvailableCameras(videoInputs)
          }
        } catch {
          // Ignorar
        }

        // Iniciar el bucle de detección de QR sobre el video en vivo
        startScanningLoop()
      } catch (err: unknown) {
        if (session !== activeSessionRef.current) return

        console.error('Error al acceder a la cámara:', err)
        stopCamera()
        setCameraLoading(false)

        let msg = 'No se pudo acceder a la cámara.'
        const errObj = err as { name?: string; message?: string }
        const name = errObj?.name || ''
        const text = String(errObj?.message || '')

        if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || text.includes('Permission')) {
          msg = 'Permiso denegado. Permite el acceso a la cámara en los ajustes de tu navegador.'
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          msg = 'No se encontró ninguna cámara disponible en este dispositivo.'
        } else if (name === 'NotReadableError' || name === 'TrackStartError' || text.includes('in use')) {
          msg = 'La cámara está siendo usada por otra aplicación. Ciérrala y reintenta.'
        } else if (name === 'OverconstrainedError') {
          msg = 'No se pudo configurar la cámara seleccionada. Intentando con otra cámara...'
        }

        setCameraError(msg)
      }
    },
    [stopCamera, startScanningLoop]
  )

  // Iniciar/detener según la apertura del modal y el modo seleccionado
  useEffect(() => {
    if (open && mode === 'camera') {
      // Pequeño retardo para asegurar que el modal y el elemento <video> estén en el DOM
      const timer = setTimeout(() => {
        startCamera()
      }, 50)

      return () => {
        clearTimeout(timer)
        stopCamera()
      }
    } else {
      stopCamera()
    }

    return () => {
      stopCamera()
    }
  }, [open, mode, startCamera, stopCamera])

  // Alternar linterna/flash
  const toggleTorch = async () => {
    try {
      const track = streamRef.current?.getVideoTracks()[0]
      if (track) {
        const nextState = !torchOn
        await track.applyConstraints({
          // @ts-expect-error torch constraint nativo
          advanced: [{ torch: nextState }],
        })
        setTorchOn(nextState)
      }
    } catch (e) {
      console.warn('Error al activar linterna:', e)
    }
  }

  // Alternar entre cámaras disponibles
  const switchCamera = async () => {
    if (availableCameras.length <= 1) return
    const nextIndex = (currentCameraIndex + 1) % availableCameras.length
    setCurrentCameraIndex(nextIndex)
    await startCamera(availableCameras[nextIndex].id)
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = manualCode.trim()
    if (trimmed) {
      stopCamera()
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
          stopCamera()
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
                stopCamera()
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
              ? 'Apunta la cámara al código QR del vestuario o lista'
              : 'Escribe el código o ID del vestuario'}
          </DialogDescription>
        </DialogHeader>

        {mode === 'camera' ? (
          <div className="relative w-full h-[420px] bg-black overflow-hidden flex items-center justify-center">
            {/* Elemento de video HTML5 real renderizado directamente por React sin librerías invasivas */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover z-0"
            />

            {/* Overlay visual del visor de escaneo */}
            {!cameraLoading && !cameraError && (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10">
                {/* Cuadro de enfoque centrado */}
                <div className="relative w-64 h-64 rounded-2xl border-2 border-violet-500/50">
                  {/* Esquinas iluminadas */}
                  <div className="absolute -top-1 -left-1 w-7 h-7 border-t-4 border-l-4 border-violet-400 rounded-tl-xl shadow-[0_0_10px_#a855f7]" />
                  <div className="absolute -top-1 -right-1 w-7 h-7 border-t-4 border-r-4 border-violet-400 rounded-tr-xl shadow-[0_0_10px_#a855f7]" />
                  <div className="absolute -bottom-1 -left-1 w-7 h-7 border-b-4 border-l-4 border-violet-400 rounded-bl-xl shadow-[0_0_10px_#a855f7]" />
                  <div className="absolute -bottom-1 -right-1 w-7 h-7 border-b-4 border-r-4 border-violet-400 rounded-br-xl shadow-[0_0_10px_#a855f7]" />

                  {/* Láser animado */}
                  <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-violet-400 to-transparent shadow-[0_0_8px_#a855f7] animate-pulse top-1/2 -translate-y-1/2" />
                </div>
                <p className="mt-4 text-xs font-medium text-gray-300 bg-black/60 px-3 py-1 rounded-full backdrop-blur-sm border border-white/10 shadow-md">
                  Enfoca el código QR en el recuadro
                </p>
              </div>
            )}

            {/* Spinner de carga inicial */}
            {cameraLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950/95 gap-3 z-20">
                <Loader2 className="w-10 h-10 text-violet-400 animate-spin" />
                <p className="text-sm font-medium text-gray-300">Iniciando cámara...</p>
                <p className="text-xs text-gray-500">Permite el acceso si el navegador lo solicita</p>
              </div>
            )}

            {/* Vista de error si la cámara fue bloqueada o no está disponible */}
            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950 p-6 text-center gap-3 z-20">
                <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <p className="text-sm text-gray-200 font-medium max-w-xs">{cameraError}</p>
                <div className="flex flex-col gap-2 w-full max-w-xs mt-2">
                  <Button
                    onClick={() => startCamera()}
                    variant="outline"
                    className="border-white/20 text-white hover:bg-white/10 rounded-xl text-sm"
                  >
                    Reintentar cámara
                  </Button>
                  <Button
                    onClick={() => {
                      stopCamera()
                      setMode('manual')
                    }}
                    className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm"
                  >
                    Ingresar código manualmente
                  </Button>
                </div>
              </div>
            )}

            {/* Controles flotantes en la cámara: Linterna, Cambiar cámara, Código manual */}
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
                    stopCamera()
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
                  stopCamera()
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
