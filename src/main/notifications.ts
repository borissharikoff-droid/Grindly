import { BrowserWindow, Notification } from 'electron'
import { getDatabaseApi } from './database'
import log from './logger'

let notifInterval: ReturnType<typeof setInterval> | null = null
let mainWin: BrowserWindow | null = null

// Track state so we don't spam the same notification
let lastGrindReminder = 0
let lastStreakWarning = 0
let lastDistractionAlert = 0
let lastFocusPraise = 0
let lastDailyRecap = 0

const ONE_HOUR = 60 * 60 * 1000
const THIRTY_MIN = 30 * 60 * 1000

function showNotification(title: string, body: string, action?: string) {
  if (Notification.isSupported()) {
    const n = new Notification({ title, body })
    if (action === 'open_stats' && mainWin && !mainWin.isDestroyed()) {
      n.on('click', () => {
        try {
          if (mainWin && !mainWin.isDestroyed()) {
            if (mainWin.isMinimized()) mainWin.restore()
            mainWin.show()
            mainWin.focus()
            mainWin.webContents.send('window:openTabStats')
          }
        } catch (err) { log.error('[notifications] click handler', err) }
      })
    }
    n.show()
  }
  // Also send to renderer
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('notification:smart', { title, body, action })
  }
}

/**
 * Read notification preference from SQLite local_stats table.
 * Falls back to true (enabled) if not set.
 * This is safe — no executeJavaScript needed.
 */
function getNotifPref(db: ReturnType<typeof getDatabaseApi>, key: string): boolean {
  const val = db.getLocalStat(key)
  // If not set, default to enabled (true)
  if (val === null) return true
  return val !== 'false'
}

function checkAndNotify() {
  const db = getDatabaseApi()
  const now = Date.now()
  const hour = new Date().getHours()

  // Check if global notifications are enabled
  const globalEnabled = getNotifPref(db, 'grindly_notifications_enabled')
  if (!globalEnabled) return

  // 1. Grind reminder: no session today and it's after 12:00
  const grindReminderEnabled = getNotifPref(db, 'grindly_notif_grind_reminder')
  if (grindReminderEnabled && hour >= 12 && now - lastGrindReminder > 4 * ONE_HOUR) {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todaySessionCount = db.getSessionCount(todayStart.getTime())
    // Also check if a session is currently running (checkpoint started today)
    const checkpoint = db.getCheckpoint()
    const sessionRunning = checkpoint !== null && checkpoint.start_time >= todayStart.getTime()
    if (todaySessionCount === 0 && !sessionRunning) {
      showNotification('Time to Grind! 💪', 'No sessions today. Start a grind to keep your momentum going!')
      lastGrindReminder = now
    }
  }

  // 2. Streak at risk: past 18:00 and no session today (earlier warning = more recovery time)
  const streakWarningEnabled = getNotifPref(db, 'grindly_notif_streak_warning')
  if (streakWarningEnabled && hour >= 18 && now - lastStreakWarning > 2 * ONE_HOUR) {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todaySessionCount = db.getSessionCount(todayStart.getTime())
    // Also check if a session is currently running (checkpoint started today)
    const checkpoint2 = db.getCheckpoint()
    const sessionRunning2 = checkpoint2 !== null && checkpoint2.start_time >= todayStart.getTime()
    const currentStreak = db.getStreak()
    if (todaySessionCount === 0 && !sessionRunning2 && currentStreak > 0) {
      showNotification('🔥 Streak at Risk!', `Your ${currentStreak}-day streak will break! Start a quick session before midnight.`)
      lastStreakWarning = now
    }
  }

  // 3. Distraction alert: current session has >60% social/games
  const distractionEnabled = getNotifPref(db, 'grindly_notif_distraction')
  if (distractionEnabled && now - lastDistractionAlert > THIRTY_MIN) {
    // Check if there's an active session (recent activities in last 30 min)
    const recentActivities = db.getCategoryStats(now - THIRTY_MIN)
    const totalMs = recentActivities.reduce((s, c) => s + c.total_ms, 0)
    if (totalMs > 5 * 60 * 1000) { // at least 5 minutes of tracked activity
      const socialGamesMs = recentActivities
        .filter(c => c.category === 'social' || c.category === 'games')
        .reduce((s, c) => s + c.total_ms, 0)
      const ratio = socialGamesMs / totalMs
      if (ratio > 0.6) {
        showNotification('Stay Focused! 🎯', 'Over 60% of recent activity is social/games. Time to refocus!')
        lastDistractionAlert = now
      }
    }
  }

  // 4. Focus praise: 30+ min of uninterrupted coding
  const praiseEnabled = getNotifPref(db, 'grindly_notif_praise')
  if (praiseEnabled && now - lastFocusPraise > ONE_HOUR) {
    const recentCats = db.getCategoryStats(now - THIRTY_MIN)
    const codingMs = recentCats.find(c => c.category === 'coding')?.total_ms || 0
    if (codingMs >= 25 * 60 * 1000) { // ~25 min of coding in last 30 min = focused
      showNotification('Deep Focus! 🧠', 'You\'ve been coding for 30+ minutes. Great flow state!')
      lastFocusPraise = now
    }
  }

  // 5. Daily recap: past 23:00, summarise today's grind with one tap to Stats
  const recapEnabled = getNotifPref(db, 'grindly_notif_daily_recap')
  if (recapEnabled && hour >= 23 && now - lastDailyRecap > 12 * ONE_HOUR) {
    const recap = db.getTodayRecap()
    if (recap.sessionCount > 0 && recap.totalSeconds > 0) {
      const hours = Math.floor(recap.totalSeconds / 3600)
      const mins = Math.floor((recap.totalSeconds % 3600) / 60)
      const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
      const topSkillPart = recap.topSkill
        ? ` · top skill: ${recap.topSkill.skill_id} (+${Math.round(recap.topSkill.xp).toLocaleString()} XP)`
        : ''
      showNotification(
        'Today\'s Recap 📊',
        `${recap.sessionCount} session${recap.sessionCount === 1 ? '' : 's'} · ${timeStr}${topSkillPart}. Tap to see details.`,
        'open_stats',
      )
      lastDailyRecap = now
    }
  }

  // 6. Milestone: round numbers
  const stats = db.getUserStats()
  const totalHours = Math.floor(stats.totalSeconds / 3600)
  const milestones = [10, 25, 50, 100, 250, 500, 1000]
  for (const m of milestones) {
    if (totalHours === m) {
      const milestoneKey = `grindly_milestone_${m}h`
      const already = db.getLocalStat(milestoneKey)
      if (!already) {
        showNotification(`${m}h Milestone! 🏆`, `You've grinded for ${m} total hours. Legendary!`)
        db.setLocalStat(milestoneKey, '1')
      }
      break
    }
  }
}

export function startSmartNotifications(win: BrowserWindow) {
  mainWin = win
  // Check every 30 minutes
  notifInterval = setInterval(() => {
    try { checkAndNotify() } catch (err) { log.error('[notifications]', err) }
  }, THIRTY_MIN)
  // Also check once shortly after startup
  setTimeout(() => {
    try { checkAndNotify() } catch (err) { log.error('[notifications]', err) }
  }, 60_000) // 1 min after launch
}

export function stopSmartNotifications() {
  if (notifInterval) {
    clearInterval(notifInterval)
    notifInterval = null
  }
}
