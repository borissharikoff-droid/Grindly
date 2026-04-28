/**
 * SessionSaver — saves session and activity data to SQLite (Electron) or localStorage (Browser).
 */

export interface ActivitySegment {
  appName: string
  windowTitle: string
  category: string
  startTime: number
  endTime: number
  keystrokes: number
}

export interface SaveSessionResult {
  segments: ActivitySegment[]
}

/** Electron mode: stop tracker, save session & activities to SQLite. */
export async function saveSessionElectron(
  api: NonNullable<Window['electronAPI']>,
  sessionId: string,
  sessionStartTime: number,
  endTime: number,
  elapsedSeconds: number,
): Promise<SaveSessionResult> {
  const activities = await api.tracker.stop()
  await api.db.saveSession({
    id: sessionId,
    startTime: sessionStartTime,
    endTime,
    durationSeconds: elapsedSeconds,
    summary: {},
  })
  const segments: ActivitySegment[] = Array.isArray(activities)
    ? activities.map((a: { appName: string; windowTitle: string; category: string; startTime: number; endTime: number; keystrokes?: number }) => ({
        appName: a.appName,
        windowTitle: a.windowTitle,
        category: a.category,
        startTime: a.startTime,
        endTime: a.endTime,
        keystrokes: a.keystrokes ?? 0,
      }))
    : []
  await api.db.saveActivities(sessionId, segments)
  return { segments }
}

/** Browser mode: save session & activities to localStorage. */
export function saveSessionBrowser(
  sessionId: string,
  sessionStartTime: number,
  endTime: number,
  elapsedSeconds: number,
): void {
  try {
    const raw = localStorage.getItem('grindly_sessions')
    const existing = raw ? JSON.parse(raw) : []
    const list = Array.isArray(existing) ? existing : []
    list.unshift({
      id: sessionId,
      start_time: sessionStartTime,
      end_time: endTime,
      duration_seconds: elapsedSeconds,
      summary: null,
    })
    localStorage.setItem('grindly_sessions', JSON.stringify(list.slice(0, 100)))
  } catch {
    // localStorage corrupted — reset to this session only rather than crashing
    localStorage.setItem('grindly_sessions', JSON.stringify([{
      id: sessionId, start_time: sessionStartTime, end_time: endTime, duration_seconds: elapsedSeconds, summary: null,
    }]))
  }
  try {
    const raw = localStorage.getItem('grindly_activities')
    const browserActivities = raw ? JSON.parse(raw) : {}
    const map = (browserActivities && typeof browserActivities === 'object' && !Array.isArray(browserActivities))
      ? browserActivities as Record<string, unknown>
      : {}
    map[sessionId] = [{
      app_name: 'Browser Session',
      window_title: 'Grindly Web Mode',
      category: 'browsing',
      start_time: sessionStartTime,
      end_time: endTime,
    }]
    localStorage.setItem('grindly_activities', JSON.stringify(map))
  } catch {
    // ignore — activity record is non-critical compared to the session itself
  }
}
