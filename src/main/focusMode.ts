import { execFile } from 'child_process'
import { promisify } from 'util'
import log from './logger'

const execFileAsync = promisify(execFile)
const FOCUS_REG_PATH = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings'
const PUSH_REG_PATH = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications'
const SOUND_KEY = 'NOC_GLOBAL_SETTING_ALLOW_NOTIFICATION_SOUND'
const TOASTS_KEY = 'NOC_GLOBAL_SETTING_TOASTS_ENABLED'
const PUSH_TOASTS_KEY = 'ToastEnabled'

interface FocusRegistryState {
  sound: number | null
  toasts: number | null
  pushToasts: number | null
}

let originalRegistryState: FocusRegistryState | null = null
let focusEndsAt: number | null = null
let restoreTimer: NodeJS.Timeout | null = null
let focusActive = false
let osApplied = false

async function runPowerShell(script: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 },
  )
  return String(stdout || '').trim()
}

async function readRegistryValue(path: string, name: string): Promise<number | null> {
  try {
    const script = `
      $path = "${path}"
      if (!(Test-Path $path)) { Write-Output "null"; return }
      try {
        $v = (Get-ItemProperty -Path $path -Name "${name}" -ErrorAction Stop)."${name}"
        if ($null -eq $v) { Write-Output "null" } else { Write-Output $v }
      } catch {
        Write-Output "null"
      }
    `
    const out = await runPowerShell(script)
    const parsed = Number(out)
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function writeRegistryValue(path: string, name: string, value: number | null): Promise<void> {
  const script = value === null
    ? `
      $path = "${path}"
      if (Test-Path $path) {
        Remove-ItemProperty -Path $path -Name "${name}" -ErrorAction SilentlyContinue
      }
    `
    : `
      $path = "${path}"
      if (!(Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
      Set-ItemProperty -Path $path -Name "${name}" -Type DWord -Value ${Math.max(0, value)}
    `
  await runPowerShell(script)
}

async function readAppliedState(): Promise<boolean> {
  const [sound, toasts, pushToasts] = await Promise.all([
    readRegistryValue(FOCUS_REG_PATH, SOUND_KEY),
    readRegistryValue(FOCUS_REG_PATH, TOASTS_KEY),
    readRegistryValue(PUSH_REG_PATH, PUSH_TOASTS_KEY),
  ])
  return sound === 0 && toasts === 0 && pushToasts === 0
}

export async function enableFocusMode(durationMs: number): Promise<void> {
  if (process.platform !== 'win32') {
    focusActive = true
    osApplied = false
    focusEndsAt = Date.now() + Math.max(0, durationMs)
    return
  }
  if (durationMs <= 0) return
  try {
    if (!originalRegistryState) {
      originalRegistryState = {
        sound: await readRegistryValue(FOCUS_REG_PATH, SOUND_KEY),
        toasts: await readRegistryValue(FOCUS_REG_PATH, TOASTS_KEY),
        pushToasts: await readRegistryValue(PUSH_REG_PATH, PUSH_TOASTS_KEY),
      }
    }
    await writeRegistryValue(FOCUS_REG_PATH, SOUND_KEY, 0)
    await writeRegistryValue(FOCUS_REG_PATH, TOASTS_KEY, 0)
    await writeRegistryValue(PUSH_REG_PATH, PUSH_TOASTS_KEY, 0)
    focusActive = true
    osApplied = await readAppliedState()
    focusEndsAt = Date.now() + durationMs
    if (restoreTimer) clearTimeout(restoreTimer)
    restoreTimer = setTimeout(() => {
      disableFocusMode().catch(() => {})
    }, durationMs)
    log.info(`[focus] Focus mode enabled for ${Math.round(durationMs / 60000)} min`)
  } catch (error) {
    osApplied = false
    log.warn('[focus] Failed to enable focus mode:', error)
  }
}

export async function disableFocusMode(): Promise<void> {
  if (restoreTimer) {
    clearTimeout(restoreTimer)
    restoreTimer = null
  }
  focusActive = false
  osApplied = false
  focusEndsAt = null
  if (process.platform !== 'win32') return
  if (!originalRegistryState) return
  try {
    await writeRegistryValue(FOCUS_REG_PATH, SOUND_KEY, originalRegistryState.sound)
    await writeRegistryValue(FOCUS_REG_PATH, TOASTS_KEY, originalRegistryState.toasts)
    await writeRegistryValue(PUSH_REG_PATH, PUSH_TOASTS_KEY, originalRegistryState.pushToasts)
    log.info('[focus] Focus mode disabled and notification settings restored')
  } catch (error) {
    log.warn('[focus] Failed to restore focus mode settings:', error)
  } finally {
    originalRegistryState = null
  }
}

export function getFocusModeStatus(): { active: boolean; endsAt: number | null; osApplied: boolean } {
  if (focusActive && focusEndsAt && Date.now() >= focusEndsAt) {
    disableFocusMode().catch(() => {})
    return { active: false, endsAt: null, osApplied: false }
  }
  return { active: focusActive, endsAt: focusEndsAt, osApplied }
}
