/**
 * QA Pass 2 — targeted screenshots of missed pages + verify More menu closes on nav
 */
import { writeFileSync, mkdirSync } from 'fs'
import { WebSocket } from 'ws'

const WS_URL = 'ws://localhost:9222/devtools/page/9632D2988AC21281693E93A68E7CB70C'
const OUT = 'C:/idly/.gstack/qa-reports/screenshots'
mkdirSync(OUT, { recursive: true })

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url)
    this._id = 1
    this._pending = new Map()
    this.ready = new Promise((res, rej) => { this.ws.on('open', res); this.ws.on('error', rej) })
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw)
      if (msg.id) { const p = this._pending.get(msg.id); if (p) { this._pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result) } }
    })
  }
  send(m, p = {}) { return new Promise((res, rej) => { const id = this._id++; this._pending.set(id, { resolve: res, reject: rej }); this.ws.send(JSON.stringify({ id, method: m, params: p })) }) }
  async ss(name) { const { data } = await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true }); writeFileSync(`${OUT}/${name}`, Buffer.from(data, 'base64')); console.log(`📸 ${name}`) }
  async eval(expr) { const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r?.result?.value }
  async click(text) {
    return this.eval(`(() => {
      const els = [...document.querySelectorAll('button,[role=tab],a,[onclick],li')]
      const el = els.find(e => e.textContent?.trim() === ${JSON.stringify(text)} || e.textContent?.trim().toLowerCase() === ${JSON.stringify(text.toLowerCase())})
      if (el) { el.click(); return 'ok:' + el.textContent.trim() }
      // fuzzy
      const el2 = els.find(e => e.textContent?.toLowerCase().includes(${JSON.stringify(text.toLowerCase())}))
      if (el2) { el2.click(); return 'fuzzy:' + el2.textContent.trim() }
      return 'NOT_FOUND:' + ${JSON.stringify(text)}
    })()`)
  }
  async wait(ms) { return new Promise(r => setTimeout(r, ms)) }
  async isMoreMenuOpen() {
    return this.eval(`!!document.querySelector('[data-more-menu],[class*="more-menu"],[class*="moreMenu"],[class*="MoreMenu"]') || [...document.querySelectorAll('div')].some(d => d.textContent?.includes('drag any icon') && d.offsetParent !== null)`)
  }
  async closeMoreMenu() {
    // click outside / press Escape
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', keyCode: 27 })
    await this.wait(300)
  }
  async navigateTo(tabName) {
    await this.closeMoreMenu()
    await this.wait(200)
    const r = await this.click(tabName)
    console.log(`  nav: ${tabName} → ${r}`)
    await this.wait(1000)
  }
}

const cdp = new CDP(WS_URL)
await cdp.ready
await cdp.send('Runtime.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 600, height: 820, deviceScaleFactor: 1, mobile: false })
console.log('Connected')

// ── Go Home first ─────────────────────────────────────────────────────────────
await cdp.navigateTo('Home')
await cdp.ss('p2_00_home_clean.png')

// ── Skills ─────────────────────────────────────────────────────────────────────
const skillsResult = await cdp.eval(`(() => {
  const el = [...document.querySelectorAll('button,[role=tab]')].find(e => e.textContent?.trim() === 'Skills')
  if (el) { el.click(); return 'clicked' }
  // Also try icon click via More menu
  return 'not found'
})()`)
console.log('Skills click:', skillsResult)
await cdp.wait(800)
await cdp.ss('p2_04_skills.png')

// ── Stats ──────────────────────────────────────────────────────────────────────
await cdp.navigateTo('Stats')
await cdp.ss('p2_16_stats.png')

// ── Marketplace (via More menu) ─────────────────────────────────────────────────
await cdp.navigateTo('Home')
await cdp.wait(300)
const moreClick = await cdp.click('More')
console.log('More click:', moreClick)
await cdp.wait(700)
await cdp.ss('p2_more_open.png')
const marketClick = await cdp.click('Market')
console.log('Market click:', marketClick)
await cdp.wait(1500)
await cdp.ss('p2_12_marketplace.png')
const isMoreStillOpen = await cdp.isMoreMenuOpen()
console.log('More menu still open after nav?', isMoreStillOpen, '← should be false')

// ── Craft ──────────────────────────────────────────────────────────────────────
await cdp.navigateTo('Home')
await cdp.wait(300)
await cdp.click('More')
await cdp.wait(700)
const craftClick = await cdp.click('Craft')
console.log('Craft click:', craftClick)
await cdp.wait(1000)
await cdp.ss('p2_13_craft.png')

// ── Cook ───────────────────────────────────────────────────────────────────────
await cdp.navigateTo('Home')
await cdp.wait(300)
await cdp.click('More')
await cdp.wait(700)
await cdp.click('Cook')
await cdp.wait(1000)
await cdp.ss('p2_cooking.png')

// ── Arena → Hall of Raids ──────────────────────────────────────────────────────
await cdp.navigateTo('Arena')
await cdp.wait(500)
await cdp.click('Raids')
await cdp.wait(800)
await cdp.ss('p2_10_raids.png')

// Try to click "Hall" tab
const hallClick = await cdp.eval(`(() => {
  const tabs = [...document.querySelectorAll('[role=tab], button')]
  const hall = tabs.find(t => t.textContent?.trim() === 'Hall' || t.textContent?.includes('Hall'))
  if (hall) { hall.click(); return 'clicked: ' + hall.textContent.trim() }
  return 'NOT_FOUND'
})()`)
console.log('Hall click:', hallClick)
await cdp.wait(800)
await cdp.ss('p2_11_hall_of_raids.png')

// ── Back to Home ───────────────────────────────────────────────────────────────
await cdp.navigateTo('Home')
await cdp.ss('p2_17_home_final.png')

console.log('\n✅ Pass 2 complete. Check screenshots in', OUT)
cdp.ws.close()
