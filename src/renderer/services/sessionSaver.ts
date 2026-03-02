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
  const existing = JSON.parse(localStorage.getItem('grindly_sessions') || '[]')
  existing.unshift({
    id: sessionId,
    start_time: sessionStartTime,
    end_time: endTime,
    duration_seconds: elapsedSeconds,
    summary: null,
  })
  localStorage.setItem('grindly_sessions', JSON.stringify(existing.slice(0, 100)))
  const browserActivities = JSON.parse(localStorage.getItem('grindly_activities') || '{}')
  browserActivities[sessionId] = [{
    app_name: 'Browser Session',
    window_title: 'Grindly Web Mode',
    category: 'browsing',
    start_time: sessionStartTime,
    end_time: endTime,
  }]
  localStorage.setItem('grindly_activities', JSON.stringify(browserActivities))
}
