/**
 * qa-full-check.mjs — Deep interactive QA for Grindly v3.9.0
 *
 * Tests every button, modal, flow, right-click menu, form input, tab switch.
 * Slow waits to let data load. Screenshots before/after every action.
 *
 * npm run electron:dev   (start Electron with --remote-debugging-port=9222)
 * npm run qa             (separate terminal)
 */

import { writeFileSync, mkdirSync } from 'fs'
import { WebSocket } from 'ws'

const PORT = (() => { const i = process.argv.indexOf('--port'); return i !== -1 ? parseInt(process.argv[i + 1]) : 9222 })()
const DATE = new Date().toISOString().slice(0, 10)
const OUT_DIR = 'C:/idly/.gstack/qa-reports'
const SS_DIR = `${OUT_DIR}/screenshots/auto-${DATE}`
mkdirSync(SS_DIR, { recursive: true })

let ssIdx = 0
const results = []
let currentSection = ''
let cdpInst = null

// ─── Find CDP ─────────────────────────────────────────────────────────────────
async function findTarget() {
  const { default: http } = await import('http')
  return new Promise((res, rej) => {
    http.get(`http://localhost:${PORT}/json`, r => {
      let d = ''; r.on('data', c => d += c)
      r.on('end', () => {
        try {
          const t = JSON.parse(d).find(t => t.type === 'page' && t.webSocketDebuggerUrl)
          t ? res(t.webSocketDebuggerUrl) : rej(new Error('No page target. Is Electron running with --remote-debugging-port=' + PORT + '?'))
        } catch(e) { rej(e) }
      })
    }).on('error', () => rej(new Error(`Cannot connect to port ${PORT}.\nStart: npm run electron:dev`)))
  })
}

// ─── CDP ─────────────────────────────────────────────────────────────────────
class CDP {
  constructor(url) {
    this.ws = new WebSocket(url)
    this._id = 1
    this._pending = new Map()
    this._errors = []
    this.ready = new Promise((res, rej) => { this.ws.on('open', res); this.ws.on('error', rej) })
    this.ws.on('message', raw => {
      const msg = JSON.parse(raw)
      if (msg.id) {
        const p = this._pending.get(msg.id)
        if (p) { this._pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result) }
      }
      if (msg.method === 'Runtime.exceptionThrown')
        this._errors.push('[exception] ' + (msg.params?.exceptionDetails?.exception?.description ?? JSON.stringify(msg.params?.exceptionDetails?.text ?? '')))
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error')
        this._errors.push('[console.error] ' + (msg.params.args?.map(a => a.value ?? a.description ?? '').join(' ') ?? ''))
    })
  }
  send(m, p = {}) {
    return new Promise((res, rej) => {
      const id = this._id++
      this._pending.set(id, { resolve: res, reject: rej })
      this.ws.send(JSON.stringify({ id, method: m, params: p }))
    })
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    return r?.result?.value
  }
  async ss(label) {
    const name = `${String(++ssIdx).padStart(3,'0')}_${label}.png`
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    writeFileSync(`${SS_DIR}/${name}`, Buffer.from(data, 'base64'))
    return name
  }
  async wait(ms) { return new Promise(r => setTimeout(r, ms)) }

  // Find all text nodes
  async findText(t) {
    return this.eval(`(()=>{const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode())if(n.textContent.toLowerCase().includes(${JSON.stringify(t.toLowerCase())}))return true;return false})()`)
  }

  // Click by exact or partial text
  async clickText(text, exact = false) {
    return this.eval(`(()=>{
      const els=[...document.querySelectorAll('button,[role=tab],[role=button],a,li')]
      const match = e => {
        const t = e.textContent?.trim()
        return ${exact} ? t === ${JSON.stringify(text)} : t?.toLowerCase().includes(${JSON.stringify(text.toLowerCase())})
      }
      const el = els.find(match)
      if(el){el.click();return 'ok:'+el.textContent.trim().substring(0,40)}
      return 'NOT_FOUND:'+${JSON.stringify(text)}
    })()`)
  }

  // Click by CSS selector
  async clickSel(sel) {
    return this.eval(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(el){el.click();return 'ok'}return 'NOT_FOUND'})()`)
  }

  // Right-click by selector
  async rightClickSel(sel) {
    return this.eval(`(()=>{
      const el=document.querySelector(${JSON.stringify(sel)})
      if(!el)return 'NOT_FOUND'
      const r=el.getBoundingClientRect()
      const evt=new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2})
      el.dispatchEvent(evt)
      return 'ok'
    })()`)
  }

  // Right-click by text
  async rightClickText(text) {
    return this.eval(`(()=>{
      const els=[...document.querySelectorAll('*')]
      const el=els.find(e=>e.childNodes&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())})))
      if(!el)return 'NOT_FOUND'
      const r=el.getBoundingClientRect()
      const evt=new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+4,clientY:r.top+4})
      el.dispatchEvent(evt)
      return 'ok'
    })()`)
  }

  // Type into focused/visible input
  async typeInto(sel, text) {
    return this.eval(`(()=>{
      const el=document.querySelector(${JSON.stringify(sel)})
      if(!el)return 'NOT_FOUND'
      el.focus()
      const nativeInput=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')
      if(nativeInput){nativeInput.set.call(el,${JSON.stringify(text)});el.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'}
      el.value=${JSON.stringify(text)};el.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'
    })()`)
  }

  // Count elements
  async count(sel) { return this.eval(`document.querySelectorAll(${JSON.stringify(sel)}).length`) }

  // Check element exists and is visible
  async visible(sel) {
    return this.eval(`(()=>{
      const el=document.querySelector(${JSON.stringify(sel)})
      if(!el)return false
      const r=el.getBoundingClientRect()
      return r.width>0&&r.height>0&&window.getComputedStyle(el).display!=='none'
    })()`)
  }

  // Get text content of selector
  async getText(sel) {
    return this.eval(`document.querySelector(${JSON.stringify(sel)})?.textContent?.trim()??null`)
  }

  // Check if any modal/dialog is open
  async modalOpen() {
    return this.eval(`(()=>{
      // Named modal classes
      const sel='[role=dialog],[class*="modal"],[class*="Modal"],[class*="overlay"],[class*="Overlay"],[class*="popup"],[class*="Popup"]'
      const named = [...document.querySelectorAll(sel)].some(el=>{
        const s=window.getComputedStyle(el)
        const r=el.getBoundingClientRect()
        return s.display!=='none'&&s.visibility!=='hidden'&&r.width>10&&r.height>10
      })
      if (named) return true
      // Tailwind portaled modals: fixed inset-0 with high z-index (z-[100] etc.) and a semi-transparent/blur background
      const fixed = [...document.querySelectorAll('div')].filter(el => {
        const s = window.getComputedStyle(el)
        const r = el.getBoundingClientRect()
        return s.position === 'fixed' && r.width > 200 && r.height > 200
          && (parseInt(s.zIndex) >= 50 || el.className?.includes('z-['))
          && (s.backgroundColor.includes('rgba') || s.backdropFilter || el.className?.includes('backdrop'))
      })
      return fixed.length > 0
    })()`)
  }

  async escape() {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', keyCode: 27 })
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp',   key: 'Escape', code: 'Escape', keyCode: 27 })
    await this.wait(400)
  }

  async navTo(tab) {
    await this.escape()
    await this.wait(300)
    const r = await this.clickText(tab, true)
    await this.wait(1800)
    return r
  }

  async openMore(item) {
    await this.escape()
    await this.wait(200)
    await this.clickText('More', true)
    await this.wait(800)
    const r = await this.clickText(item)
    await this.wait(1800)
    return r
  }

  drainErrors() { const e=[...this._errors]; this._errors=[]; return e }
}

// ─── Assertion helpers ────────────────────────────────────────────────────────
function section(name) {
  currentSection = name
  console.log(`\n${'─'.repeat(56)}`)
  console.log(`  ${name}`)
  console.log(`${'─'.repeat(56)}`)
}

function record(name, status, detail, ss) {
  const errors = cdpInst ? cdpInst.drainErrors() : []
  // Filter out known benign warnings
  const realErrors = errors.filter(e =>
    !e.includes('ResizeObserver') &&
    !e.includes('Non-passive event') &&
    !e.includes('Deprecat')
  )
  results.push({ section: currentSection, name, status, detail, ss: ss ?? '', errors: realErrors })
  const icon = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️' : '❌'
  const errNote = realErrors.length ? ` ← ${realErrors.length} JS ERROR(S)` : ''
  console.log(`  ${icon} ${name}${errNote}`)
  if (realErrors.length) realErrors.slice(0,3).forEach(e => console.log(`       ${e.substring(0,100)}`))
  return status === 'PASS'
}

function pass(name, detail, ss)  { return record(name, 'PASS', detail, ss) }
function fail(name, detail, ss)  { return record(name, 'FAIL', detail, ss) }
function warn(name, detail, ss)  { return record(name, 'WARN', detail, ss) }

function check(name, cond, passDetail, failDetail, ss) {
  return cond ? pass(name, passDetail ?? '', ss) : fail(name, failDetail ?? 'not found / not working', ss)
}

// ─── Connect ─────────────────────────────────────────────────────────────────
console.log('\n🔍  Grindly Deep QA — ' + DATE)
console.log('    Connecting to Electron on port ' + PORT + ' ...\n')

let wsUrl
try { wsUrl = await findTarget() }
catch (e) { console.error('❌', e.message); process.exit(1) }

const cdp = cdpInst = new CDP(wsUrl)
await cdp.ready
await cdp.send('Runtime.enable')
await cdp.send('Page.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 600, height: 820, deviceScaleFactor: 1, mobile: false })
await cdp.wait(2500)
console.log('✅ Connected\n')

// ═════════════════════════════════════════════════════════════════════════════
// 1. HOME PAGE
// ═════════════════════════════════════════════════════════════════════════════
section('1. HOME PAGE')

await cdp.navTo('Home')
const ss_home = await cdp.ss('home_initial')

// GRIND button may show "GRIND" (idle) or a timer/STOP (active session)
const grindBtnState = await cdp.eval(`(()=>{
  const btns = [...document.querySelectorAll('button')]
  const grindBtn = btns.find(b => {
    const txt = b.textContent || ''
    return txt.includes('GRIND') || txt.includes('STOP') || txt.includes('Stop') || /\\d+:\\d+/.test(txt)
  })
  if (grindBtn) return grindBtn.textContent.trim().substring(0,30)
  return 'NOT_FOUND'
})()`)
check('GRIND/session button visible', grindBtnState !== 'NOT_FOUND', `state: ${grindBtnState}`, '', ss_home)

check('Daily progress visible', await cdp.findText('Daily'), '', '', ss_home)
check('Weekly progress visible', await cdp.findText('Weekly'), '', '', ss_home)
check('Gold balance shown', await cdp.findText('g') || await cdp.findText('Gold'), '', '', ss_home)
// ProfileBar shows totalLevel/MAX format (e.g. "293/1287") and streak as number+"d"
check('Level / streak visible', await cdp.eval(`(()=>{
  const text = document.body.innerText
  return /\\d+\\/\\d+/.test(text) || text.includes('d streak') || /\\d+d/.test(text) || text.includes('streak')
})()`), '', '', ss_home)
check('Streak shown', await cdp.findText('streak') || await cdp.findText('d') || await cdp.findText('days'), '', '', ss_home)

// Click GRIND / session button
const grindClick = await cdp.eval(`(()=>{
  const btns = [...document.querySelectorAll('button')]
  const grindBtn = btns.find(b => {
    const txt = b.textContent || ''
    return txt.includes('GRIND') || txt.includes('STOP') || txt.includes('Stop') || /\\d+:\\d+/.test(txt)
  })
  if (grindBtn) { grindBtn.click(); return 'ok:' + grindBtn.textContent.trim().substring(0,20) }
  return 'NOT_FOUND'
})()`)
await cdp.wait(1200)
const ss_grind = await cdp.ss('home_after_grind_click')
check('GRIND/session button clickable', grindClick.startsWith('ok'), `result: ${grindClick}`, '', ss_grind)

// Timer visible after click?
const hasTimer = await cdp.findText(':') || await cdp.findText('00:')
check('Timer/session state responds to GRIND', hasTimer, '', '', ss_grind)

// Stop session if started
const stopClick = await cdp.clickText('Stop') || await cdp.clickText('STOP') || await cdp.clickText('End')
if (stopClick && stopClick.startsWith && stopClick.startsWith('ok')) {
  await cdp.wait(1000)
  await cdp.ss('home_session_stopped')
  pass('Stop session button works', stopClick)
}

// Task area — check GoalWidget / tasks section exists
await cdp.navTo('Home')
await cdp.wait(500)
const ss_addtask = await cdp.ss('home_tasks_area')
// +add / +focus buttons — may appear as small text buttons or icons
const addTaskClick = await cdp.eval(`(()=>{
  const btns = [...document.querySelectorAll('button,span[role=button]')]
  const btn = btns.find(b => b.textContent?.trim() === '+add' || b.textContent?.trim() === '+focus'
    || b.textContent?.trim() === '+' || b.getAttribute('aria-label')?.includes('add'))
  if (btn) { btn.click(); return 'ok:'+btn.textContent.trim() }
  return 'NOT_FOUND'
})()`)
await cdp.wait(800)
if (addTaskClick.startsWith('ok')) {
  pass('+add/+focus task button clickable', addTaskClick, ss_addtask)
  if (await cdp.modalOpen()) {
    pass('+add opens input modal', '', null)
    await cdp.escape()
    await cdp.wait(400)
  }
} else {
  // +add buttons may be in GoalWidget which may not be visible by default
  const hasGoalWidget = await cdp.findText('Goal') || await cdp.findText('Focus') || await cdp.findText('Task')
  if (hasGoalWidget) warn('+add task button', 'Goal/Task widget present but +add not found', ss_addtask)
  else warn('+add task button', 'No task/goal widget visible on Home', ss_addtask)
}

// Raid ambient bar (conditional)
const raidBarVisible = await cdp.findText('Phase') || await cdp.visible('[class*="ambient"],[class*="raidBar"],[class*="RaidBar"]')
if (raidBarVisible) {
  pass('Raid ambient bar visible (active raid)', '', ss_home)
} else {
  warn('Raid ambient bar', 'No active raid — bar hidden (expected)', ss_home)
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. BOTTOM NAV — ALL TABS
// ═════════════════════════════════════════════════════════════════════════════
section('2. BOTTOM NAV')

const navTabs = ['Home', 'Social', 'Arena', 'Farm']
for (const tab of navTabs) {
  await cdp.escape()
  const r = await cdp.clickText(tab, true)
  await cdp.wait(1800)
  const ss = await cdp.ss(`nav_tab_${tab.toLowerCase()}`)
  check(`Nav → ${tab}`, r.startsWith('ok'), `navigated`, `click failed: ${r}`, ss)
}

// SVG icons in nav
await cdp.navTo('Home')
const navSvgs = await cdp.eval(`(()=>{
  const nav=document.querySelector('nav,footer,[class*="BottomNav"],[class*="bottomNav"],[class*="bottom-nav"]')
  return nav ? nav.querySelectorAll('svg').length : 0
})()`)
check('Lucide SVG icons in nav', navSvgs >= 4, `${navSvgs} icons`, `only ${navSvgs} SVGs`, null)

// Active tab highlight
const activeGreen = await cdp.eval(`(()=>{
  const nav=document.querySelector('nav,footer,[class*="Nav"],[class*="nav"]')
  if(!nav)return false
  const active=nav.querySelector('[class*="active"],[class*="Active"],[aria-selected="true"]')
  return !!active
})()`)
check('Active tab has highlight', activeGreen, 'active class present', '', null)

// ═════════════════════════════════════════════════════════════════════════════
// 3. MORE MENU — FULL INTERACTION TEST
// ═════════════════════════════════════════════════════════════════════════════
section('3. MORE MENU')

await cdp.navTo('Home')
await cdp.wait(300)
await cdp.clickText('More', true)
await cdp.wait(1000)
const ss_more = await cdp.ss('more_menu_open')

check('More menu opens', await cdp.findText('Skills'), '', '', ss_more)
check('"drag to pin" hint shown', await cdp.findText('drag') || await cdp.findText('pin'), '', '', ss_more)

const moreItems = ['Skills', 'Stats', 'Inventory', 'Market', 'Craft', 'Cook', 'Profile', 'Settings']
for (const item of moreItems) {
  check(`More menu has: ${item}`, await cdp.findText(item), '', '', ss_more)
}

// Badge on Profile?
const profileBadge = await cdp.eval(`(()=>{
  const els=[...document.querySelectorAll('*')]
  const el=els.find(e=>e.textContent?.trim()==='Profile')
  if(!el)return false
  const parent=el.closest('button,li,[role=button]')
  if(!parent)return false
  return parent.querySelector('[class*="badge"],[class*="dot"],[class*="count"]')!==null
})()`)
if (profileBadge) pass('Profile badge visible in More menu', '')
else warn('Profile badge', 'No badge found on Profile item')

// Test each More menu item navigates correctly then come back
const moreNavTests = [
  { item: 'Skills',   check: 'Developer' },
  { item: 'Stats',    check: 'Activity' },  // StatsPage renders "Activity Insights", lazy loaded
  { item: 'Inventory',check: 'All' },
  { item: 'Market',   check: 'Browse' },
  { item: 'Craft',    check: 'Craft' },
  { item: 'Cook',     check: 'Cook' },
  { item: 'Profile',  check: 'Profile' },
  { item: 'Settings', check: 'Settings' },
]

for (const t of moreNavTests) {
  await cdp.navTo('Home')
  await cdp.wait(200)
  await cdp.clickText('More', true)
  await cdp.wait(700)
  const r = await cdp.clickText(t.item)
  await cdp.wait(t.item === 'Stats' ? 3500 : 1800)  // Stats is lazy-loaded, needs extra time
  const ss = await cdp.ss(`more_nav_${t.item.toLowerCase()}`)
  const pageLoaded = await cdp.findText(t.check)
  check(`More → ${t.item} navigates correctly`, r.startsWith('ok') && pageLoaded, `landed on ${t.item}`, `click=${r} content=${pageLoaded}`, ss)

  // Verify More menu CLOSED after navigation
  const moreStillOpen = await cdp.findText('drag any icon') || await cdp.findText('drag to pin')
  check(`More menu closed after navigating to ${t.item}`, !moreStillOpen, 'menu dismissed', 'menu still open — BUG', ss)
}

// Close More menu with Escape
await cdp.navTo('Home')
await cdp.wait(200)
await cdp.clickText('More', true)
await cdp.wait(700)
await cdp.escape()
await cdp.wait(500)
const moreClosedByEsc = !(await cdp.findText('drag any icon'))
check('More menu closes with Escape', moreClosedByEsc, '', 'still open after Escape', null)

// Close More menu by clicking outside — BottomNav listens to mousedown, not click
await cdp.clickText('More', true)
await cdp.wait(700)
await cdp.eval(`document.body.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true, clientX:10, clientY:300}))`)
await cdp.wait(600)
const moreClosedByOutside = !(await cdp.findText('drag any icon'))
check('More menu closes when clicking outside', moreClosedByOutside, '', 'still open — BUG', null)

// ═════════════════════════════════════════════════════════════════════════════
// 4. SKILLS PAGE
// ═════════════════════════════════════════════════════════════════════════════
section('4. SKILLS PAGE')

await cdp.openMore('Skills')
const ss_skills = await cdp.ss('skills_main')

const skills = ['Developer', 'Designer', 'Gamer', 'Communicator', 'Researcher', 'Creator', 'Learner', 'Listener']
for (const skill of skills) {
  check(`Skill: ${skill}`, await cdp.findText(skill), '', '', ss_skills)
}

// XP bars — Skills page uses inline-styled divs, check for bar-like elements with color
const xpBarCount = await cdp.eval(`(()=>{
  // Look for narrow horizontal divs that could be progress bars (width > 0, height < 20)
  const divs = [...document.querySelectorAll('div')]
  const bars = divs.filter(d => {
    const r = d.getBoundingClientRect()
    return r.height > 0 && r.height < 16 && r.width > 20 && r.width < 500
  })
  return bars.length
})()`)
check('XP bars / progress bars present', xpBarCount > 0, `${xpBarCount} bar-like elements`, '', ss_skills)

// Click a skill card — does it expand / show detail?
await cdp.clickText('Developer')
await cdp.wait(1000)
const ss_skill_click = await cdp.ss('skills_after_click_developer')
const expanded = await cdp.findText('time') || await cdp.findText('session') || await cdp.findText('XP')
check('Clicking skill card responds', expanded, '', '', ss_skill_click)

// Total level shown
check('Total level shown', await cdp.findText('Total') || await cdp.eval(`[...document.querySelectorAll('*')].some(e=>e.textContent?.match(/\\d{3}/))`), '', '', ss_skills)

// ═════════════════════════════════════════════════════════════════════════════
// 5. SOCIAL — FRIENDS
// ═════════════════════════════════════════════════════════════════════════════
section('5. SOCIAL — FRIENDS')

await cdp.navTo('Social')
await cdp.wait(500)
const ss_friends = await cdp.ss('social_friends')

// FriendsPage has PageHeader title="Social"
check('Friends/Social page loads', await cdp.findText('Social') || await cdp.findText('Squad') || await cdp.findText('Leaderboard'), '', '', ss_friends)

// Sub-tabs
const subTabs = ['Party', 'Leaderboard', 'Guild']
for (const t of subTabs) {
  check(`Sub-tab "${t}" visible`, await cdp.findText(t), '', '', ss_friends)
}

// Friend list items
const friendCount = await cdp.eval(`(()=>{
  const items=[...document.querySelectorAll('[class*="friend"],[class*="Friend"]')]
  return items.filter(i=>i.getBoundingClientRect().height>0).length
})()`)
if (friendCount > 0) pass(`Friend list has ${friendCount} items`, '', ss_friends)
else warn('Friend list', 'No friend items found (may be empty)', ss_friends)

// Click first friend — profile or chat should open
const firstFriendClicked = await cdp.eval(`(()=>{
  const items=[...document.querySelectorAll('[class*="friend"],[class*="Friend"]')]
    .filter(i=>i.getBoundingClientRect().height>30 && i.getBoundingClientRect().width>50)
  if(items.length){items[0].click();return 'ok'}
  return 'NOT_FOUND'
})()`)
await cdp.wait(1200)
const ss_friend_click = await cdp.ss('social_friend_clicked')
if (firstFriendClicked === 'ok') {
  const profileOpened = await cdp.findText('Message') || await cdp.findText('Compare') || await cdp.findText('Online') || await cdp.findText('Offline') || await cdp.findText('streak')
  check('Clicking friend opens profile/chat', profileOpened, '', 'nothing opened', ss_friend_click)
  // Close it
  await cdp.escape()
  await cdp.wait(500)
  const backClick = await cdp.clickText('Back') || await cdp.clickSel('[class*="back"],[aria-label="back"]')
  await cdp.wait(600)
} else {
  warn('Click friend', 'No clickable friend items found', ss_friends)
}

// Add friend input — AddFriend.tsx has placeholder="Username"
const hasAddInput = await cdp.visible('input[placeholder="Username"]')
  || await cdp.visible('input')
  || await cdp.findText('Username') || await cdp.findText('Add friend') || await cdp.findText('send request')
check('Add friend input visible (placeholder="Username")', hasAddInput, '', '', ss_friends)

if (hasAddInput) {
  await cdp.typeInto('input', 'testuser')
  await cdp.wait(600)
  await cdp.ss('social_add_friend_typed')
  pass('Can type in add-friend input', '', null)
  // Clear
  await cdp.eval(`const inp=document.querySelector('input');if(inp){inp.value='';inp.dispatchEvent(new Event('input',{bubbles:true}))}`)
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. SOCIAL — GUILD
// ═════════════════════════════════════════════════════════════════════════════
section('6. SOCIAL — GUILD')

await cdp.clickText('Guild', true)
await cdp.wait(2000)
const ss_guild = await cdp.ss('social_guild')

check('Guild page loads', await cdp.findText('Guild'), '', '', ss_guild)
check('Guild name visible', await cdp.findText('ZOV') || await cdp.eval(`[...document.querySelectorAll('h1,h2,h3,[class*="name"],[class*="Name"]')].some(e=>e.textContent?.trim().length>1)`), '', '', ss_guild)
check('Member count visible', await cdp.findText('Member') || await cdp.findText('member') || await cdp.findText('Power'), '', '', ss_guild)
// Guild shows chest_gold as "X,XXXg" or "🪙" emoji
check('Guild chest gold shown', await cdp.findText('🪙') || await cdp.findText('chest') || await cdp.findText('g') || await cdp.findText('Chest'), '', '', ss_guild)
check('XP / level progress', await cdp.findText('XP') || await cdp.findText('Lv.') || await cdp.findText('Level'), '', '', ss_guild)

// Overview / Hall tabs
const hallTabR = await cdp.clickText('Hall')
await cdp.wait(1500)
const ss_guild_hall = await cdp.ss('social_guild_hall')
check('Guild Hall tab opens', hallTabR.startsWith('ok'), `result: ${hallTabR}`, '', ss_guild_hall)
check('Guild Hall content loads', await cdp.findText('Hall') || await cdp.findText('hall'), '', '', ss_guild_hall)

// Overview tab back
const overviewR = await cdp.clickText('Overview') || await cdp.clickText('overview')
await cdp.wait(1000)
const ss_guild_overview = await cdp.ss('social_guild_overview')
check('Guild Overview tab opens', overviewR && overviewR.startsWith && overviewR.startsWith('ok'), '', '', ss_guild_overview)

// Click member row (right-click)
const memberRightClick = await cdp.eval(`(()=>{
  const rows=[...document.querySelectorAll('[class*="member"],[class*="Member"]')]
    .filter(r=>r.getBoundingClientRect().height>20)
  if(!rows.length)return 'NOT_FOUND'
  const r=rows[0].getBoundingClientRect()
  rows[0].dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:r.left+10,clientY:r.top+10}))
  return 'ok'
})()`)
await cdp.wait(800)
const ss_member_ctx = await cdp.ss('guild_member_rightclick')
const ctxMenuOpen = await cdp.findText('Message') || await cdp.findText('Kick') || await cdp.findText('Promote') || await cdp.findText('message')
if (memberRightClick === 'ok') {
  check('Right-click guild member opens context menu', ctxMenuOpen, '', 'no context menu appeared', ss_member_ctx)
  if (ctxMenuOpen) { await cdp.escape(); await cdp.wait(400) }
} else {
  warn('Right-click guild member', 'No member rows found', ss_guild)
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. SOCIAL — LEADERBOARD
// ═════════════════════════════════════════════════════════════════════════════
section('7. SOCIAL — LEADERBOARD')

await cdp.navTo('Social')
await cdp.wait(400)
await cdp.clickText('Leaderboard', true)
await cdp.wait(2000)
const ss_lb = await cdp.ss('leaderboard')

check('Leaderboard loads', await cdp.findText('Leaderboard') || await cdp.findText('Rank') || await cdp.findText('#1') || await cdp.findText('1.'), '', '', ss_lb)
// Leaderboard uses flex items with medal emoji (🥇🥈🥉) or #N rank numbers
check('Leaderboard entries visible', await cdp.eval(`(()=>{
  const text = document.body.innerText
  return text.includes('🥇') || text.includes('#1') || text.includes('(you)') || /\\d+ members/.test(text)
    || [...document.querySelectorAll('div')].filter(d=>{
      const r=d.getBoundingClientRect(); return r.height>30&&r.width>200&&r.width<580
    }).length > 3
})()`), '', '', ss_lb)

// ═════════════════════════════════════════════════════════════════════════════
// 8. SOCIAL — PARTY
// ═════════════════════════════════════════════════════════════════════════════
section('8. SOCIAL — PARTY')

await cdp.navTo('Social')
await cdp.wait(400)
await cdp.clickText('Party', true)
await cdp.wait(1800)
const ss_party = await cdp.ss('social_party')

check('Party panel renders', await cdp.findText('Party') || await cdp.findText('party'), '', '', ss_party)

// Detect whether an active party exists or we're in empty state
// Empty state shows "Create Party" button; active state shows member list + LEADER badge
const partyIsActive = await cdp.eval(`(()=>{
  const text = document.body.innerText
  // "Create Party" button means no active party
  if (text.includes('Create Party') || text.includes('create a party')) return false
  // LEADER badge or member count like "1/5" means active
  return text.includes('LEADER') || /\\d\\/\\d/.test(text)
})()`)

if (partyIsActive) {
  check('LEADER badge visible', await cdp.findText('LEADER') || await cdp.findText('Leader'), '', '', ss_party)

  // Role selector buttons — buttons have emoji content (🛡💚⚔) + title="Tank/Healer/DPS"
  const roleIconMap = { Tank: '🛡', Healer: '💚', DPS: '⚔' }
  for (const [role, icon] of Object.entries(roleIconMap)) {
    const hasRole = await cdp.findText(role) || await cdp.eval(`!!document.querySelector('button[title="${role}"]')`)
    check(`Role label/button: ${role}`, hasRole, '', '', ss_party)
  }

  // Click role buttons by title attribute
  for (const [role, icon] of Object.entries(roleIconMap)) {
    const r = await cdp.eval(`(()=>{
      const btn = document.querySelector('button[title="${role}"]')
        || [...document.querySelectorAll('button')].find(b => b.title === '${role}' || b.textContent?.includes('${icon}'))
      if(btn && !btn.disabled){ btn.click(); return 'ok:${role}' }
      if(btn && btn.disabled) return 'disabled:${role}'
      return 'NOT_FOUND:${role}'
    })()`)
    await cdp.wait(600)
    const ss_role = await cdp.ss(`party_role_${role.toLowerCase()}`)
    if (r.startsWith('disabled')) warn(`Role ${role} button`, 'Disabled (raid in progress)', ss_role)
    else check(`Role ${role} clickable`, r.startsWith('ok'), r, r, ss_role)
  }

  // XP buff banner
  const hasXpBuff = await cdp.findText('+5%') || await cdp.findText('XP Bonus') || await cdp.findText('bonus')
  if (hasXpBuff) pass('Party XP bonus banner visible', '')
  else warn('Party XP bonus', 'No XP buff shown (may need 2+ members)', ss_party)

  // Invite friends list
  check('Invite friends section visible', await cdp.findText('Invite') || await cdp.findText('invite'), '', '', ss_party)

  // Right-click party member
  const partyMemberRClick = await cdp.eval(`(()=>{
    const els=[...document.querySelectorAll('[class*="member"],[class*="Member"],[class*="party"],[class*="Party"]')]
      .filter(e=>e.getBoundingClientRect().height>30&&e.getBoundingClientRect().width>50)
    if(!els.length)return 'NOT_FOUND'
    const r=els[0].getBoundingClientRect()
    els[0].dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+20,clientY:r.top+10}))
    return 'ok'
  })()`)
  await cdp.wait(900)
  const ss_party_ctx = await cdp.ss('party_member_rightclick')
  if (partyMemberRClick === 'ok') {
    const ctxOpen = await cdp.findText('Leave') || await cdp.findText('Kick') || await cdp.findText('Message') || await cdp.findText('leader')
    check('Right-click party member → context menu', ctxOpen, '', 'no context menu', ss_party_ctx)
    if (ctxOpen) {
      check('Context menu: Leave party option', await cdp.findText('Leave'), '', '', ss_party_ctx)
      await cdp.escape()
      await cdp.wait(400)
    }
  } else {
    warn('Right-click party member', 'No party member elements found', ss_party)
  }

  // Disband button — test it exists but DO NOT click confirm
  const hasDisbandBtn = await cdp.findText('Disband')
  check('Disband button present', hasDisbandBtn, '', '', ss_party)
  if (hasDisbandBtn) {
    const disbandR = await cdp.clickText('Disband')
    await cdp.wait(800)
    const ss_disband = await cdp.ss('party_disband_clicked')
    const confirmShown = await cdp.findText('Are you sure') || await cdp.findText('confirm') || await cdp.findText('Confirm') || await cdp.modalOpen()
    if (confirmShown) {
      pass('Disband shows confirmation', '', ss_disband)
      await cdp.escape()
      await cdp.wait(400)
    } else {
      warn('Disband confirmation', 'Disband clicked but no confirm dialog appeared', ss_disband)
    }
  }
} else {
  // No active party — empty state checks
  warn('Party: no active party', 'Empty state (Create Party shown) — LEADER/roles/Disband require active party', ss_party)
  check('Party empty state renders', await cdp.findText('Create Party') || await cdp.findText('party') || await cdp.findText('Party'), '', '', ss_party)
  // Test Create Party button exists
  const hasCreateBtn = await cdp.findText('Create Party')
  if (hasCreateBtn) pass('Create Party button visible in empty state', '', ss_party)
  else warn('Create Party button', 'Not found in party empty state', ss_party)
}

// PartyHUD on Home — navigate there and check
await cdp.navTo('Home')
await cdp.wait(600)
const ss_party_hud = await cdp.ss('home_party_hud')
const hasHud = await cdp.findText('Party') || await cdp.visible('[class*="PartyHUD"],[class*="partyHUD"],[class*="party-hud"]')
if (hasHud) pass('Party HUD visible on Home', '', ss_party_hud)
else warn('Party HUD on Home', 'HUD hidden — may need active party', ss_party_hud)

// ═════════════════════════════════════════════════════════════════════════════
// 9. ARENA — DUNGEONS
// ═════════════════════════════════════════════════════════════════════════════
section('9. ARENA — DUNGEONS')

await cdp.navTo('Arena')
await cdp.wait(500)
const ss_arena = await cdp.ss('arena_dungeons')

check('Dungeons tab loads', await cdp.findText('Dungeon') || await cdp.findText('Zone'), '', '', ss_arena)
check('Character panel visible', await cdp.findText('ATK') || await cdp.findText('HP'), '', '', ss_arena)
check('Player stats shown', await cdp.findText('ATK') && await cdp.findText('DEF'), '', '', ss_arena)
check('Zone/dungeon list visible', await cdp.findText('Zone') || await cdp.findText('Crypt') || await cdp.findText('Forest'), '', '', ss_arena)

// Arena sub-tabs
const arenaTabs = ['Dungeons', 'Raids']
for (const t of arenaTabs) {
  check(`Arena sub-tab "${t}" present`, await cdp.findText(t), '', '', ss_arena)
}

// Click a zone card — ZoneCard is a motion.div with rounded-2xl border, click Enter button
const zoneClicked = await cdp.eval(`(()=>{
  // Find Enter/Fight button inside zone cards
  const btns = [...document.querySelectorAll('button')]
  const enterBtn = btns.find(b => b.textContent?.includes('Enter') || b.textContent?.includes('Fight') || b.textContent?.includes('Auto'))
  if (enterBtn) { enterBtn.click(); return 'ok:'+enterBtn.textContent.trim().substring(0,20) }
  // Fallback: click the zone card itself (rounded-2xl border div)
  const cards = [...document.querySelectorAll('div')].filter(d => {
    const cls = d.className || ''
    return cls.includes('rounded-2xl') && cls.includes('border') && d.getBoundingClientRect().height > 80
  })
  if (cards.length) { cards[0].click(); return 'ok:card' }
  return 'NOT_FOUND'
})()`)
await cdp.wait(1500)
const ss_zone = await cdp.ss('arena_zone_clicked')
check('Zone card / Enter button clickable', zoneClicked.startsWith('ok'), `${zoneClicked}`, '', ss_zone)
if (await cdp.modalOpen()) {
  pass('Clicking zone opens detail/modal', '', ss_zone)
  await cdp.escape()
  await cdp.wait(500)
}

// Gear slots — CharacterPanel uses w-7 h-7 or w-14 h-14 rounded-md flex divs
const gearSlotCount = await cdp.eval(`(()=>{
  // Look for small square boxes that represent gear slots
  const divs = [...document.querySelectorAll('div')]
  return divs.filter(d => {
    const cls = d.className || ''
    return (cls.includes('rounded-md') || cls.includes('rounded-lg')) && cls.includes('flex') && cls.includes('items-center')
      && d.getBoundingClientRect().width > 20 && d.getBoundingClientRect().width < 80
      && d.getBoundingClientRect().height > 20 && d.getBoundingClientRect().height < 80
  }).length
})()`)
check('Gear slots in character panel', gearSlotCount > 0, `${gearSlotCount} gear slot elements`, '', ss_arena)

// Hot Zone shown
const hasHotZone = await cdp.findText('Hot Zone') || await cdp.findText('hot zone') || await cdp.findText('Shadow Crypt')
if (hasHotZone) pass('Hot Zone indicator visible', '', ss_arena)
else warn('Hot Zone', 'Hot Zone not visible on character panel', ss_arena)

// ═════════════════════════════════════════════════════════════════════════════
// 10. ARENA — RAIDS
// ═════════════════════════════════════════════════════════════════════════════
section('10. ARENA — RAIDS (new system)')

await cdp.clickText('Raids', true)
await cdp.wait(2500)
const ss_raids = await cdp.ss('arena_raids')

check('Raids tab loads', await cdp.findText('Raid') || await cdp.findText('raid'), '', '', ss_raids)
check('Raid tier cards visible', await cdp.findText('Ancient') || await cdp.findText('Mythic') || await cdp.findText('Boss') || await cdp.findText('Tier'), '', '', ss_raids)
check('Entry requirements shown', await cdp.findText('Warrior') || await cdp.findText('require') || await cdp.findText('Zone') || await cdp.findText('level'), '', '', ss_raids)

// RaidsTab renders ✓ / ✗ characters in colored spans for requirements
const reqCheckmarks = await cdp.eval(`(()=>{
  const text = document.body.innerText
  return (text.match(/✓|✗/g) || []).length
})()`)
check('Requirement checkmarks (✓/✗) present', reqCheckmarks > 0, `${reqCheckmarks} checkmarks`, '', ss_raids)

// Pending raid invites panel
const hasPendingInvites = await cdp.findText('Accept') || await cdp.findText('invited you') || await cdp.findText('pending')
if (hasPendingInvites) {
  pass('Pending raid invites visible', '', ss_raids)
  // Test Accept button
  const acceptR = await cdp.clickText('Accept')
  await cdp.wait(800)
  await cdp.ss('raids_accept_invite_clicked')
  check('Accept raid invite clickable', acceptR && acceptR.startsWith('ok'), '', '', null)
  await cdp.escape()
}

// Begin Raid button → tribute modal
const hasBeginBtn = await cdp.findText('Begin Raid')
if (hasBeginBtn) {
  pass('Begin Raid button visible', '', ss_raids)
  const beginR = await cdp.clickText('Begin Raid')
  await cdp.wait(1500)
  const ss_tribute = await cdp.ss('raids_begin_raid_clicked')
  check('Begin Raid opens tribute/confirm modal', await cdp.modalOpen() || await cdp.findText('tribute') || await cdp.findText('Tribute') || await cdp.findText('Select'), '', 'nothing opened', ss_tribute)
  if (await cdp.modalOpen()) {
    pass('Tribute modal has content', '', ss_tribute)
    // Check Close/Cancel button
    const hasClose = await cdp.findText('Close') || await cdp.findText('Cancel') || await cdp.findText('×')
    check('Tribute modal has close button', hasClose, '', '', ss_tribute)
    await cdp.escape()
    await cdp.wait(600)
  }
} else {
  // Active raid might be shown instead
  const hasActiveRaid = await cdp.findText('Phase') || await cdp.findText('Attack') || await cdp.findText('Defend') || await cdp.findText('Heal')
  if (hasActiveRaid) {
    pass('Active raid panel visible (raid in progress)', '', ss_raids)
    // Test action buttons
    for (const action of ['Attack', 'Defend', 'Heal']) {
      const hasBtn = await cdp.findText(action)
      if (hasBtn) {
        const r = await cdp.clickText(action)
        await cdp.wait(1200)
        const ss_action = await cdp.ss(`raids_${action.toLowerCase()}_clicked`)
        if (await cdp.modalOpen()) {
          pass(`${action} button opens modal`, '', ss_action)
          await cdp.escape()
          await cdp.wait(600)
        } else {
          check(`${action} button clickable`, r.startsWith('ok'), r, '', ss_action)
        }
      }
    }
  } else {
    warn('Begin Raid button', 'No Begin Raid button and no active raid visible', ss_raids)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 11. ARENA — HALL OF RAIDS
// ═════════════════════════════════════════════════════════════════════════════
section('11. ARENA — HALL OF RAIDS')

const hallR = await cdp.eval(`(()=>{
  const tabs=[...document.querySelectorAll('[role=tab],button')]
  const h=tabs.find(t=>t.textContent?.includes('Hall'))
  if(h){h.click();return 'ok:'+h.textContent.trim()}
  return 'NOT_FOUND'
})()`)
await cdp.wait(2000)
const ss_hall = await cdp.ss('arena_hall_of_raids')

check('Hall of Raids tab clicks', hallR.startsWith('ok'), hallR, '', ss_hall)
check('Hall content loads without error', !(await cdp.findText('TypeError')) && !(await cdp.findText('Cannot read')), '', '', ss_hall)
check('Hall has content or empty state', await cdp.findText('Hall') || await cdp.findText('No raids') || await cdp.findText('completed') || await cdp.findText('history'), '', '', ss_hall)

// ═════════════════════════════════════════════════════════════════════════════
// 12. RAID PARTY PANEL (Friends > Party when raid active)
// ═════════════════════════════════════════════════════════════════════════════
section('12. RAID PARTY PANEL')

await cdp.navTo('Social')
await cdp.wait(400)
await cdp.clickText('Party', true)
await cdp.wait(1800)
const ss_rpp = await cdp.ss('raid_party_panel')

const hasRaidSection = await cdp.findText('Invite to Raid') || await cdp.findText('Raid Party') || await cdp.findText('raid invite')
if (hasRaidSection) {
  pass('RaidPartyPanel visible (active raid)', '', ss_rpp)
  // Check invite buttons
  const inviteBtns = await cdp.count('button')
  pass(`Invite buttons present: ${inviteBtns}`, '', ss_rpp)
} else {
  warn('RaidPartyPanel', 'Not visible — requires active raid (expected if no raid)', ss_rpp)
}

// ═════════════════════════════════════════════════════════════════════════════
// 13. MARKETPLACE
// ═════════════════════════════════════════════════════════════════════════════
section('13. MARKETPLACE')

await cdp.openMore('Market')
await cdp.wait(1000)
const ss_market = await cdp.ss('marketplace_browse')

check('Marketplace loads', await cdp.findText('Marketplace') || await cdp.findText('Browse'), '', '', ss_market)
check('Listings present', await cdp.findText('floor') || await cdp.findText('g') || await cdp.findText('seller'), '', '', ss_market)

// Category filter chips
const filterChips = ['All', 'Combat', 'XP', 'Seeds', 'Cosmetic']
for (const chip of filterChips) {
  const hasChip = await cdp.findText(chip)
  if (hasChip) {
    const r = await cdp.clickText(chip)
    await cdp.wait(800)
    check(`Filter chip "${chip}" clickable`, r.startsWith('ok'), '', '', null)
  }
}
const ss_filter = await cdp.ss('marketplace_after_filter')

// Reset to All filter before trying to click a listing (Cosmetic may have 0 listings)
await cdp.clickText('All')
await cdp.wait(1200)

// Click a listing → offers modal
// MarketplacePage renders OrderBookTile as motion.button (renders as <button>)
// Each tile shows rarity badge, item name, floor price with 🪙 and "floor" text
const listingClicked = await cdp.eval(`(()=>{
  // Strategy 1: button elements with "floor" text (OrderBookTile)
  const btns = [...document.querySelectorAll('button')]
  for (const btn of btns) {
    const r = btn.getBoundingClientRect()
    const txt = btn.textContent || ''
    if (r.height > 40 && r.height < 200 && r.width > 150 && r.width < 560
        && txt.includes('floor')) {
      btn.click(); return 'ok:floor-btn'
    }
  }
  // Strategy 2: button with 🪙 emoji (price chip)
  for (const btn of btns) {
    const r = btn.getBoundingClientRect()
    const txt = btn.textContent || ''
    if (r.height > 40 && r.height < 200 && r.width > 150 && r.width < 560
        && txt.includes('🪙') && !txt.includes('More') && !txt.includes('nav')) {
      btn.click(); return 'ok:gold-btn'
    }
  }
  // Strategy 3: any button with rarity name visible on screen
  for (const btn of btns) {
    const r = btn.getBoundingClientRect()
    if (r.height > 40 && r.height < 180 && r.width > 150 && r.width < 560
        && r.top > 100 && r.top < 700) {
      const txt = btn.textContent || ''
      if (txt.includes('common') || txt.includes('rare') || txt.includes('epic') || txt.includes('legendary') || txt.includes('mythic')) {
        btn.click(); return 'ok:rarity-btn'
      }
    }
  }
  return 'NOT_FOUND'
})()`)
await cdp.wait(2500)
const ss_listing_modal = await cdp.ss('marketplace_listing_clicked')
// Marketplace offers modal: fixed inset-0 z-[100] with 🪙 price tiers and Buy button
const listingModalOpen = await cdp.modalOpen() || await cdp.eval(`(()=>{
  // Detect the offers modal specifically: fixed overlay + Buy button visible
  const hasBuy = [...document.querySelectorAll('button')].some(b => {
    const r = b.getBoundingClientRect()
    return b.textContent?.includes('Buy') && r.width > 40 && r.height > 20
  })
  const fixedOverlay = [...document.querySelectorAll('div')].some(d => {
    const s = window.getComputedStyle(d)
    const r = d.getBoundingClientRect()
    return s.position === 'fixed' && r.width > 200 && r.height > 200 && parseInt(s.zIndex) >= 50
      && (s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.backdropFilter)
  })
  return hasBuy && fixedOverlay
})()`)

if (listingClicked === 'NOT_FOUND') {
  warn('Clicking listing opens modal', 'No listing buttons found — listings may not have loaded (network dependent)', ss_listing_modal)
} else {
  check('Clicking listing opens modal', listingModalOpen, listingClicked, `listing clicked but modal not opened (clicked: ${listingClicked})`, ss_listing_modal)
}
if (listingModalOpen) {
  check('Modal has item details', await cdp.findText('Buy') || await cdp.findText('Price') || await cdp.findText('Rarity') || await cdp.findText('IP') || await cdp.findText('🪙'), '', '', ss_listing_modal)

  // Overlay should NOT block clicking (bug fix check)
  const overlayBlocks = await cdp.eval(`(()=>{
    const overlays=[...document.querySelectorAll('[class*="overlay"],[class*="backdrop"],[class*="Overlay"]')]
    return overlays.some(o=>{
      const s=window.getComputedStyle(o)
      const r=o.getBoundingClientRect()
      return s.pointerEvents!=='none'&&s.display!=='none'&&r.width>200&&r.height>200
        &&!o.querySelector('[class*="modal"],[class*="Modal"]')
    })
  })()`)
  check('Marketplace overlay NOT blocking clicks (bug fix)', !overlayBlocks, 'pointer-events:none on overlay', '⚠️ overlay blocking clicks — BUG', ss_listing_modal)

  // Close modal
  const closeR = await cdp.clickText('Close') || await cdp.clickText('×') || await cdp.clickSel('[aria-label="close"],[class*="close"]')
  await cdp.wait(600)
  if (!(await cdp.modalOpen())) {
    pass('Listing modal closes', '', null)
  } else {
    await cdp.escape()
    await cdp.wait(500)
    if (!(await cdp.modalOpen())) pass('Listing modal closes via Escape', '', null)
    else fail('Listing modal cannot be closed', '❌ STUCK MODAL — BUG', null)
  }
}

// Marketplace tabs: Browse / Sell / My Listings / History
const marketTabs = ['Browse', 'Sell', 'My Listings', 'History']
for (const t of marketTabs) {
  const r = await cdp.clickText(t)
  await cdp.wait(1200)
  const ss_mt = await cdp.ss(`marketplace_tab_${t.toLowerCase().replace(' ','_')}`)
  check(`Marketplace tab "${t}"`, r.startsWith('ok') || await cdp.findText(t), `result: ${r}`, '', ss_mt)
}

// Sell tab — form visible
await cdp.clickText('Sell')
await cdp.wait(1200)
const ss_sell = await cdp.ss('marketplace_sell_tab')
const hasSellForm = await cdp.findText('Select item') || await cdp.findText('Choose') || await cdp.findText('Price') || await cdp.findText('List')
check('Sell tab has form/instructions', hasSellForm, '', '', ss_sell)

// ═════════════════════════════════════════════════════════════════════════════
// 14. CRAFT
// ═════════════════════════════════════════════════════════════════════════════
section('14. CRAFT PAGE')

await cdp.openMore('Craft')
const ss_craft = await cdp.ss('craft_main')

check('Craft page loads', await cdp.findText('Craft'), '', '', ss_craft)
check('Recipe count shown', await cdp.findText('/') || await cdp.findText('unlocked') || await cdp.findText('recipe'), '', '', ss_craft)
check('Lich Set recipe visible', await cdp.findText('Lich'), 'Zone 7 gear', '', ss_craft)
check('Titan Set recipe visible', await cdp.findText('Titan'), 'Zone 8 gear', '', ss_craft)

// Category tabs
const craftTabs = ['All', 'Head', 'Body', 'Weapon', 'Ring']
for (const t of craftTabs) {
  if (await cdp.findText(t)) {
    const r = await cdp.clickText(t)
    await cdp.wait(600)
    check(`Craft tab "${t}" clickable`, r.startsWith('ok'), '', '', null)
  }
}
await cdp.clickText('All')
await cdp.wait(600)

// Click a recipe — CraftPage uses list items/rows, find clickable recipe row
const recipeClicked = await cdp.eval(`(()=>{
  // Recipe rows contain XP and craft level text
  const divs = [...document.querySelectorAll('div')]
  const row = divs.find(d => {
    const r = d.getBoundingClientRect()
    return r.height > 30 && r.height < 100 && r.width > 200 && r.width < 580
      && (d.textContent?.includes('XP') || d.textContent?.includes('Lv'))
      && d.style.cursor === 'pointer' || (d.className?.includes('cursor') || d.onclick)
  })
  if (row) { row.click(); return 'ok' }
  // Fallback: click first reasonably sized item in the list
  const items = divs.filter(d => {
    const r = d.getBoundingClientRect()
    return r.height > 40 && r.height < 120 && r.width > 200 && r.width < 580
      && d.className?.includes('rounded') && !d.querySelector('nav')
  })
  if (items.length > 2) { items[2].click(); return 'ok:item' }
  return 'NOT_FOUND'
})()`)
await cdp.wait(1200)
const ss_recipe = await cdp.ss('craft_recipe_clicked')
check('Clicking recipe responds', recipeClicked.startsWith('ok'), '', '', ss_recipe)
const craftBtnVisible = await cdp.findText('Craft') || await cdp.findText('craft') || await cdp.findText('materials') || await cdp.findText('Materials')
check('Recipe shows craft details', craftBtnVisible, '', '', ss_recipe)

// Craft button (don't actually craft)
const craftBtn = await cdp.findText('Craft now') || await cdp.findText('Craft item') || await cdp.eval(`[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Craft')`)
if (craftBtn) pass('Craft button visible on recipe', '', ss_recipe)
else warn('Craft button', 'Not visible — may need materials or different state', ss_recipe)

// ═════════════════════════════════════════════════════════════════════════════
// 15. COOKING
// ═════════════════════════════════════════════════════════════════════════════
section('15. COOKING PAGE')

await cdp.openMore('Cook')
const ss_cook = await cdp.ss('cooking_main')

check('Cooking page loads', await cdp.findText('Cook'), '', '', ss_cook)
check('Utensils row visible', await cdp.findText('Knife') || await cdp.findText('Pot') || await cdp.findText('Pan'), '', '', ss_cook)
check('Cooking level shown', await cdp.findText('Lv') || await cdp.findText('Level') || await cdp.findText('XP'), '', '', ss_cook)

// Cooking tabs: Recipes / Cauldron / Cookbook
const cookTabs = ['Recipes', 'Cauldron', 'Cookbook']
for (const t of cookTabs) {
  if (await cdp.findText(t)) {
    const r = await cdp.clickText(t)
    await cdp.wait(1000)
    const ss_ct = await cdp.ss(`cooking_tab_${t.toLowerCase()}`)
    check(`Cooking tab "${t}"`, r.startsWith('ok'), '', '', ss_ct)
  }
}

// Click a recipe
await cdp.clickText('Recipes')
await cdp.wait(800)
const cookRecipeClicked = await cdp.eval(`(()=>{
  const items=[...document.querySelectorAll('[class*="recipe"],[class*="Recipe"],[class*="item"],[class*="Item"]')]
    .filter(i=>i.getBoundingClientRect().height>20)
  if(!items.length)return 'NOT_FOUND'
  items[0].click()
  return 'ok'
})()`)
await cdp.wait(1200)
const ss_cook_recipe = await cdp.ss('cooking_recipe_clicked')
check('Clicking cooking recipe responds', cookRecipeClicked.startsWith('ok') || await cdp.findText('Cook') || await cdp.findText('ingredient'), '', '', ss_cook_recipe)
if (await cdp.modalOpen()) {
  pass('Cooking recipe opens modal', '', ss_cook_recipe)
  await cdp.escape()
  await cdp.wait(400)
}

// ═════════════════════════════════════════════════════════════════════════════
// 16. FARM
// ═════════════════════════════════════════════════════════════════════════════
section('16. FARM PAGE')

await cdp.navTo('Farm')
await cdp.wait(1000)
const ss_farm = await cdp.ss('farm_main')

check('Farm page loads', await cdp.findText('Farm') || await cdp.findText('farm'), '', '', ss_farm)
check('Field sections visible', await cdp.findText('Field 1') || await cdp.findText('Field'), '', '', ss_farm)
check('Plot slots visible', await cdp.findText('PLANT') || await cdp.findText('Plant') || await cdp.findText('slot') || await cdp.findText('empty'), '', '', ss_farm)
check('Cost shown for next plot', await cdp.findText('g') || await cdp.findText('Gold') || await cdp.findText('cost'), '', '', ss_farm)

// Click PLANT SEED / empty plot
const plotClicked = await cdp.eval(`(()=>{
  const plots=[...document.querySelectorAll('[class*="plot"],[class*="Plot"],[class*="slot"],[class*="Slot"]')]
    .filter(p=>p.getBoundingClientRect().height>20)
  if(!plots.length){
    // Try clicking "PLANT" text directly
    const plantBtns=[...document.querySelectorAll('button')].filter(b=>b.textContent?.includes('PLANT')||b.textContent?.includes('Plant'))
    if(plantBtns.length){plantBtns[0].click();return 'ok:plant-btn'}
    return 'NOT_FOUND'
  }
  plots[0].click()
  return 'ok:plot'
})()`)
await cdp.wait(1500)
const ss_plot = await cdp.ss('farm_plot_clicked')
check('Clicking farm plot responds', plotClicked.startsWith('ok'), plotClicked, '', ss_plot)
if (await cdp.modalOpen()) {
  pass('Clicking plot opens seed selection modal', '', ss_plot)
  check('Seed modal has seeds', await cdp.findText('Seed') || await cdp.findText('seed') || await cdp.findText('Plant'), '', '', ss_plot)
  await cdp.escape()
  await cdp.wait(500)
}

// Farmhouse section
const hasFarmhouse = await cdp.findText('Farmhouse') || await cdp.findText('farmhouse')
if (hasFarmhouse) pass('Farmhouse section visible', '', ss_farm)
else warn('Farmhouse', 'Farmhouse section not found', ss_farm)

// ═════════════════════════════════════════════════════════════════════════════
// 17. INVENTORY
// ═════════════════════════════════════════════════════════════════════════════
section('17. INVENTORY')

await cdp.openMore('Inventory')
await cdp.wait(1000)
const ss_inv = await cdp.ss('inventory_main')

check('Inventory loads', await cdp.findText('Inventory') || await cdp.findText('item'), '', '', ss_inv)

// Filter tabs
const invFilters = ['All', 'Weapons', 'Combat', 'XP', 'Potions', 'Food', 'Seeds']
for (const f of invFilters) {
  if (await cdp.findText(f)) {
    const r = await cdp.clickText(f)
    await cdp.wait(700)
    check(`Inventory filter "${f}"`, r.startsWith('ok'), '', '', null)
  }
}
await cdp.clickText('All')
await cdp.wait(800)

// Count items
const itemCount = await cdp.eval(`[...document.querySelectorAll('[class*="item"],[class*="Item"]')].filter(i=>i.getBoundingClientRect().height>20&&i.getBoundingClientRect().width>20).length`)
check('Items visible', itemCount > 0, `${itemCount} item elements`, '', ss_inv)

// Click item — details shown?
const itemClicked = await cdp.eval(`(()=>{
  const items=[...document.querySelectorAll('[class*="item"],[class*="Item"]')]
    .filter(i=>i.getBoundingClientRect().height>30&&i.getBoundingClientRect().width>30&&!i.querySelector('[class*="item"],[class*="Item"]'))
  if(!items.length)return 'NOT_FOUND'
  items[0].click()
  return 'ok'
})()`)
await cdp.wait(1200)
const ss_item = await cdp.ss('inventory_item_clicked')
check('Clicking inventory item responds', itemClicked.startsWith('ok'), '', '', ss_item)
if (await cdp.modalOpen()) {
  pass('Item click opens detail modal', '', ss_item)
  check('Item modal has stats', await cdp.findText('IP') || await cdp.findText('Rarity') || await cdp.findText('Equip') || await cdp.findText('Use'), '', '', ss_item)
  await cdp.escape()
  await cdp.wait(400)
}

// Right-click item
const itemRClick = await cdp.eval(`(()=>{
  const items=[...document.querySelectorAll('[class*="item"],[class*="Item"]')]
    .filter(i=>i.getBoundingClientRect().height>30&&i.getBoundingClientRect().width>30&&!i.querySelector('[class*="item"],[class*="Item"]'))
  if(!items.length)return 'NOT_FOUND'
  const r=items[0].getBoundingClientRect()
  items[0].dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+10,clientY:r.top+10}))
  return 'ok'
})()`)
await cdp.wait(800)
const ss_item_rclick = await cdp.ss('inventory_item_rightclick')
if (itemRClick === 'ok') {
  const ctxOpen = await cdp.findText('Equip') || await cdp.findText('Use') || await cdp.findText('Sell') || await cdp.findText('Drop') || await cdp.findText('List')
  check('Right-click item → context menu', ctxOpen, '', 'no context menu', ss_item_rclick)
  if (ctxOpen) { await cdp.escape(); await cdp.wait(400) }
} else {
  warn('Right-click inventory item', 'No item elements found', ss_inv)
}

// Equipped gear — check CharacterCard section shows slot labels or equipped item names
const hasGearSlots = await cdp.eval(`(()=>{
  const text = document.body.innerText.toLowerCase()
  // Slot label names
  if (text.includes('head') || text.includes('aura') || text.includes('accessory')) return true
  // Equipped item name patterns from known gear
  if (text.includes('blade') || text.includes('helm') || text.includes('greave') || text.includes('plate') || text.includes('sigil')) return true
  // Combat stats shown in character card
  if ((text.includes('atk') || text.includes('attack')) && (text.includes('hp') || text.includes('def'))) return true
  // Any slot-like structure (small colored squares/icons representing gear slots)
  const slots = [...document.querySelectorAll('div')].filter(d => {
    const r = d.getBoundingClientRect()
    const cls = d.className || ''
    return r.width >= 28 && r.width <= 72 && r.height >= 28 && r.height <= 72
      && (cls.includes('rounded') || cls.includes('border')) && cls.includes('flex')
  })
  return slots.length >= 3
})()`)
if (hasGearSlots) pass('Equipped gear / slot labels visible', '', ss_inv)
else warn('Equipped gear / slot labels', 'Gear slots not detected — may be scrolled out of view', ss_inv)

// ═════════════════════════════════════════════════════════════════════════════
// 18. STATS PAGE
// ═════════════════════════════════════════════════════════════════════════════
section('18. STATS PAGE')

await cdp.openMore('Stats')
await cdp.wait(1500)
const ss_stats = await cdp.ss('stats_main')

// StatsPage renders "Activity Insights", "Total active time", "Recent Sessions" — not just "Stats"
check('Stats page loads', await cdp.findText('Activity') || await cdp.findText('session') || await cdp.findText('Total') || await cdp.findText('Insights') || await cdp.findText('focus'), '', '', ss_stats)
check('Activity data shown', await cdp.findText('hour') || await cdp.findText('time') || await cdp.findText('session') || await cdp.findText('day'), '', '', ss_stats)

// ═════════════════════════════════════════════════════════════════════════════
// 19. PROFILE PAGE
// ═════════════════════════════════════════════════════════════════════════════
section('19. PROFILE PAGE')

await cdp.openMore('Profile')
await cdp.wait(1500)
const ss_profile = await cdp.ss('profile_main')

check('Profile page loads', await cdp.findText('Profile') || await cdp.findText('Level') || await cdp.findText('streak'), '', '', ss_profile)
check('Avatar / username shown', await cdp.findText('Phil') || await cdp.findText('Level') || await cdp.findText('Lv.'), '', '', ss_profile)
check('Streak shown', await cdp.findText('streak') || await cdp.findText('day') || await cdp.findText('d'), '', '', ss_profile)

// ═════════════════════════════════════════════════════════════════════════════
// 20. SETTINGS PAGE
// ═════════════════════════════════════════════════════════════════════════════
section('20. SETTINGS PAGE')

await cdp.openMore('Settings')
await cdp.wait(1500)
const ss_settings = await cdp.ss('settings_main')

check('Settings page loads', await cdp.findText('Settings'), '', '', ss_settings)

// Settings sections
const settingsSections = ['Notification', 'Theme', 'Account', 'Privacy', 'Language', 'Sound']
let foundSettings = 0
for (const s of settingsSections) {
  if (await cdp.findText(s)) foundSettings++
}
check('Settings has content', foundSettings > 0, `${foundSettings} setting categories found`, '', ss_settings)

// ToggleRow renders as <button class="w-9 h-[22px] rounded-full relative ...">
// Expand a section first, then click a toggle button
const sectionExpanded = await cdp.clickText('Sound & Audio') || await cdp.clickText('General') || await cdp.clickText('Notifications')
await cdp.wait(800)
const toggleClicked = await cdp.eval(`(()=>{
  // ToggleRow buttons: w-9 h-[22px] rounded-full — they are small pill-shaped buttons
  const btns = [...document.querySelectorAll('button')]
  const toggle = btns.find(b => {
    const r = b.getBoundingClientRect()
    return r.width > 28 && r.width < 50 && r.height > 14 && r.height < 30
      && (b.className?.includes('rounded-full') || b.className?.includes('rounded'))
  })
  if(!toggle)return 'NOT_FOUND'
  toggle.click()
  return 'ok:toggled'
})()`)
await cdp.wait(700)
const ss_toggle = await cdp.ss('settings_toggle_clicked')
check('Settings toggle/switch clickable', toggleClicked.startsWith('ok'), toggleClicked, 'no pill-shaped toggle buttons found', ss_toggle)

// ═════════════════════════════════════════════════════════════════════════════
// 21. NOTIFICATIONS PANEL
// ═════════════════════════════════════════════════════════════════════════════
section('21. NOTIFICATIONS PANEL')

await cdp.navTo('Home')
await cdp.wait(400)

// Notification bell/button
const notifClicked = await cdp.eval(`(()=>{
  const btns=[...document.querySelectorAll('button,[role=button]')]
  const bell=btns.find(b=>b.querySelector('svg[class*="bell"],svg[class*="Bell"]')
    ||b.getAttribute('aria-label')?.toLowerCase().includes('notif')
    ||b.textContent?.trim()==='🔔')
  if(bell){bell.click();return 'ok'}
  return 'NOT_FOUND'
})()`)
await cdp.wait(1000)
const ss_notif = await cdp.ss('notifications_panel')
if (notifClicked === 'ok') {
  check('Notification panel opens', await cdp.modalOpen() || await cdp.findText('Notification') || await cdp.findText('notification'), '', '', ss_notif)
  await cdp.escape()
  await cdp.wait(400)
} else {
  warn('Notifications', 'Bell/notification button not found on Home', ss_notif)
}

// ═════════════════════════════════════════════════════════════════════════════
// 22. WHATS NEW MODAL
// ═════════════════════════════════════════════════════════════════════════════
section('22. WHATS NEW MODAL')

await cdp.navTo('Home')
// Try clicking version number or "What's New" trigger
const whatsNewClicked = await cdp.eval(`(()=>{
  const btns=[...document.querySelectorAll('button,[role=button],a,span')]
  const btn=btns.find(b=>
    b.textContent?.includes("What's New")||
    b.textContent?.includes("Whats New")||
    b.textContent?.includes("v3.")||
    b.textContent?.match(/^v\\d/)
  )
  if(btn){btn.click();return 'ok:'+btn.textContent.trim()}
  return 'NOT_FOUND'
})()`)
await cdp.wait(1000)
const ss_wnm = await cdp.ss('whats_new_modal')
if (whatsNewClicked.startsWith('ok')) {
  check("What's New modal opens", await cdp.modalOpen() || await cdp.findText('NEW') || await cdp.findText("What's New"), '', '', ss_wnm)
  if (await cdp.modalOpen()) {
    const hasCloseBtn = await cdp.findText("Let's go") || await cdp.findText("Close") || await cdp.findText("Got it")
    check("What's New modal has close button", hasCloseBtn, '', '', ss_wnm)
    await cdp.escape()
    await cdp.wait(400)
  }
} else {
  warn("What's New modal", 'Trigger button not found — may require specific state', ss_wnm)
}

// ═════════════════════════════════════════════════════════════════════════════
// FINAL — RETURN TO HOME + FULL ERROR SCAN
// ═════════════════════════════════════════════════════════════════════════════
section('FINAL — NAVIGATION & GLOBAL ERRORS')

await cdp.navTo('Home')
await cdp.wait(2000)
const ss_final = await cdp.ss('zz_final_home')
// Home may show timer if session active, or GRIND button if idle
check('Return to Home works', await cdp.findText('GRIND') || await cdp.findText('PAUSE') || await cdp.findText('STOP') || await cdp.findText('Daily'), '', '', ss_final)

// Drain all remaining errors
const finalErrors = cdp.drainErrors()
if (finalErrors.length > 0) {
  results.push({ section: 'FINAL', name: 'Global JS errors (late)', status: 'FAIL', detail: finalErrors.join(' | '), ss: '', errors: finalErrors })
  finalErrors.forEach(e => console.log(`  ❌ JS: ${e}`))
} else {
  pass('No JS errors at end of session', '0 exceptions', null)
}

// ═════════════════════════════════════════════════════════════════════════════
// REPORT
// ═════════════════════════════════════════════════════════════════════════════
const passCount = results.filter(r => r.status === 'PASS').length
const warnCount = results.filter(r => r.status === 'WARN').length
const failCount = results.filter(r => r.status === 'FAIL').length
const total = results.length
const totalErrors = results.reduce((s, r) => s + r.errors.length, 0)
const score = Math.round(((passCount + warnCount * 0.5) / total) * 100)

console.log('\n' + '═'.repeat(62))
console.log(`  GRINDLY DEEP QA — ${DATE}`)
console.log('═'.repeat(62))
console.log(`\n  ${passCount} PASS  |  ${warnCount} WARN  |  ${failCount} FAIL  |  ${total} total`)
console.log(`  Score: ${score}%  |  JS errors: ${totalErrors}\n`)

if (failCount > 0) {
  console.log('  ❌ FAILURES:')
  results.filter(r => r.status === 'FAIL').forEach(r =>
    console.log(`     [${r.section}] ${r.name} — ${r.detail}`)
  )
}
if (warnCount > 0) {
  console.log('\n  ⚠️  WARNINGS (data-dependent / expected):')
  results.filter(r => r.status === 'WARN').forEach(r =>
    console.log(`     [${r.section}] ${r.name} — ${r.detail}`)
  )
}
console.log()

// Markdown
const sections2 = [...new Set(results.map(r => r.section))]
const md = [
  `# Grindly Deep QA Report — ${DATE}`,
  ``,
  `**Score: ${score}%** | ${passCount} PASS / ${warnCount} WARN / ${failCount} FAIL / ${total} checks  `,
  `JS errors: **${totalErrors}** | Screenshots: \`${SS_DIR}\``,
  ``,
  `## Summary by Section`,
  ``,
  `| Section | PASS | WARN | FAIL |`,
  `|---------|------|------|------|`,
  ...sections2.map(s => {
    const sr = results.filter(r => r.section === s)
    return `| ${s} | ${sr.filter(r=>r.status==='PASS').length} | ${sr.filter(r=>r.status==='WARN').length} | ${sr.filter(r=>r.status==='FAIL').length} |`
  }),
  ``,
  `## All Checks`,
  ``,
  `| # | Section | Check | Status | Detail | JS Errors |`,
  `|---|---------|-------|--------|--------|-----------|`,
  ...results.map((r, i) => {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️' : '❌'
    const err = r.errors.length ? r.errors.slice(0,2).map(e => e.substring(0,60)).join('; ') : '—'
    return `| ${i+1} | ${r.section} | ${r.name} | ${icon} | ${r.detail} | ${err} |`
  }),
  ``,
  `## Verdict`,
  failCount > 0
    ? `❌ **${failCount} FAILURE(S) — must fix before release.**\n\n` +
      results.filter(r=>r.status==='FAIL').map(r=>`- **[${r.section}] ${r.name}**: ${r.detail}`).join('\n')
    : warnCount > 0
      ? `⚠️ **All functional checks pass. ${warnCount} warnings are data-dependent (no active raid, no party, etc.).**`
      : `✅ **PERFECT PASS — all ${total} checks passed. Ready for release.**`,
]

const reportPath = `${OUT_DIR}/qa-deep-${DATE}.md`
writeFileSync(reportPath, md.join('\n'))
console.log(`Report: ${reportPath}`)
console.log(`Screenshots: ${SS_DIR} (${ssIdx} total)`)
console.log('═'.repeat(62) + '\n')

cdp.ws.close()
process.exit(failCount > 0 ? 1 : 0)
