import { useEffect, useRef, useState, useCallback } from 'react'
import { playClickSound } from '../../lib/sounds'
import { getStreakMultiplier } from '../../lib/xp'

interface StreakOverlayProps {
  streak: number
  onClose: () => void
}

// ── Per-day config (1–30) ─────────────────────────────────────────────────────

type AnimStyle = 'bounce' | 'shake' | 'ring' | 'burst' | 'comet' | 'spiral' | 'flip' | 'shockwave' | 'zap' | 'confetti'
type ParticleStyle = 'slow-embers' | 'fast-embers' | 'sparks' | 'stars' | 'electric' | 'confetti'

interface DayConfig {
  icon: string
  anim: AnimStyle
  particles: ParticleStyle
  flash?: boolean
  screenShake?: boolean
}

const DAY_CONFIG: Record<number, DayConfig> = {
  1:  { icon: '🔥', anim: 'bounce',    particles: 'slow-embers' },
  2:  { icon: '🔥', anim: 'bounce',    particles: 'fast-embers' },
  3:  { icon: '🔥', anim: 'ring',      particles: 'fast-embers' },
  4:  { icon: '✨', anim: 'burst',     particles: 'sparks' },
  5:  { icon: '☄️', anim: 'comet',     particles: 'sparks' },
  6:  { icon: '🔥', anim: 'shake',     particles: 'sparks',   screenShake: true },
  7:  { icon: '⭐', anim: 'burst',     particles: 'stars' },
  8:  { icon: '🌟', anim: 'spiral',    particles: 'stars' },
  9:  { icon: '💫', anim: 'flip',      particles: 'stars' },
  10: { icon: '✨', anim: 'burst',     particles: 'sparks',   flash: true },
  11: { icon: '🌠', anim: 'comet',     particles: 'stars' },
  12: { icon: '🎇', anim: 'shockwave', particles: 'sparks' },
  13: { icon: '🎆', anim: 'shockwave', particles: 'stars',    flash: true },
  14: { icon: '⚡', anim: 'zap',       particles: 'electric' },
  15: { icon: '⚡', anim: 'ring',      particles: 'electric' },
  16: { icon: '💎', anim: 'spiral',    particles: 'stars' },
  17: { icon: '⚡', anim: 'zap',       particles: 'electric', flash: true },
  18: { icon: '🌀', anim: 'shockwave', particles: 'electric' },
  19: { icon: '⚡', anim: 'shake',     particles: 'electric', screenShake: true },
  20: { icon: '🏆', anim: 'bounce',    particles: 'sparks',   flash: true },
  21: { icon: '⚡', anim: 'burst',     particles: 'electric' },
  22: { icon: '💠', anim: 'flip',      particles: 'electric' },
  23: { icon: '⚡', anim: 'comet',     particles: 'electric' },
  24: { icon: '🌊', anim: 'shockwave', particles: 'electric', flash: true },
  25: { icon: '⚡', anim: 'zap',       particles: 'electric', flash: true },
  26: { icon: '💫', anim: 'spiral',    particles: 'electric' },
  27: { icon: '⚡', anim: 'burst',     particles: 'electric', screenShake: true },
  28: { icon: '🌌', anim: 'shockwave', particles: 'electric', flash: true },
  29: { icon: '⚡', anim: 'zap',       particles: 'electric', flash: true, screenShake: true },
  30: { icon: '👑', anim: 'confetti',  particles: 'confetti', flash: true },
}

function getDayConfig(streak: number): DayConfig {
  const clamped = Math.max(1, Math.min(30, streak))
  return DAY_CONFIG[clamped] ?? DAY_CONFIG[1]
}

// ── Tier theming (color / glow / bg) ─────────────────────────────────────────

interface StreakTier {
  label: string
  subtitle: string
  color: string
  glowColor: string
  bgGradient: string
}

function getStreakTier(streak: number): StreakTier {
  if (streak >= 30) return {
    label: 'MAX STREAK',
    subtitle: 'You reached the absolute top.',
    color: '#facc15',
    glowColor: 'rgba(250,204,21,0.45)',
    bgGradient: 'radial-gradient(ellipse at 50% 45%, rgba(120,80,0,0.55) 0%, #000 65%)',
  }
  if (streak >= 14) return {
    label: 'ELECTRIFYING',
    subtitle: 'Two weeks of pure grind.',
    color: '#38bdf8',
    glowColor: 'rgba(56,189,248,0.38)',
    bgGradient: 'radial-gradient(ellipse at 50% 45%, rgba(10,40,80,0.65) 0%, #000 65%)',
  }
  if (streak >= 7) return {
    label: 'BLAZING',
    subtitle: 'One full week. Keep going.',
    color: '#c084fc',
    glowColor: 'rgba(192,132,252,0.33)',
    bgGradient: 'radial-gradient(ellipse at 50% 45%, rgba(50,20,70,0.6) 0%, #000 65%)',
  }
  if (streak >= 3) return {
    label: 'WARMING UP',
    subtitle: 'Building momentum!',
    color: '#ff8c00',
    glowColor: 'rgba(255,140,0,0.32)',
    bgGradient: 'radial-gradient(ellipse at 50% 45%, rgba(60,20,0,0.58) 0%, #000 65%)',
  }
  return {
    label: 'STREAK STARTED',
    subtitle: 'Keep showing up.',
    color: '#ff8c00',
    glowColor: 'rgba(255,140,0,0.25)',
    bgGradient: 'radial-gradient(ellipse at 50% 45%, rgba(40,15,0,0.5) 0%, #000 65%)',
  }
}

// ── Milestone / benefits data ─────────────────────────────────────────────────

interface Milestone { day: number; label: string; bonuses: string[] }

const MILESTONES: Milestone[] = [
  { day: 3,  label: 'WARMING UP',    bonuses: ['+10% XP'] },
  { day: 5,  label: 'HEATING UP',    bonuses: ['+15% XP'] },
  { day: 7,  label: 'BLAZING',       bonuses: ['+20% XP', '🛡 Shield — miss 1 day free'] },
  { day: 14, label: 'ELECTRIFYING',  bonuses: ['+40% XP', '🛡 Shield', '📦 Epic chest rates'] },
  { day: 30, label: 'LEGENDARY',     bonuses: ['+75% XP', '🛡 Shield', '📦 Epic chest rates', '⭐ Legendary tier'] },
]

function getActiveBonuses(streak: number): string[] {
  const multi = getStreakMultiplier(streak)
  const pct = Math.round((multi - 1) * 100)
  const bonuses = pct > 0 ? [`+${pct}% XP boost`] : []
  if (streak >= 7)  bonuses.push('🛡 Shield')
  if (streak >= 14) bonuses.push('📦 Epic chest rates')
  if (streak >= 30) bonuses.push('⭐ Legendary tier')
  return bonuses
}

function getNextMilestone(streak: number): Milestone | null {
  return MILESTONES.find(m => m.day > streak) ?? null
}

function getPrevMilestoneDay(streak: number): number {
  return [...MILESTONES].reverse().find(m => m.day <= streak)?.day ?? 1
}

// ── Particles ─────────────────────────────────────────────────────────────────

interface Particle { id: number; x: number; dur: number; size: number; color: string; drift: number; shape: 'circle' | 'rect' }

const PARTICLE_COLORS: Record<ParticleStyle, string[]> = {
  'slow-embers': ['#ff8c00', 'rgba(255,140,0,0.6)', '#fff6', '#fff3'],
  'fast-embers': ['#ff8c00', '#ffa500', '#ffcc44', '#fff8'],
  'sparks':      ['#fff', '#ffdd44', '#ff8c00', '#ffaa00'],
  'stars':       ['#c084fc', '#e9d5ff', '#fff', '#a855f7'],
  'electric':    ['#38bdf8', '#7dd3fc', '#fff', '#0ea5e9'],
  'confetti':    ['#facc15', '#f472b6', '#34d399', '#60a5fa', '#fb923c', '#a78bfa'],
}

function FloatingParticles({ style, color, glowColor }: { style: ParticleStyle; color: string; glowColor: string }) {
  const [particles, setParticles] = useState<Particle[]>([])
  const idRef = useRef(0)

  const isConfetti = style === 'confetti'
  const isSlow = style === 'slow-embers'
  const isElectric = style === 'electric'
  const colors = PARTICLE_COLORS[style] ?? [color, glowColor]

  useEffect(() => {
    const intervalMs = isSlow ? 130 : isConfetti ? 60 : 90
    const spawn = () => {
      const id = ++idRef.current
      const dur = isSlow ? 2 + Math.random() * 1.5 : isConfetti ? 2.5 + Math.random() * 2 : 1.2 + Math.random() * 1.5
      const size = isConfetti ? 5 + Math.random() * 7 : isSlow ? 1.5 + Math.random() * 2.5 : 1 + Math.random() * 3
      const p: Particle = {
        id,
        x: isConfetti ? Math.random() * 100 : 5 + Math.random() * 90,
        dur,
        size,
        color: colors[Math.floor(Math.random() * colors.length)],
        drift: isElectric ? -30 + Math.random() * 60 : -20 + Math.random() * 40,
        shape: isConfetti && Math.random() > 0.5 ? 'rect' : 'circle',
      }
      setParticles(prev => [...prev.slice(-30), p])
      setTimeout(() => setParticles(prev => prev.filter(s => s.id !== id)), dur * 1000 + 100)
    }
    const iv = setInterval(spawn, intervalMs)
    return () => clearInterval(iv)
  }, [style]) // eslint-disable-line react-hooks/exhaustive-deps

  const animName = isConfetti ? 'sk-confetti-fall' : 'sk-particle-rise'

  return (
    <>
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute pointer-events-none"
          style={{
            left: `${p.x}%`,
            [isConfetti ? 'top' : 'bottom']: 0,
            width: p.shape === 'rect' ? p.size * 0.6 : p.size,
            height: p.size,
            borderRadius: p.shape === 'rect' ? 1 : '50%',
            background: p.color,
            boxShadow: `0 0 ${p.size + 2}px ${p.color}`,
            animation: `${animName} ${p.dur}s ease-out forwards`,
            '--drift': `${p.drift}px`,
          } as React.CSSProperties}
        />
      ))}
    </>
  )
}

// ── Icon animation overlays ───────────────────────────────────────────────────

function RingEffect({ color }: { color: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div
        className="absolute rounded-full border-2"
        style={{
          width: 80, height: 80,
          borderColor: color,
          animation: 'sk-ring-expand 1s 0.3s ease-out forwards',
          opacity: 0,
        }}
      />
      <div
        className="absolute rounded-full border"
        style={{
          width: 80, height: 80,
          borderColor: color,
          animation: 'sk-ring-expand 1s 0.55s ease-out forwards',
          opacity: 0,
        }}
      />
    </div>
  )
}

function ShockwaveEffect({ color }: { color: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {[0, 0.2, 0.4].map(delay => (
        <div
          key={delay}
          className="absolute rounded-full border"
          style={{
            width: 80, height: 80,
            borderColor: color,
            animation: `sk-ring-expand 1.2s ${delay}s ease-out forwards`,
            opacity: 0,
          }}
        />
      ))}
    </div>
  )
}

function BurstEffect({ color }: { color: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            width: 2,
            height: 30,
            background: `linear-gradient(to top, ${color}, transparent)`,
            transformOrigin: 'center bottom',
            left: '50%',
            top: '50%',
            marginLeft: -1,
            marginTop: -30,
            transform: `rotate(${i * 45}deg) translateY(-34px)`,
            animation: `sk-burst-ray 0.5s 0.25s ease-out both`,
          }}
        />
      ))}
    </div>
  )
}

function FlashOverlay() {
  return (
    <div
      className="absolute inset-0 pointer-events-none z-20"
      style={{ animation: 'sk-screen-flash 0.4s 0.1s ease-out both' }}
    />
  )
}

// ── Benefits section ──────────────────────────────────────────────────────────

function BenefitsSection({ streak, color }: { streak: number; color: string }) {
  const activeBonuses = getActiveBonuses(streak)
  const nextMs = getNextMilestone(streak)
  const prevDay = getPrevMilestoneDay(streak)
  const progressPct = nextMs
    ? Math.round(((streak - prevDay) / (nextMs.day - prevDay)) * 100)
    : 100
  const daysLeft = nextMs ? nextMs.day - streak : 0
  const isMax = streak >= 30

  return (
    <div
      className="w-full max-w-[280px] mx-auto mt-4 rounded-xl overflow-hidden"
      style={{
        background: `${color}08`,
        border: `1px solid ${color}20`,
        animation: 'sk-fade-up 0.5s 2.6s both',
      }}
    >
      {/* Active bonuses */}
      <div className="px-4 pt-3 pb-2">
        <p className="text-micro font-semibold uppercase tracking-widest mb-2" style={{ color: `${color}99` }}>
          Active bonuses
        </p>
        <div className="flex flex-wrap gap-1.5">
          {activeBonuses.map((b, i) => (
            <span
              key={i}
              className="px-2.5 py-1 rounded-lg text-caption font-medium"
              style={{ background: `${color}14`, border: `1px solid ${color}28`, color: `${color}ee` }}
            >
              {b}
            </span>
          ))}
          {activeBonuses.length === 0 && (
            <span className="text-micro text-gray-600">No bonuses yet — keep grinding</span>
          )}
        </div>
      </div>

      {/* Next milestone or max */}
      <div className="px-4 pb-3 pt-1" style={{ borderTop: `1px solid ${color}12` }}>
        {isMax ? (
          <p className="text-caption font-bold text-center py-1" style={{ color: `${color}cc` }}>
            ⭐ All bonuses active — max streak reached
          </p>
        ) : nextMs ? (
          <>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-micro font-semibold" style={{ color: `${color}aa` }}>
                Next: {nextMs.label}
              </p>
              <p className="text-micro font-mono" style={{ color: `${color}77` }}>
                {daysLeft} day{daysLeft !== 1 ? 's' : ''} away
              </p>
            </div>
            {/* Progress bar — animates from 0 to progressPct */}
            <div className="h-1.5 rounded-full mb-2 overflow-hidden" style={{ background: `${color}18` }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${progressPct}%`,
                  background: `linear-gradient(90deg, ${color}88, ${color})`,
                  boxShadow: `0 0 6px ${color}66`,
                  animation: 'sk-bar-fill 0.7s 3s ease-out both',
                  transformOrigin: 'left center',
                }}
              />
            </div>
            <p className="text-micro" style={{ color: `${color}66` }}>
              Unlocks: {nextMs.bonuses.join(' · ')}
            </p>
          </>
        ) : null}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function StreakOverlay({ streak, onClose }: StreakOverlayProps) {
  const [closing, setClosing] = useState(false)
  const [displayStreak, setDisplayStreak] = useState(Math.max(0, streak - Math.min(streak, 8)))

  const clampedStreak = Math.max(1, Math.min(30, streak))
  const day = getDayConfig(clampedStreak)
  const tier = getStreakTier(streak)
  const isMax = streak >= 30

  // Count-up animation
  useEffect(() => {
    if (displayStreak >= clampedStreak) return
    const step = Math.ceil((clampedStreak - displayStreak) / 6)
    const timer = setTimeout(() => {
      setDisplayStreak(prev => Math.min(prev + step, clampedStreak))
    }, 60)
    return () => clearTimeout(timer)
  }, [displayStreak, clampedStreak])

  const handleClose = useCallback(() => {
    if (closing) return
    playClickSound()
    setClosing(true)
    setTimeout(onClose, 350)
  }, [closing, onClose])

  const iconAnimClass = `sk-icon-${day.anim}`
  const containerClass = day.screenShake ? 'sk-screen-shake' : ''

  return (
    <div
      className={`fixed inset-0 z-[110] flex flex-col items-center justify-center cursor-pointer ${containerClass}`}
      style={{
        backgroundColor: '#000',
        backgroundImage: tier.bgGradient,
        opacity: closing ? 0 : 1,
        transition: 'opacity 0.35s ease-out',
      }}
      onClick={handleClose}
    >
      {/* Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <FloatingParticles style={day.particles} color={tier.color} glowColor={tier.glowColor} />
      </div>

      {/* Screen flash */}
      {day.flash && <FlashOverlay />}

      {/* Ambient glow */}
      <div
        className="absolute pointer-events-none rounded-full blur-3xl"
        style={{
          width: 280, height: 280,
          left: '50%', top: '50%',
          transform: 'translate(-50%, -55%)',
          background: tier.glowColor,
          animation: 'sk-ambient-pulse 2.5s ease-in-out infinite alternate',
        }}
      />

      <div className="text-center relative z-10 px-4 w-full max-w-sm flex flex-col items-center">

        {/* Icon with animation + effects */}
        <div className="relative flex items-center justify-center" style={{ width: 88, height: 88 }}>
          {(day.anim === 'ring') && <RingEffect color={tier.color} />}
          {(day.anim === 'shockwave') && <ShockwaveEffect color={tier.color} />}
          {(day.anim === 'burst') && <BurstEffect color={tier.color} />}
          <div
            className={`text-6xl leading-none relative ${iconAnimClass}`}
            style={{ filter: `drop-shadow(0 0 18px ${tier.glowColor})` }}
          >
            {day.icon}
          </div>
        </div>

        {/* Streak number */}
        <p
          className="font-mono font-black tabular-nums leading-none mt-3 sk-num-enter"
          style={{
            fontSize: 72,
            color: tier.color,
            textShadow: `0 0 40px ${tier.glowColor}, 0 2px 0 rgba(0,0,0,0.5)`,
          }}
        >
          {displayStreak}
        </p>

        {/* "day streak" */}
        <p
          className="text-sm font-bold uppercase tracking-[0.3em] mt-1 sk-fade-up-1"
          style={{ color: `${tier.color}99` }}
        >
          day streak
        </p>

        {/* Tier badge */}
        <div
          className="inline-block mt-3 px-4 py-1 rounded-full text-micro font-bold uppercase tracking-[0.18em] sk-fade-up-2"
          style={{
            border: `1px solid ${tier.color}40`,
            background: `${tier.color}14`,
            color: tier.color,
          }}
        >
          {isMax ? '★ LEGENDARY ★' : tier.label}
        </div>

        {/* Subtitle */}
        <p
          className="text-body mt-2 sk-fade-up-3"
          style={{ color: 'rgba(255,255,255,0.38)' }}
        >
          {tier.subtitle}
        </p>

        {/* Benefits */}
        <BenefitsSection streak={streak} color={tier.color} />

        {/* Continue */}
        <button
          onClick={(e) => { e.stopPropagation(); handleClose() }}
          className="mt-5 px-12 py-2.5 rounded-lg text-sm font-semibold transition-all active:scale-95 hover:brightness-125 sk-fade-up-4"
          style={{
            background: `linear-gradient(135deg, ${tier.color}22 0%, ${tier.color}0d 100%)`,
            border: `1px solid ${tier.color}38`,
            color: tier.color,
            boxShadow: `0 0 20px ${tier.color}14`,
          }}
        >
          Continue
        </button>
      </div>

      <style>{`
        /* ── Icon entrance animations ── */
        .sk-icon-bounce {
          animation: sk-bounce 0.8s 0.2s cubic-bezier(0.16,1,0.3,1) both;
        }
        .sk-icon-shake {
          animation: sk-shake 0.6s 0.3s ease-out both;
        }
        .sk-icon-ring {
          animation: sk-bounce 0.7s 0.2s cubic-bezier(0.16,1,0.3,1) both;
        }
        .sk-icon-burst {
          animation: sk-burst-enter 0.7s 0.2s cubic-bezier(0.16,1,0.3,1) both;
        }
        .sk-icon-comet {
          animation: sk-comet 0.7s 0.1s cubic-bezier(0.16,1,0.3,1) both;
        }
        .sk-icon-spiral {
          animation: sk-spiral 0.8s 0.2s cubic-bezier(0.16,1,0.3,1) both;
        }
        .sk-icon-flip {
          animation: sk-flip 0.7s 0.2s cubic-bezier(0.16,1,0.3,1) both;
        }
        .sk-icon-shockwave {
          animation: sk-bounce 0.7s 0.3s cubic-bezier(0.16,1,0.3,1) both;
        }
        .sk-icon-zap {
          animation: sk-zap 0.6s 0.1s ease-out both;
        }
        .sk-icon-confetti {
          animation: sk-bounce 1s 0.3s cubic-bezier(0.16,1,0.3,1) both;
        }

        /* ── Staggered text fades ── */
        .sk-num-enter  { animation: sk-num-pop 0.7s 0.7s cubic-bezier(0.16,1,0.3,1) both; }
        .sk-fade-up-1  { animation: sk-fade-up 0.5s 1.5s both; }
        .sk-fade-up-2  { animation: sk-fade-up 0.5s 1.8s both; }
        .sk-fade-up-3  { animation: sk-fade-up 0.5s 2.0s both; }
        .sk-fade-up-4  { animation: sk-fade-up 0.5s 2.9s both; }

        /* ── Keyframes ── */
        @keyframes sk-bounce {
          0%   { transform: scale(0) rotate(-15deg); opacity: 0; }
          55%  { transform: scale(1.25) rotate(6deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes sk-shake {
          0%   { transform: scale(0); opacity: 0; }
          30%  { transform: scale(1.2); opacity: 1; }
          42%  { transform: translateX(-8px) scale(1.1); }
          55%  { transform: translateX(8px); }
          68%  { transform: translateX(-5px); }
          80%  { transform: translateX(4px); }
          100% { transform: translateX(0) scale(1); opacity: 1; }
        }
        @keyframes sk-burst-enter {
          0%   { transform: scale(0); opacity: 0; filter: blur(4px); }
          60%  { transform: scale(1.3); opacity: 1; filter: blur(0); }
          100% { transform: scale(1); }
        }
        @keyframes sk-comet {
          0%   { transform: translate(60px, -60px) scale(0.4); opacity: 0; }
          60%  { transform: translate(-4px, 4px) scale(1.1); opacity: 1; }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes sk-spiral {
          0%   { transform: rotate(270deg) scale(0); opacity: 0; }
          70%  { transform: rotate(-10deg) scale(1.15); opacity: 1; }
          100% { transform: rotate(0deg) scale(1); }
        }
        @keyframes sk-flip {
          0%   { transform: perspective(400px) rotateY(90deg) scale(0.5); opacity: 0; }
          60%  { transform: perspective(400px) rotateY(-12deg) scale(1.1); opacity: 1; }
          100% { transform: perspective(400px) rotateY(0deg) scale(1); }
        }
        @keyframes sk-zap {
          0%   { transform: scale(0.5); opacity: 0; filter: brightness(3); }
          15%  { opacity: 1; filter: brightness(2); }
          30%  { opacity: 0.3; transform: scale(1.3); }
          50%  { opacity: 1; filter: brightness(1.5); }
          70%  { opacity: 0.5; }
          100% { transform: scale(1); opacity: 1; filter: brightness(1); }
        }
        @keyframes sk-num-pop {
          0%   { transform: scale(0.3) translateY(16px); opacity: 0; filter: blur(8px); }
          65%  { transform: scale(1.08) translateY(-2px); opacity: 1; }
          100% { transform: scale(1) translateY(0); filter: blur(0); }
        }
        @keyframes sk-fade-up {
          0%   { transform: translateY(10px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes sk-ring-expand {
          0%   { transform: scale(0.8); opacity: 0.8; }
          100% { transform: scale(3.5); opacity: 0; }
        }
        @keyframes sk-burst-ray {
          0%   { transform: rotate(var(--rot, 0deg)) scaleY(0); opacity: 0.9; }
          100% { transform: rotate(var(--rot, 0deg)) scaleY(1) translateY(-8px); opacity: 0; }
        }
        @keyframes sk-screen-flash {
          0%   { background: rgba(255,255,255,0); }
          25%  { background: rgba(255,255,255,0.18); }
          100% { background: rgba(255,255,255,0); }
        }
        @keyframes sk-ambient-pulse {
          0%   { opacity: 0.28; transform: translate(-50%,-55%) scale(0.85); }
          100% { opacity: 0.55; transform: translate(-50%,-55%) scale(1.15); }
        }
        @keyframes sk-particle-rise {
          0%   { transform: translateY(0) translateX(0) scale(1); opacity: 0.85; }
          50%  { opacity: 0.6; }
          100% { transform: translateY(-130px) translateX(var(--drift,0px)) scale(0); opacity: 0; }
        }
        @keyframes sk-confetti-fall {
          0%   { transform: translateY(-10px) translateX(0) rotate(0deg); opacity: 1; }
          80%  { opacity: 0.8; }
          100% { transform: translateY(110vh) translateX(var(--drift,0px)) rotate(720deg); opacity: 0; }
        }
        .sk-screen-shake {
          animation: sk-container-shake 0.4s 0.35s ease-out;
        }
        @keyframes sk-bar-fill {
          0%   { transform: scaleX(0); }
          100% { transform: scaleX(1); }
        }
        @keyframes sk-container-shake {
          0%,100% { transform: translateX(0); }
          20%     { transform: translateX(-6px); }
          40%     { transform: translateX(6px); }
          60%     { transform: translateX(-4px); }
          80%     { transform: translateX(3px); }
        }
      `}</style>
    </div>
  )
}
