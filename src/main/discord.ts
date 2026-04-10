/**
 * Discord Rich Presence integration.
 *
 * Setup (one-time):
 *   1. Go to https://discord.com/developers/applications → New Application → name it "Grindly"
 *   2. In Rich Presence → Art Assets, upload your logo as asset key "grindly_logo"
 *   3. Copy the Application ID and paste it into GRINDLY_DISCORD_CLIENT_ID below
 *
 * This module connects to the local Discord client over IPC and updates presence
 * whenever the user starts or stops a session. Fails silently when Discord is closed.
 */

import log from './logger'

const GRINDLY_DISCORD_CLIENT_ID = '1485616107736797284'

// ── Types (avoid importing discord-rpc at module level so the app starts even if pkg is missing) ──

interface Activity {
  details?: string
  state?: string
  startTimestamp?: number
  largeImageKey?: string
  largeImageText?: string
  smallImageKey?: string
  smallImageText?: string
  instance?: boolean
  buttons?: { label: string; url: string }[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RPCClient = any

// ── State ──────────────────────────────────────────────────────────────────────

let client: RPCClient = null
let connected = false
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let pendingActivity: Activity | null = null

// ── Internal helpers ───────────────────────────────────────────────────────────

function clearReconnect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
}

function scheduleReconnect(delayMs = 20_000) {
  clearReconnect()
  reconnectTimer = setTimeout(connect, delayMs)
}

function connect() {
  if (connected) return
  clearReconnect()

  let Client: new (opts: { transport: string }) => RPCClient
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Client = require('discord-rpc').Client
  } catch {
    // Package not available — silently skip
    return
  }

  const c = new Client({ transport: 'ipc' })
  client = c

  c.on('ready', () => {
    connected = true
    log.info('[Discord RPC] connected')
    if (pendingActivity) {
      try { c.setActivity(pendingActivity) } catch { /* ignore */ }
    }
  })

  // discord-rpc fires 'disconnected' on socket close
  c.on('disconnected', () => {
    connected = false
    client = null
    log.info('[Discord RPC] disconnected — will retry in 20s')
    scheduleReconnect()
  })

  c.login({ clientId: GRINDLY_DISCORD_CLIENT_ID }).catch(() => {
    // Discord not open or RPC not available — retry later
    scheduleReconnect(30_000)
  })
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function initDiscordRPC(): void {
  connect()
}

// Maps skill ID → Discord asset key (must match what's uploaded in Discord Dev Portal)
const SKILL_IMAGE_KEY: Record<string, string> = {
  developer:    'skill_developer',
  designer:     'skill_designer',
  gamer:        'skill_gamer',
  communicator: 'skill_communicator',
  researcher:   'skill_researcher',
  creator:      'skill_creator',
  learner:      'skill_learner',
  listener:     'skill_listener',
  farmer:       'skill_farmer',
  warrior:      'skill_warrior',
  crafter:      'skill_crafter',
  chef:         'skill_chef',
}

export interface PresenceUpdate {
  status: 'running' | 'idle' | 'afk'
  /** Skill currently being leveled, e.g. "Developer" */
  currentSkillName?: string
  /** Skill icon emoji, e.g. "💻" */
  currentSkillIcon?: string
  /** Skill ID for Discord asset lookup, e.g. "developer" */
  currentSkillId?: string
  /** Current level of the active skill */
  currentSkillLevel?: number
  /** Active app name, e.g. "Visual Studio Code" */
  currentAppName?: string
  /** days */
  streak?: number
  /** ms epoch for elapsed timer */
  startTimestamp?: number
}

export function updateDiscordPresence(data: PresenceUpdate): void {
  if (data.status === 'idle') {
    pendingActivity = null
    if (connected && client) {
      try { client.clearActivity() } catch { /* ignore */ }
    }
    return
  }

  const activity: Activity = {
    largeImageKey: 'icon',
    largeImageText: 'Grindly — Turn your grind into XP',
    instance: false,
  }

  if (data.status === 'afk') {
    activity.details = '💤 Away from keyboard'
    activity.state = 'Session paused'
  } else {
    // Line 1: current skill being leveled
    if (data.currentSkillIcon && data.currentSkillName) {
      activity.details = `${data.currentSkillIcon} Leveling ${data.currentSkillName}`
    } else {
      activity.details = '⚡ Grinding...'
    }

    // Line 2: app + level + streak
    const parts: string[] = []
    if (data.currentAppName) {
      const appName = data.currentAppName.length > 22
        ? data.currentAppName.slice(0, 21) + '…'
        : data.currentAppName
      parts.push(appName)
    }
    if (data.currentSkillLevel !== undefined) {
      parts.push(`Lv.${data.currentSkillLevel}`)
    }
    if (data.streak && data.streak > 0) {
      parts.push(`🔥 ${data.streak}d streak`)
    }
    if (parts.length > 0) {
      activity.state = parts.join('  ·  ')
    }

    if (data.startTimestamp) {
      activity.startTimestamp = data.startTimestamp
    }

    // Small skill icon in the corner of the large image
    const skillImageKey = data.currentSkillId ? SKILL_IMAGE_KEY[data.currentSkillId] : undefined
    if (skillImageKey) {
      activity.smallImageKey = skillImageKey
      activity.smallImageText = data.currentSkillLevel !== undefined
        ? `${data.currentSkillName} · Lv.${data.currentSkillLevel}`
        : data.currentSkillName
    }
  }

  activity.buttons = [
    { label: 'Download Grindly', url: 'https://grindly-wiki.up.railway.app/index.html' },
  ]

  pendingActivity = activity

  if (connected && client) {
    try { client.setActivity(activity) } catch { /* ignore */ }
  }
}

export function destroyDiscordRPC(): void {
  clearReconnect()
  connected = false
  if (client) {
    try { client.destroy() } catch { /* ignore */ }
    client = null
  }
}
