import { useEffect, useRef, useState } from 'react'
import { SPLASH_END_S, gearAngle } from '../utils/splashAngle'

// Launch screen: the PindiCADViewer logo, whose big gear (orange + gray, one
// wheel) turns exactly once, clockwise, around its own axis. Everything else -
// bearing, caliper, inner mechanism, P, cube, text, background - never moves,
// and the camera is fixed.
//
// The logo is a flat PNG, so the gear lives on its own layer (see
// public/splash/, built from public/logo.png): gear-base (the logo with what
// lies behind the gear), gear-ring (the gear alone: original pixels, soft
// edge; only the teeth hidden under the bearing and the caliper stem are
// copied from neighbouring teeth of the same colour), gear-front (the fixed
// elements drawn over the gear). Before the wheel starts and from 2.0 s on,
// the ORIGINAL logo is drawn as is: at rest the screen is the logo, pixel for
// pixel.

const LOGO_W = 723
const LOGO_H = 667
// Rotation axis of the gear, in logo pixels: circle fitted on its tooth tips.
const GEAR_CX = 370.213
const GEAR_CY = 304.403

const FADE_MS = 300

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Device pixels per logo pixel: a whole number, so the static logo is drawn
// without any resampling (no blur), as large as fits in 80 % of the window.
function pixelScale(): number {
  const dpr = window.devicePixelRatio || 1
  const fit = Math.min((window.innerWidth * 0.8 * dpr) / LOGO_W, (window.innerHeight * 0.8 * dpr) / LOGO_H)
  return Math.max(1, Math.floor(fit))
}

interface Layers {
  logo: HTMLImageElement
  base: HTMLImageElement
  ring: HTMLImageElement
  front: HTMLImageElement
}

function draw(ctx: CanvasRenderingContext2D, layers: Layers, k: number, angle: number) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, LOGO_W * k, LOGO_H * k)
  // Integer scale, no smoothing: the logo's own pixels, untouched.
  ctx.imageSmoothingEnabled = false
  if (angle === 0) {
    ctx.drawImage(layers.logo, 0, 0, LOGO_W * k, LOGO_H * k)
    return
  }
  ctx.drawImage(layers.base, 0, 0, LOGO_W * k, LOGO_H * k)
  ctx.save()
  // The turning gear is resampled (sub-pixel rotation): smoothing on.
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.translate(GEAR_CX * k, GEAR_CY * k)
  ctx.rotate((angle * Math.PI) / 180) // canvas y points down: positive = clockwise
  ctx.translate(-GEAR_CX * k, -GEAR_CY * k)
  ctx.drawImage(layers.ring, 0, 0, LOGO_W * k, LOGO_H * k)
  ctx.restore()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(layers.front, 0, 0, LOGO_W * k, LOGO_H * k)
}

export function SplashScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase] = useState<'show' | 'fade' | 'gone'>('show')
  const [scale, setScale] = useState(pixelScale)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const base = import.meta.env.BASE_URL
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    let frame = 0
    let cancelled = false
    let layers: Layers | null = null
    let start = 0
    let frozenAt: number | null = null

    const appReady = new Promise<void>((resolve) => {
      if (document.readyState === 'complete') resolve()
      else window.addEventListener('load', () => resolve(), { once: true })
    })
    // The 2.0 s minimum counts from the moment the wheel's clock starts (images
    // loaded), so the fade can never cut the turn short on a slow machine.
    let turnDone: () => void = () => {}
    const minDuration = new Promise<void>((resolve) => {
      turnDone = resolve
    })

    const tick = (now: number) => {
      if (cancelled || !layers) return
      const t = frozenAt ?? (now - start) / 1000
      draw(ctx, layers, scale, reduceMotion ? 0 : gearAngle(t))
      if (frozenAt === null && t < SPLASH_END_S + 0.1) frame = requestAnimationFrame(tick)
    }

    Promise.all([
      loadImage(`${base}logo.png`),
      loadImage(`${base}splash/gear-base.png`),
      loadImage(`${base}splash/gear-ring.png`),
      loadImage(`${base}splash/gear-front.png`),
    ])
      .then(([logo, baseLayer, ring, front]) => {
        if (cancelled) return
        layers = { logo, base: baseLayer, ring, front }
        // Development / test hook: render the launch screen at any time t (s)
        // and keep it there, to check frames pixel by pixel.
        if (import.meta.env.DEV) {
          ;(window as unknown as { __pindiSplash?: object }).__pindiSplash = {
            renderAt: (t: number) => {
              frozenAt = t
              cancelAnimationFrame(frame)
              if (layers) draw(ctx, layers, scale, gearAngle(t))
              return { angle: gearAngle(t), scale }
            },
            scale,
          }
        }
        start = performance.now()
        // First frame drawn at once (the still logo): it shows even if animation
        // frames are delayed, e.g. a window opened in the background.
        draw(ctx, layers, scale, 0)
        frame = requestAnimationFrame(tick)
        window.setTimeout(turnDone, SPLASH_END_S * 1000)
      })
      .catch(() => {
        // Assets missing: no splash rather than a broken one.
        if (!cancelled) setPhase('gone')
      })

    // Development only: ?splash-hold keeps the screen up (frame checks).
    const hold = import.meta.env.DEV && new URLSearchParams(window.location.search).has('splash-hold')
    Promise.all([appReady, minDuration]).then(() => {
      if (cancelled || frozenAt !== null || hold) return
      setPhase('fade')
      window.setTimeout(() => !cancelled && setPhase('gone'), FADE_MS)
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [scale])

  useEffect(() => {
    const onResize = () => setScale(pixelScale())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (phase === 'gone') return null

  const dpr = window.devicePixelRatio || 1
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--bg-app)]"
      style={{ opacity: phase === 'fade' ? 0 : 1, transition: `opacity ${FADE_MS}ms ease` }}
    >
      <canvas
        ref={canvasRef}
        width={LOGO_W * scale}
        height={LOGO_H * scale}
        style={{ width: (LOGO_W * scale) / dpr, height: (LOGO_H * scale) / dpr, imageRendering: 'pixelated' }}
      />
    </div>
  )
}
