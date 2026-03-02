import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSessionStore } from '../../stores/sessionStore'

interface OrbState {
  id: number
  type: 'green' | 'red'
  cx: number    // 25–75% horizontal
  cy: number    // 25–75% vertical
  scale: number // 0.8 – 1.35
  dur: number   // 2.2 – 3.4s
  skew: number  // ellipse aspect 0.7–1.0
}

const COLORS = {
  green: {
    flash:  'rgba(80,255,160,0.72)',
    core:   'rgba(0,255,120,0.55)',
    mid:    'rgba(0,220,100,0.28)',
    outer:  'rgba(0,180,80,0.13)',
    bloom:  'rgba(0,150,70,0.07)',
  },
  red: {
    flash:  'rgba(255,100,80,0.68)',
    core:   'rgba(255,55,55,0.52)',
    mid:    'rgba(230,40,40,0.26)',
    outer:  'rgba(200,30,30,0.12)',
    bloom:  'rgba(160,20,20,0.06)',
  },
}

let idSeq = 0
const rnd = (min: number, max: number) => min + Math.random() * (max - min)

export function OrbBlast() {
  const status = useSessionStore((s) => s.status)
  const prevRef = useRef(status)
  const [orb, setOrb] = useState<OrbState | null>(null)

  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = status

    let type: 'green' | 'red' | null = null
    if (prev === 'idle' && status === 'running') type = 'green'
    else if ((prev === 'running' || prev === 'paused') && status === 'idle') type = 'red'
    if (!type) return

    setOrb({
      id: ++idSeq,
      type,
      cx: rnd(28, 72),
      cy: rnd(28, 68),
      scale: rnd(0.85, 1.30),
      dur: rnd(2.2, 3.4),
      skew: rnd(0.75, 1.0),
    })
  }, [status])

  if (!orb) return null

  const c = COLORS[orb.type]
  const { cx, cy, scale, dur, skew } = orb
  const pos = `${cx}% ${cy}%`

  // Layer sizes
  const sf = scale
  const wFlash = 28 * sf,  hFlash = 28 * sf * skew
  const wCore  = 52 * sf,  hCore  = 52 * sf * skew
  const wMid   = 80 * sf,  hMid   = 80 * sf * skew
  const wOut   = 115 * sf, hOut   = 115 * sf * skew
  const wBloom = 150 * sf, hBloom = 150 * sf * skew

  return (
    <AnimatePresence>
      <div
        key={orb.id}
        className="absolute inset-0 pointer-events-none overflow-hidden"
        style={{ zIndex: -1 }}
      >
        {/* 1 — Instant bright flash (very short) */}
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.95, 0] }}
          transition={{ duration: dur * 0.22, times: [0, 0.18, 1], ease: 'easeOut' }}
          style={{
            background: `radial-gradient(ellipse ${wFlash}% ${hFlash}% at ${pos}, ${c.flash} 0%, transparent 70%)`,
          }}
        />

        {/* 2 — Core glow: expands slightly then fades */}
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0, scale: 0.88 }}
          animate={{ opacity: [0, 1, 0.7, 0], scale: [0.88, 1.06, 1.0, 0.94] }}
          transition={{ duration: dur, times: [0, 0.12, 0.45, 1], ease: 'easeOut' }}
          onAnimationComplete={() => setOrb(null)}
          style={{
            background: `radial-gradient(ellipse ${wCore}% ${hCore}% at ${pos}, ${c.core} 0%, ${c.mid} 50%, transparent 75%)`,
            transformOrigin: `${cx}% ${cy}%`,
          }}
        />

        {/* 3 — Mid ring: expands outward */}
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: [0, 0.8, 0], scale: [0.7, 1.15, 1.05] }}
          transition={{ duration: dur * 0.85, times: [0, 0.16, 1], ease: [0.16, 0.9, 0.3, 1] }}
          style={{
            background: `radial-gradient(ellipse ${wMid}% ${hMid}% at ${pos}, transparent 42%, ${c.mid} 55%, transparent 72%)`,
            transformOrigin: `${cx}% ${cy}%`,
          }}
        />

        {/* 4 — Outer diffuse bloom */}
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.75, 0] }}
          transition={{ duration: dur * 1.1, times: [0, 0.2, 1], ease: 'easeOut' }}
          style={{
            background: `radial-gradient(ellipse ${wOut}% ${hOut}% at ${pos}, ${c.outer} 0%, transparent 65%)`,
          }}
        />

        {/* 5 — Wide atmospheric haze */}
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.55, 0] }}
          transition={{ duration: dur * 1.35, times: [0, 0.25, 1], ease: 'easeOut' }}
          style={{
            background: `radial-gradient(ellipse ${wBloom}% ${hBloom}% at ${pos}, ${c.bloom} 0%, transparent 60%)`,
          }}
        />
      </div>
    </AnimatePresence>
  )
}
