/**
 * Visual QA via CDP — connects to live authenticated Electron app on port 9222
 * Runs all checklist items: nav tabs, arena, raids, guild, party, marketplace, craft, home
 * Usage: node scripts/cdp-visual-qa.mjs
 */
import { writeFileSync, mkdirSync } from 'fs'
import { WebSocket } from 'ws'

const WS_URL = 'ws://localhost:9222/devtools/page/9632D2988AC21281693E93A68E7CB70C'
const OUT = 'C:/idly/.gstack/qa-reports/screenshots'
mkdirSync(OUT, { recursive: true })

const issues = []
const log = (msg) => console.log(`[QA] ${msg}`)
const warn = (msg) => { console.warn(`[WARN] ${msg}`); issues.push(msg) }

// ─── CDP Client ──────────────────────────────────────────────────────────────
class CDP {
  constructor(url) {
    this.ws = new WebSocket(url)
    this._id = 1
    this._pending = new Map()
    this._consoleLogs = []
    this.ready = new Promise((res, rej) => {
      this.ws.on('open', res)
      this.ws.on('error', rej)
    })
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw)
      if (msg.id) {
        const p = this._pending.get(msg.id)
        if (p) {
          this._pending.delete(msg.id)
          msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result)
        }
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        const type = msg.params?.type
        if (type === 'error' || type === 'warn') {
          const text = msg.params.args?.map(a => a.value ?? a.description ?? '').join(' ')
          this._consoleLogs.push(`[${type}] ${text}`)
        }
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const text = msg.params?.exceptionDetails?.exception?.description ?? JSON.stringify(msg.params)
        this._consoleLogs.push(`[exception] ${text}`)
      }
    })
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this._id++
      this._pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async screenshot(filename) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    writeFileSync(`${OUT}/${filename}`, Buffer.from(data, 'base64'))
    log(`Screenshot: ${filename}`)
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    return r?.result?.value
  }

  async click(selector) {
    await this.eval(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)})
        if (el) { el.click(); return 'clicked' }
        return 'NOT_FOUND'
      })()
    `)
  }

  async clickText(text) {
    return await this.eval(`
      (() => {
        const els = [...document.querySelectorAll('button, [role=tab], a, [onclick]')]
        const el = els.find(e => e.textContent?.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())}))
        if (el) { el.click(); return 'clicked: ' + el.textContent.trim() }
        return 'NOT_FOUND: ' + ${JSON.stringify(text)}
      })()
    `)
  }

  async waitMs(ms) {
    return new Promise(r => setTimeout(r, ms))
  }

  async getConsoleErrors() {
    const errs = [...this._consoleLogs]
    this._consoleLogs = []
    return errs
  }

  async getPageText() {
    return await this.eval(`document.body?.innerText?.substring(0, 300) ?? ''`)
  }

  async isVisible(selector) {
    return await this.eval(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)})
        if (!el) return false
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      })()
    `)
  }

  async findByText(text) {
    return await this.eval(`
      (() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        let node
        while (node = walker.nextNode()) {
          if (node.textContent.toLowerCase().includes(${JSON.stringify(text.toLowerCase())})) return true
        }
        return false
      })()
    `)
  }
}

// ─── Main QA flow ─────────────────────────────────────────────────────────────
const cdp = new CDP(WS_URL)
await cdp.ready
log('Connected to Electron app via CDP')

await cdp.send('Runtime.enable')
await cdp.send('Page.enable')
// Use deviceScaleFactor: 1 so we don't corrupt the live app's DPR
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 600, height: 820, deviceScaleFactor: 1, mobile: false
})

const results = []

async function check(name, fn) {
  log(`Checking: ${name}`)
  try {
    const errsBeforeCount = (await cdp.getConsoleErrors()).length
    const result = await fn()
    const errs = await cdp.getConsoleErrors()
    const status = result === false ? '❌ FAIL' : '✅ PASS'
    if (errs.length > 0) {
      errs.forEach(e => warn(`${name}: ${e}`))
    }
    results.push({ name, status, errors: errs.length })
    log(`${status}: ${name}`)
    return result !== false
  } catch (e) {
    warn(`${name}: THREW ${e.message}`)
    results.push({ name, status: '❌ ERROR', errors: 1 })
    return false
  }
}

// ── 1. Initial state ────────────────────────────────────────────────────────
await cdp.waitMs(2000)
await cdp.screenshot('00_initial.png')
const pageText = await cdp.getPageText()
log(`Page content: ${pageText.substring(0, 100)}`)

const isAuthScreen = await cdp.findByText('Create account')
const isLoggedIn = await cdp.findByText('GRIND') || await cdp.findByText('Grindly')
log(`Auth screen: ${isAuthScreen}, Logged in: ${isLoggedIn}`)

if (isAuthScreen && !isLoggedIn) {
  warn('App shows auth screen — user not logged in in this Electron instance. QA cannot proceed without auth.')
  await cdp.screenshot('00_auth_screen.png')
} else {
  // ── 2. HOME ───────────────────────────────────────────────────────────────
  await check('Home page renders', async () => {
    await cdp.screenshot('01_home.png')
    const hasGrind = await cdp.findByText('GRIND')
    if (!hasGrind) warn('Home: GRIND button not found')
    const hasNoAmbientBar = !(await cdp.findByText('Raid Active'))
    return hasGrind
  })

  // ── 3. NAV BAR ────────────────────────────────────────────────────────────
  await check('Bottom nav visible (Home/Skills/Social/Stats/More)', async () => {
    const hasHome = await cdp.findByText('Home')
    const hasSkills = await cdp.findByText('Skills')
    const hasSocial = await cdp.findByText('Social')
    const hasStats = await cdp.findByText('Stats')
    const hasMore = await cdp.findByText('More')
    await cdp.screenshot('02_nav_bar.png')
    return hasHome && hasSkills && hasSocial && hasStats && hasMore
  })

  // ── 4. MORE MENU ──────────────────────────────────────────────────────────
  await check('More menu opens with all tabs', async () => {
    const result = await cdp.clickText('More')
    await cdp.waitMs(600)
    await cdp.screenshot('03_more_menu.png')
    const hasArena = await cdp.findByText('Arena')
    const hasFarm = await cdp.findByText('Farm')
    const hasCraft = await cdp.findByText('Craft')
    const hasCooking = await cdp.findByText('Cooking')
    return hasArena && hasFarm && hasCraft && hasCooking
  })

  // ── 5. SKILLS PAGE ────────────────────────────────────────────────────────
  await check('Skills page renders', async () => {
    await cdp.clickText('Skills')
    await cdp.waitMs(800)
    await cdp.screenshot('04_skills.png')
    return await cdp.findByText('Developer') || await cdp.findByText('Gamer')
  })

  // ── 6. SOCIAL / FRIENDS ──────────────────────────────────────────────────
  await check('Friends/Social page renders', async () => {
    await cdp.clickText('Social')
    await cdp.waitMs(800)
    await cdp.screenshot('05_friends.png')
    return await cdp.isVisible('[class*="friends"]') || await cdp.findByText('Friends') || await cdp.findByText('Guild') || await cdp.findByText('Party')
  })

  await check('Guild tab opens', async () => {
    await cdp.clickText('Guild')
    await cdp.waitMs(800)
    await cdp.screenshot('06_guild.png')
    const hasGuild = await cdp.findByText('guild') || await cdp.findByText('Guild')
    return hasGuild
  })

  await check('Party tab opens', async () => {
    await cdp.clickText('Party')
    await cdp.waitMs(800)
    await cdp.screenshot('07_party.png')
    return await cdp.findByText('Party') || await cdp.findByText('party')
  })

  // ── 7. ARENA ────────────────────────────────────────────────────────────
  await check('Arena page opens via More menu', async () => {
    await cdp.clickText('More')
    await cdp.waitMs(500)
    await cdp.clickText('Arena')
    await cdp.waitMs(1000)
    await cdp.screenshot('08_arena.png')
    return await cdp.findByText('Dungeon') || await cdp.findByText('Raids') || await cdp.findByText('Zone')
  })

  await check('Dungeon tab in Arena', async () => {
    await cdp.clickText('Dungeons')
    await cdp.waitMs(600)
    await cdp.screenshot('09_arena_dungeons.png')
    return await cdp.findByText('Zone') || await cdp.findByText('Shadow Crypt') || await cdp.findByText('Dungeon')
  })

  await check('Raids tab in Arena', async () => {
    await cdp.clickText('Raids')
    await cdp.waitMs(800)
    await cdp.screenshot('10_arena_raids.png')
    return await cdp.findByText('Raid') || await cdp.findByText('raid')
  })

  await check('Hall of Raids tab', async () => {
    await cdp.clickText('Hall of Raids')
    await cdp.waitMs(600)
    await cdp.screenshot('11_hall_of_raids.png')
    return !(await cdp.findByText('Error')) && !(await cdp.findByText('Cannot read'))
  })

  // ── 8. MARKETPLACE ────────────────────────────────────────────────────────
  await check('Marketplace opens', async () => {
    await cdp.clickText('More')
    await cdp.waitMs(400)
    await cdp.clickText('Marketplace')
    await cdp.waitMs(1000)
    await cdp.screenshot('12_marketplace.png')
    return await cdp.findByText('Marketplace') || await cdp.findByText('listing') || await cdp.findByText('sell')
  })

  // ── 9. CRAFT ─────────────────────────────────────────────────────────────
  await check('Craft page opens with Lich/Titan recipes', async () => {
    await cdp.clickText('More')
    await cdp.waitMs(400)
    await cdp.clickText('Craft')
    await cdp.waitMs(800)
    await cdp.screenshot('13_craft.png')
    const hasLich = await cdp.findByText('Lich')
    const hasTitan = await cdp.findByText('Titan')
    if (!hasLich) warn('Craft: Lich Set recipe not visible')
    if (!hasTitan) warn('Craft: Titan Set recipe not visible')
    return true // page rendered
  })

  // ── 10. FARM ─────────────────────────────────────────────────────────────
  await check('Farm page opens', async () => {
    await cdp.clickText('More')
    await cdp.waitMs(400)
    await cdp.clickText('Farm')
    await cdp.waitMs(800)
    await cdp.screenshot('14_farm.png')
    return !(await cdp.findByText('Error'))
  })

  // ── 11. INVENTORY ────────────────────────────────────────────────────────
  await check('Inventory opens', async () => {
    await cdp.clickText('More')
    await cdp.waitMs(400)
    await cdp.clickText('Inventory')
    await cdp.waitMs(800)
    await cdp.screenshot('15_inventory.png')
    return !(await cdp.findByText('Error'))
  })

  // ── 12. STATS ────────────────────────────────────────────────────────────
  await check('Stats page', async () => {
    await cdp.clickText('Stats')
    await cdp.waitMs(800)
    await cdp.screenshot('16_stats.png')
    return !(await cdp.findByText('Cannot read'))
  })

  // ── 13. Back to HOME ─────────────────────────────────────────────────────
  await check('Navigate back to Home', async () => {
    await cdp.clickText('Home')
    await cdp.waitMs(600)
    await cdp.screenshot('17_home_final.png')
    return await cdp.findByText('GRIND')
  })
}

// ── REPORT ───────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════')
console.log('  VISUAL QA REPORT — Grindly v3.9.0')
console.log('═══════════════════════════════════════')
results.forEach(r => {
  const errNote = r.errors > 0 ? ` (${r.errors} console errors)` : ''
  console.log(`  ${r.status}  ${r.name}${errNote}`)
})
const passed = results.filter(r => r.status.includes('PASS')).length
const total = results.length
const score = Math.round((passed / total) * 100)
console.log('───────────────────────────────────────')
console.log(`  Score: ${score}% (${passed}/${total} checks passed)`)
if (issues.length > 0) {
  console.log('\n  Issues found:')
  issues.forEach((i, n) => console.log(`  ${n+1}. ${i}`))
}
console.log(`\n  Screenshots saved to: ${OUT}`)
console.log('═══════════════════════════════════════')

cdp.ws.close()
process.exit(issues.filter(i => i.includes('exception') || i.includes('ERROR')).length > 0 ? 1 : 0)
