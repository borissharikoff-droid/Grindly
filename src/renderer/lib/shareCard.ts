import { getSkillById } from './skills'
import { CATEGORY_COLORS, CATEGORY_EMOJI } from './uiConstants'

export interface TodayCardInput {
  totalSeconds: number
  sessionCount: number
  topSkill: { skill_id: string; xp: number } | null
  totalXP: number
  username?: string | null
  dateISO?: string
  avatar?: string | null
  level?: number | null
  streak?: number | null
  skills?: { skill_id: string; xp: number }[]
  keystrokes?: number
  focusedSeconds?: number
  distractedSeconds?: number
  longestSessionSeconds?: number
  topApp?: { app_name: string; seconds: number } | null
  topApps?: { app_name: string; category: string | null; seconds: number }[]
  /** Pill label on the card — defaults to "TODAY". */
  periodLabel?: string
  /** Short caption under the hero time — defaults to "tracked today". */
  heroCaption?: string
}

const SIZE = 1080
const CARD = '#12161f'
const BORDER = 'rgba(255,255,255,0.08)'
const TEXT = '#ffffff'
const MUTED = '#8a94a6'
const DIM = '#5d6578'
const FALLBACK_ACCENT = '#00ff88'
const FONT = 'system-ui, -apple-system, Segoe UI, sans-serif'

function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0m'
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatXP(xp: number, withSign = true): string {
  const sign = withSign ? '+' : ''
  if (xp >= 1000) return `${sign}${(xp / 1000).toFixed(1)}k`
  return `${sign}${Math.round(xp).toLocaleString()}`
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n.toLocaleString()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  ctx.lineTo(x + rr, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
  ctx.lineTo(x, y + rr)
  ctx.quadraticCurveTo(x, y, x + rr, y)
  ctx.closePath()
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const bigint = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r},${g},${b},${alpha})`
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

function isImageUrl(s: string): boolean {
  return /^(https?:\/\/|data:|blob:|file:|\/)/i.test(s)
}

/** Draws the Today share card on a 1080x1080 canvas. Returns a Blob (PNG). */
export async function renderTodayShareCard(input: TodayCardInput): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!

  // Accent color = top skill color (or fallback green)
  const topSkillDef = input.topSkill ? getSkillById(input.topSkill.skill_id) : null
  const accent = topSkillDef?.color || FALLBACK_ACCENT

  // ── Background gradient ──
  const grad = ctx.createLinearGradient(0, 0, 0, SIZE)
  grad.addColorStop(0, '#0e131c')
  grad.addColorStop(1, '#07090d')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, SIZE, SIZE)

  // Tinted halo in accent color (top-right)
  const halo = ctx.createRadialGradient(SIZE * 0.85, SIZE * 0.12, 20, SIZE * 0.85, SIZE * 0.12, SIZE * 0.85)
  halo.addColorStop(0, hexToRgba(accent, 0.22))
  halo.addColorStop(0.5, hexToRgba(accent, 0.06))
  halo.addColorStop(1, hexToRgba(accent, 0))
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, SIZE, SIZE)

  // Secondary halo bottom-left (subtle)
  const halo2 = ctx.createRadialGradient(SIZE * 0.1, SIZE * 0.95, 20, SIZE * 0.1, SIZE * 0.95, SIZE * 0.6)
  halo2.addColorStop(0, hexToRgba(accent, 0.08))
  halo2.addColorStop(1, hexToRgba(accent, 0))
  ctx.fillStyle = halo2
  ctx.fillRect(0, 0, SIZE, SIZE)

  const PAD = 72
  const cardX = PAD
  const cardY = PAD
  const cardW = SIZE - PAD * 2
  const cardH = SIZE - PAD * 2

  // Card body
  ctx.fillStyle = CARD
  roundRect(ctx, cardX, cardY, cardW, cardH, 36)
  ctx.fill()
  ctx.strokeStyle = BORDER
  ctx.lineWidth = 2
  ctx.stroke()

  // Accent top-bar (thin)
  ctx.fillStyle = accent
  roundRect(ctx, cardX, cardY, cardW, 6, 36)
  ctx.fill()

  const innerX = cardX + 48
  const innerR = cardX + cardW - 48
  let y = cardY + 56

  // ── Header: GRINDLY + date ──
  ctx.fillStyle = accent
  ctx.font = `bold 34px ${FONT}`
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillText('GRINDLY', innerX, y)

  ctx.fillStyle = MUTED
  ctx.font = `22px ${FONT}`
  ctx.textAlign = 'right'
  const dateStr = (input.dateISO ? new Date(input.dateISO) : new Date()).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
  ctx.fillText(dateStr.toUpperCase(), innerR, y + 8)
  ctx.textAlign = 'left'

  y += 70

  // ── Identity strip ──
  const avatarSize = 72
  const avatarX = innerX
  const avatarY = y
  // Avatar circle
  ctx.save()
  ctx.beginPath()
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
  ctx.closePath()
  ctx.fillStyle = hexToRgba(accent, 0.12)
  ctx.fill()
  ctx.clip()
  if (input.avatar && isImageUrl(input.avatar)) {
    const img = await loadImage(input.avatar)
    if (img) {
      ctx.drawImage(img, avatarX, avatarY, avatarSize, avatarSize)
    }
  } else if (input.avatar) {
    ctx.fillStyle = TEXT
    ctx.font = `44px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(input.avatar, avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 2)
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
  }
  ctx.restore()
  // Avatar ring
  ctx.beginPath()
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 1, 0, Math.PI * 2)
  ctx.strokeStyle = hexToRgba(accent, 0.7)
  ctx.lineWidth = 3
  ctx.stroke()

  // Username + meta
  const nameX = avatarX + avatarSize + 18
  ctx.fillStyle = TEXT
  ctx.font = `bold 32px ${FONT}`
  ctx.fillText(input.username ? `@${input.username}` : '@you', nameX, avatarY + 8)

  // Meta line: Lv X · 🔥 streak
  ctx.font = `20px ${FONT}`
  ctx.fillStyle = MUTED
  const metaParts: string[] = []
  if (input.level != null && input.level > 0) metaParts.push(`Lv ${input.level}`)
  if (input.streak != null && input.streak > 0) metaParts.push(`🔥 ${input.streak}d streak`)
  if (metaParts.length === 0) metaParts.push('GRINDING')
  ctx.fillText(metaParts.join('  ·  '), nameX, avatarY + 48)

  // Period pill on right
  const pillText = (input.periodLabel || 'TODAY').toUpperCase()
  ctx.font = `bold 20px ${FONT}`
  const pillW = ctx.measureText(pillText).width + 28
  const pillH = 34
  const pillX = innerR - pillW
  const pillY = avatarY + (avatarSize - pillH) / 2
  ctx.fillStyle = hexToRgba(accent, 0.15)
  roundRect(ctx, pillX, pillY, pillW, pillH, 17)
  ctx.fill()
  ctx.strokeStyle = hexToRgba(accent, 0.4)
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = accent
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(pillText, pillX + pillW / 2, pillY + pillH / 2 + 1)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  y += avatarSize + 28

  // ── Hero time ── (scale down when digits get long, e.g. "107h 27m")
  const heroText = formatDuration(input.totalSeconds)
  const heroSize = heroText.length >= 8 ? 148 : 172
  ctx.fillStyle = TEXT
  ctx.font = `bold ${heroSize}px ${FONT}`
  ctx.fillText(heroText, innerX, y)

  // Focus % pill on the right, vertically centred to hero
  const focusedS = input.focusedSeconds ?? 0
  const distractedS = input.distractedSeconds ?? 0
  const trackedSum = focusedS + distractedS
  const focusPct = trackedSum > 0 ? Math.round((focusedS / trackedSum) * 100) : null
  if (focusPct != null) {
    ctx.font = `bold 54px ${FONT}`
    const focusText = `${focusPct}%`
    ctx.textAlign = 'right'
    ctx.fillStyle = accent
    ctx.fillText(focusText, innerR, y + 16)
    ctx.fillStyle = MUTED
    ctx.font = `20px ${FONT}`
    ctx.fillText('FOCUS', innerR, y + 80)
    ctx.textAlign = 'left'
  }

  y += heroSize - 20

  // Hero caption subtitle
  ctx.fillStyle = MUTED
  ctx.font = `26px ${FONT}`
  ctx.fillText(input.heroCaption || 'tracked today', innerX, y)

  y += 44

  // ── Focus / Distraction bar ──
  if (trackedSum > 0) {
    const barW = innerR - innerX
    const barH = 14
    // Background
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    roundRect(ctx, innerX, y, barW, barH, 7)
    ctx.fill()
    // Focused segment
    const focusedW = (focusedS / trackedSum) * barW
    const barGrad = ctx.createLinearGradient(innerX, y, innerX + focusedW, y)
    barGrad.addColorStop(0, accent)
    barGrad.addColorStop(1, hexToRgba(accent, 0.6))
    ctx.fillStyle = barGrad
    roundRect(ctx, innerX, y, focusedW, barH, 7)
    ctx.fill()

    y += barH + 10

    // Bar labels
    ctx.font = `18px ${FONT}`
    ctx.fillStyle = TEXT
    ctx.fillText(`${formatDuration(focusedS)} focused`, innerX, y)
    ctx.textAlign = 'right'
    ctx.fillStyle = DIM
    ctx.fillText(`${formatDuration(distractedS)} distracted`, innerR, y)
    ctx.textAlign = 'left'
    y += 32
  } else {
    y += 16
  }

  // ── Micro stats row (3 columns) ──
  const microY = y
  const microCols = 3
  const microW = (innerR - innerX) / microCols
  const microItems: { label: string; value: string; icon: string }[] = []

  microItems.push({
    label: 'Sessions',
    value: String(input.sessionCount),
    icon: '⚡',
  })

  const longest = input.longestSessionSeconds ?? 0
  if (longest > 0) {
    microItems.push({
      label: 'Longest',
      value: formatDuration(longest),
      icon: '⏱',
    })
  }

  if (input.keystrokes != null && input.keystrokes > 0) {
    microItems.push({
      label: 'Keystrokes',
      value: formatNum(input.keystrokes),
      icon: '⌨',
    })
  }

  // Trim to 3
  const microShow = microItems.slice(0, microCols)
  microShow.forEach((item, i) => {
    const x = innerX + i * microW
    // Icon + value
    ctx.fillStyle = TEXT
    ctx.font = `bold 36px ${FONT}`
    ctx.fillText(`${item.icon} ${item.value}`, x, microY)
    // Label
    ctx.fillStyle = DIM
    ctx.font = `17px ${FONT}`
    ctx.fillText(item.label.toUpperCase(), x, microY + 46)
  })

  y = microY + 90

  // ── Top 3 skills pills ──
  const skills = (input.skills && input.skills.length > 0)
    ? input.skills.slice(0, 3)
    : (input.topSkill ? [input.topSkill] : [])

  if (skills.length > 0) {
    ctx.fillStyle = DIM
    ctx.font = `17px ${FONT}`
    ctx.fillText('TOP SKILLS', innerX, y)
    y += 24

    const pillGap = 12
    const totalGaps = (skills.length - 1) * pillGap
    const pillW2 = (innerR - innerX - totalGaps) / skills.length
    const pillH2 = 72

    skills.forEach((s, i) => {
      const def = getSkillById(s.skill_id)
      const color = def?.color || accent
      const px = innerX + i * (pillW2 + pillGap)
      // Pill background
      ctx.fillStyle = hexToRgba(color, 0.12)
      roundRect(ctx, px, y, pillW2, pillH2, 14)
      ctx.fill()
      ctx.strokeStyle = hexToRgba(color, 0.45)
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Icon
      ctx.fillStyle = TEXT
      ctx.font = `26px ${FONT}`
      ctx.textBaseline = 'middle'
      ctx.fillText(def?.icon || '✨', px + 16, y + pillH2 / 2 + 2)

      // Name
      ctx.font = `600 17px ${FONT}`
      ctx.fillStyle = TEXT
      const name = (def?.name || s.skill_id).toUpperCase()
      ctx.fillText(name, px + 58, y + 20)

      // XP
      ctx.font = `bold 22px ${FONT}`
      ctx.fillStyle = color
      ctx.fillText(formatXP(s.xp), px + 58, y + 46)

      ctx.textBaseline = 'top'
    })

    y += pillH2 + 18
  }

  // ── Top apps section (category-colored chips) — adapts to available space ──
  const footerReserve = 62
  const appsAvail = (cardY + cardH - footerReserve) - y
  const apps = (input.topApps || []).filter((a) => a.seconds >= 60).slice(0, 3)
  const headerH = 24
  const rowH = 42
  const rowGap = 8
  // How many rows fit below the header?
  const maxRows = apps.length > 0
    ? Math.min(apps.length, Math.max(0, Math.floor((appsAvail - headerH + rowGap) / (rowH + rowGap))))
    : 0
  if (maxRows > 0) {
    ctx.fillStyle = DIM
    ctx.font = `17px ${FONT}`
    ctx.fillText('TOP APPS', innerX, y)
    y += headerH

    const rowW = innerR - innerX
    apps.slice(0, maxRows).forEach((a) => {
      const cat = (a.category || 'other').toLowerCase()
      const color = CATEGORY_COLORS[cat] || CATEGORY_COLORS.other
      const emoji = CATEGORY_EMOJI[cat] || CATEGORY_EMOJI.other
      // Row background
      ctx.fillStyle = hexToRgba(color, 0.08)
      roundRect(ctx, innerX, y, rowW, rowH, 12)
      ctx.fill()
      ctx.strokeStyle = hexToRgba(color, 0.35)
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Left: emoji + app name
      ctx.textBaseline = 'middle'
      ctx.fillStyle = TEXT
      ctx.font = `20px ${FONT}`
      const appName = a.app_name.replace(/\.exe$/i, '')
      const maxChars = 26
      const displayName = appName.length > maxChars ? appName.slice(0, maxChars - 1) + '…' : appName
      ctx.fillText(`${emoji}  ${displayName}`, innerX + 14, y + rowH / 2 + 1)

      // Right: duration
      ctx.textAlign = 'right'
      ctx.fillStyle = color
      ctx.font = `bold 20px ${FONT}`
      ctx.fillText(formatDuration(a.seconds), innerR - 14, y + rowH / 2 + 1)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'

      y += rowH + rowGap
    })
  } else if (input.topApp && input.topApp.seconds >= 60 && appsAvail >= 30) {
    ctx.fillStyle = DIM
    ctx.font = `17px ${FONT}`
    ctx.fillText(
      `📱 Most time in ${input.topApp.app_name.slice(0, 28)} — ${formatDuration(input.topApp.seconds)}`,
      innerX,
      y,
    )
    y += 28
  }

  // ── Footer ──
  const footY = cardY + cardH - 48
  ctx.fillStyle = DIM
  ctx.font = `20px ${FONT}`
  ctx.textAlign = 'left'
  ctx.fillText('grindly.app — track your time, level up your skills', innerX, footY)

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Canvas toBlob returned null'))
    }, 'image/png')
  })
}

function periodPrefix(label?: string): string {
  const l = (label || 'today').toLowerCase()
  if (l === 'today' || l === 'yesterday') return l.charAt(0).toUpperCase() + l.slice(1)
  return `Last ${l}`.replace(/^Last all time$/i, 'All-time')
}

export function buildTodayShareText(input: TodayCardInput): string {
  const parts: string[] = []
  const prefix = periodPrefix(input.periodLabel)
  parts.push(`${prefix} on @grindly_app:`)
  parts.push(`⏱ ${formatDuration(input.totalSeconds)} tracked · ${input.sessionCount} session${input.sessionCount === 1 ? '' : 's'}`)
  const skillDef = input.topSkill ? getSkillById(input.topSkill.skill_id) : null
  if (skillDef && input.topSkill) {
    parts.push(`${skillDef.icon || '✨'} ${formatXP(input.topSkill.xp)} ${skillDef.name}`)
  }
  if (input.focusedSeconds != null && input.distractedSeconds != null) {
    const total = input.focusedSeconds + input.distractedSeconds
    if (total > 0) {
      const pct = Math.round((input.focusedSeconds / total) * 100)
      parts.push(`🎯 ${pct}% focused`)
    }
  }
  return parts.join('\n')
}

export function buildTodayShareChatBody(input: TodayCardInput): string {
  const skillDef = input.topSkill ? getSkillById(input.topSkill.skill_id) : null
  const skillLine = skillDef && input.topSkill ? ` · ${skillDef.icon || ''} ${formatXP(input.topSkill.xp)} ${skillDef.name}` : ''
  const prefix = periodPrefix(input.periodLabel)
  return `📊 ${prefix}: ${formatDuration(input.totalSeconds)} tracked · ${input.sessionCount} session${input.sessionCount === 1 ? '' : 's'}${skillLine}`
}
