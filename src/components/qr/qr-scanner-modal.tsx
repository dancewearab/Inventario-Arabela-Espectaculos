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

interface MediaTrackCapabilitiesWithTorch extends MediaTrackCapabilities {
  torch?: boolean
}

export function QRScannerModal({ open, onOpenChange }: QRScannerModalProps) {
  const router = useRouter()
  const [mode, setMode] = useState<'camera' | 'manual'>('camera')
  const [manualCode, setManualCode] = useState('')
  const [cameraLoading, setCameraLoading] = useState(true)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [hasTorch, setHasTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [availableCameras, setAvailableCameras] = useState<{ id: string; label: string }[]>([])
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0)

  // Referencias internas del scanner
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const isScanningRef = useRef(false)
  const readerElementId = 'html5-qr-reader-container'

  const stopScanner = useCallback(async () => {
    if (scannerRef.current && isScanningRef.current) {
      try {
        await scannerRef.current.stop()
        await scannerRef.current.clear()
      } catch {
        // Ignorar errores al detener
      } finally {
        isScanningRef.current = false
      }
    }
  }, [])

  const handleScanSuccess = useCallback(
    (decodedText: string) => {
      // Feedback táctil/vibración si está disponible en móvil
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(100)
        } catch {
          // Ignorar
        }
      }

      // Detener escáner antes de navegar
      stopScanner()
      onOpenChange(false)

      const trimmed = decodedText.trim()
      if (!trimmed) return

      // Si es una URL completa que contiene /qr/, extraer el identificador final
      if (trimmed.includes('/qr/')) {
        const parts = trimmed.split('/qr/')
        const slug = parts[parts.length - 1].split('?')[0].split('#')[0]
        router.push(`/qr/${slug}`)
      } else if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        // Si es otra URL del sistema
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

  const startScanner = useCallback(
    async (cameraIdOrFacing?: string | { facingMode: string }) => {
      if (typeof window === 'undefined') return

      setCameraLoading(true)
      setCameraError(null)

      try {
        const { Html5Qrcode: QrScannerEngine } = await import('html5-qrcode')

        // Asegurar detención previa
        if (scannerRef.current && isScanningRef.current) {
          try {
            await scannerRef.current.stop()
          } catch {
            // Ignorar
          }
          isScanningRef.current = false
        }

        const scanner = new QrScannerEngine(readerElementId)
        scannerRef.current = scanner

        // Listar cámaras disponibles si no se han cargado
        let camerasList: { id: string; label: string }[] = []
        try {
          const cameras = await QrScannerEngine.getCameras()
          if (cameras && cameras.length > 0) {
            camerasList = cameras
            setAvailableCameras(cameras)
          }
        } catch {
          // Ignorar
        }

        const cameraConfig = cameraIdOrFacing || { facingMode: 'environment' }
        const scanOptions = {
          fps: 15,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight)
            const edge = Math.floor(minEdge * 0.75)
            return { width: edge, height: edge }
          },
          aspectRatio: 1.0,
        }

        // Intento 1: Configuración solicitada o cámara trasera (como funcionaba originalmente)
        try {
          await scanner.start(
            cameraConfig,
            scanOptions,
            (decodedText) => {
              handleScanSuccess(decodedText)
            },
            () => {}
          )
        } catch (firstError) {
          console.warn('Intento principal falló, probando fallback para otros dispositivos:', firstError)

          // Fallback 1: Si falló la cámara trasera (ej. laptops o dispositivos sin environment), intentar cámara frontal
          try {
            await scanner.start(
              { facingMode: 'user' },
              {
                fps: 15,
                qrbox: scanOptions.qrbox,
              },
              (decodedText) => {
                handleScanSuccess(decodedText)
              },
              () => {}
            )
          } catch (secondError) {
            console.warn('Fallback cámara frontal falló, probando con ID directo:', secondError)

            // Fallback 2: Intentar con el primer ID de cámara disponible
            if (camerasList.length > 0) {
              await scanner.start(
                camerasList[0].id,
                {
                  fps: 15,
                  qrbox: scanOptions.qrbox,
                },
                (decodedText) => {
                  handleScanSuccess(decodedText)
                },
                () => {}
              )
            } else {
              throw secondError
            }
          }
        }

        isScanningRef.current = true
        setCameraLoading(false)

        // Verificar si soporta linterna/torch
        try {
          const videoElem = document.querySelector(`#${readerElementId} video`) as HTMLVideoElement | null
          if (videoElem && videoElem.srcObject) {
            const track = (videoElem.srcObject as MediaStream).getVideoTracks()[0]
            const capabilities = track.getCapabilities?.() as MediaTrackCapabilitiesWithTorch | undefined
            if (capabilities && capabilities.torch) {
              setHasTorch(true)
            }
          }
        } catch {
          // Ignorar
        }
      } catch (err: unknown) {
        console.warn('Error al iniciar la cámara:', err)
        isScanningRef.current = false
        setCameraLoading(false)

        let msg = 'No se pudo acceder a la cámara.'
        const errObj = err as { name?: string; message?: string }
        if (errObj?.name === 'NotAllowedError' || errObj?.message?.includes('Permission')) {
          msg = 'Permiso de cámara denegado. Permite el acceso a la cámara en los ajustes de tu navegador.'
        } else if (errObj?.name === 'NotFoundError') {
          msg = 'No se encontró ninguna cámara en este dispositivo.'
        }
        setCameraError(msg)
      }
    },
    [handleScanSuccess]
  )

  // Iniciar o detener la cámara según el estado del modal y el modo seleccionado
  useEffect(() => {
    let timer: NodeJS.Timeout

    if (open && mode === 'camera') {
      // Pequeño timeout para permitir que el elemento contenedor de Dialog se monte en el DOM
      timer = setTimeout(() => {
        startScanner()
      }, 100)
    } else {
      stopScanner()
    }

    return () => {
      clearTimeout(timer)
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
          advanced: [{ torch: nextState } as MediaTrackConstraintSet],
        })
        setTorchOn(nextState)
      }
    } catch {
      // Ignorar
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
        router.push(`/qr/${parts[parts.length - 1]}`)
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
              onClick={() => onOpenChange(false)}
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
              ? 'Apunta la cámara del celular al código QR del vestuario o lista'
              : 'Escribe el código o ID del vestuario'}
          </DialogDescription>
        </DialogHeader>

        {mode === 'camera' ? (
          <div className="relative w-full flex flex-col items-center bg-black min-h-[380px]">
            {/* Contenedor donde Html5Qrcode monta el stream de video */}
            <div
              id={readerElementId}
              className="w-full h-full min-h-[360px] flex items-center justify-center overflow-hidden [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
            />

            {/* Overlay visual del visor de escaneo */}
            {!cameraLoading && !cameraError && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                {/* Cuadro de enfoque */}
                <div className="relative w-64 h-64 rounded-2xl border-2 border-violet-500/40 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                  {/* Esquinas estilizadas */}
                  <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-violet-400 rounded-tl-xl" />
                  <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-violet-400 rounded-tr-xl" />
                  <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-violet-400 rounded-bl-xl" />
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-violet-400 rounded-br-xl" />

                  {/* Línea láser animada */}
                  <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-violet-400 to-transparent shadow-[0_0_8px_#a855f7] animate-pulse top-1/2 -translate-y-1/2" />
                </div>
              </div>
            )}

            {/* Spinner de carga inicial de cámara */}
            {cameraLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950/90 gap-3 z-10">
                <Loader2 className="w-10 h-10 text-violet-400 animate-spin" />
                <p className="text-sm font-medium text-gray-300">Iniciando cámara...</p>
                <p className="text-xs text-gray-500">Asegúrate de permitir el acceso</p>
              </div>
            )}

            {/* Error de cámara (permiso denegado, etc) */}
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
                onClick={() => onOpenChange(false)}
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
