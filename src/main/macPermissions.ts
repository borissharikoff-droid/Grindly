import { systemPreferences, dialog, shell } from 'electron'
import log from './logger'

/**
 * Request Accessibility permission on macOS.
 * Called at app launch. Safe to call on non-macOS — returns immediately.
 */
export async function requestMacAccessibilityPermission(): Promise<void> {
  if (process.platform !== 'darwin') return

  const isTrusted = systemPreferences.isTrustedAccessibilityClient(false)
  if (!isTrusted) {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Accessibility Access Required',
      message: "Grindly needs Accessibility access to track which app you're using.",
      detail: "Click \"Open Settings\" to grant access in System Settings → Privacy & Security → Accessibility, then relaunch Grindly.",
      buttons: ['Open Settings', 'Skip'],
      defaultId: 0,
    })
    if (response === 0) {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
    }
  }
}

/**
 * Prompt for Screen Recording permission on macOS.
 * Deferred to first session start so the prompt appears in context.
 * Safe to call on non-macOS — returns immediately.
 */
export async function checkScreenRecordingPermission(): Promise<void> {
  if (process.platform !== 'darwin') return
  const screenStatus = systemPreferences.getMediaAccessStatus('screen')
  if (screenStatus !== 'granted') {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Screen Recording Access Needed',
      message: 'Grindly reads window titles to categorize your work into skills.',
      detail:
        'Go to System Settings → Privacy & Security → Screen Recording and add Grindly manually. Then relaunch Grindly.\n\nYou can skip this — Grindly will still track apps and award XP, just without specific window titles.',
      buttons: ['Open Settings', 'Skip'],
      defaultId: 0,
    })
    if (response === 0) {
      shell.openExternal(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
      )
    }
    log.info('[macPermissions] Screen Recording status:', screenStatus)
  }
}
