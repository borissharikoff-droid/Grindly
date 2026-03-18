/**
 * Full QA flow for v3.9.0 branch — covers all changed pages
 * bun run scripts/cdp-qa-v390.ts
 */
import * as fs from 'fs';
import * as childProcess from 'child_process';

const CHROME = 'C:\\Users\\fillo\\AppData\\Local\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
const CDP_PORT = 19789;
const OUT = 'C:/idly/.gstack/qa-reports/screenshots';
fs.mkdirSync(OUT, { recursive: true });

const chrome = childProcess.spawn(CHROME, [
  `--remote-debugging-port=${CDP_PORT}`,
  '--window-size=1280,900', '--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
  '--headless', '--hide-scrollbars', '--mute-audio',
  '--user-data-dir=C:/Users/fillo/AppData/Local/Temp/cdp-ss3',
], { stdio: 'ignore' });

await new Promise<void>((resolve, reject) => {
  const start = Date.now();
  const poll = setInterval(async () => {
    try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); if (r.ok) { clearInterval(poll); resolve(); } } catch {}
    if (Date.now() - start > 12000) { clearInterval(poll); reject(new Error('Chrome timeout')); }
  }, 300);
});

class CDP {
  ws: WebSocket; _id = 1; pending = new Map<number, any>(); ready: Promise<void>;
  _logs: string[] = [];
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ready = new Promise((res, rej) => { this.ws.onopen = () => res(); this.ws.onerror = (e: any) => rej(e); });
    this.ws.onmessage = (e) => {
      const m = JSON.parse(e.data as string);
      if (m.id) { const p = this.pending.get(m.id); if (p) { this.pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result); } }
      // capture console
      if (m.method === 'Runtime.consoleAPICalled' && (m.params?.type === 'error' || m.params?.type === 'warn')) {
        const txt = m.params.args?.map((a: any) => a.value ?? a.description ?? '').join(' ');
        this._logs.push(`[${m.params.type}] ${txt}`);
      }
      if (m.method === 'Runtime.exceptionThrown') {
        this._logs.push(`[exception] ${m.params?.exceptionDetails?.text ?? JSON.stringify(m.params)}`);
      }
    };
  }
  send(method: string, params: any = {}): Promise<any> {
    const id = this._id++;
    return new Promise((res, rej) => { this.pending.set(id, { resolve: res, reject: rej }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  flushLogs(): string[] { const l = [...this._logs]; this._logs = []; return l; }
}

const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json() as any[];
const c = new CDP(targets.find((t: any) => t.type === 'page').webSocketDebuggerUrl);
await c.ready;
await c.send('Runtime.enable');
await c.send('Page.enable');
await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const ev = async (code: string) => {
  try { return (await c.send('Runtime.evaluate', { expression: code, returnByValue: true, awaitPromise: true })).result?.value; }
  catch (e) { return null; }
};

const issues: { page: string; sev: string; msg: string }[] = [];
const log = (page: string, sev: string, msg: string) => {
  issues.push({ page, sev, msg });
  console.error(`  [${sev}] ${page}: ${msg}`);
};

const shot = async (name: string, page: string, ms = 1800) => {
  await wait(ms);
  const errors = c.flushLogs().filter(l => !l.includes('[vite]') && !l.includes('DevTools') && !l.includes('ReactDevTools'));
  if (errors.length) errors.forEach(e => log(page, 'CONSOLE', e));
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT}/${name}`, Buffer.from(data, 'base64'));
  console.error('📸', name, errors.length ? `(${errors.length} console errors)` : '✓');
};

const clickBtn = async (txt: string) => {
  await ev(`[...document.querySelectorAll('button')].find(el=>el.textContent?.includes(${JSON.stringify(txt)}))?.click()`);
  await wait(800);
};

const navigate = async (tab: string) => {
  const PRIMARY_ORDER = ['home', 'skills', 'friends', 'stats'];
  if (PRIMARY_ORDER.includes(tab)) {
    const idx = PRIMARY_ORDER.indexOf(tab);
    await ev(`const nav=document.querySelector('nav');const btns=nav?[...nav.querySelectorAll('button')]:[];if(btns[${idx}])btns[${idx}].click();`);
  } else {
    await ev(`document.querySelector('[aria-label="More"]')?.click()`);
    await wait(700);
    const LABELS: Record<string, string[]> = {
      cooking: ['cook'], marketplace: ['market', 'marketplace'],
      inventory: ['inventory'], farm: ['farm'], arena: ['arena', 'dungeon'],
      craft: ['craft'], profile: ['profile'], settings: ['settings'],
    };
    const labels = LABELS[tab] ?? [tab];
    await ev(`[...document.querySelectorAll('button')].find(b=>{const t=b.textContent?.trim().toLowerCase()??'';return ${JSON.stringify(labels)}.some(l=>t===l||t.includes(l));})?.click()`);
  }
  await wait(1200);
};

const checkEmpty = async (page: string) => {
  const txt = await ev(`document.body.innerText`);
  if (!txt || txt.trim().length < 20) log(page, 'HIGH', 'Page appears empty or blank');
};

const checkBroken = async (page: string) => {
  const broken = await ev(`[...document.querySelectorAll('img')].filter(i=>i.naturalWidth===0&&i.complete).map(i=>i.src).join(',')`);
  if (broken) log(page, 'MEDIUM', `Broken images: ${broken}`);
};

// ─── NAVIGATE TO APP ────────────────────────────────────────────────────────
console.error('\n🔍 Loading app...');
await c.send('Page.navigate', { url: 'http://localhost:5173' });
await wait(3500);
c.flushLogs(); // clear startup noise

// Dismiss What's New modal
const hasWhatsNew = await ev(`!!document.querySelector('[class*="modal"],[class*="Modal"]')`);
if (hasWhatsNew) {
  await clickBtn("Let's go!");
  await wait(500);
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await wait(600);
}

// ─── 1. HOME ────────────────────────────────────────────────────────────────
console.error('\n📄 HOME');
await checkEmpty('Home');
await checkBroken('Home');
// Check ProfileBar rendered
const hasProfileBar = await ev(`!!document.querySelector('[class*="profile"],[class*="Profile"]') || document.body.innerText.includes('Level')`);
if (!hasProfileBar) log('Home', 'HIGH', 'ProfileBar missing — no "Level" text found');
await shot('qa-1-home.png', 'Home');

// ─── 2. SKILLS ─────────────────────────────────────────────────────────────
console.error('\n📄 SKILLS');
await navigate('skills');
await checkEmpty('Skills');
const skillsText = await ev(`document.body.innerText`);
if (!skillsText?.includes('Developer') && !skillsText?.includes('XP')) log('Skills', 'HIGH', 'Skills page missing skill names');
await shot('qa-2-skills.png', 'Skills');

// ─── 3. FRIENDS (FriendList + GuildTab) ─────────────────────────────────────
console.error('\n📄 FRIENDS');
await navigate('friends');
await checkEmpty('Friends');
const hasGuildTab = await ev(`document.body.innerText.includes('Guild')`);
if (!hasGuildTab) log('Friends', 'HIGH', 'Guild tab missing from Friends page');
await shot('qa-3-friends.png', 'Friends');

// Click Guild tab
await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Guild')?.click()`);
await wait(1200);
await shot('qa-3b-guild.png', 'Friends/Guild');
const guildText = await ev(`document.body.innerText`);
if (!guildText?.includes('Guild') && !guildText?.includes('Create') && !guildText?.includes('Join')) {
  log('Friends/Guild', 'HIGH', 'Guild tab content missing');
}

// ─── 4. STATS ───────────────────────────────────────────────────────────────
console.error('\n📄 STATS');
await navigate('stats');
await checkEmpty('Stats');
await shot('qa-4-stats.png', 'Stats');

// ─── 5. ARENA / DUNGEONS ────────────────────────────────────────────────────
console.error('\n📄 ARENA');
await navigate('arena');
await checkEmpty('Arena');
const hasDungeon = await ev(`document.body.innerText.toLowerCase().includes('dungeon') || document.body.innerText.toLowerCase().includes('zone')`);
if (!hasDungeon) log('Arena', 'HIGH', 'Dungeon content missing');
await shot('qa-5-arena.png', 'Arena');

// Check Raids tab
await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Raids')?.click()`);
await wait(1200);
const hasRaids = await ev(`document.body.innerText.toLowerCase().includes('raid') || document.body.innerText.toLowerCase().includes('boss')`);
if (!hasRaids) log('Arena/Raids', 'HIGH', 'Raids tab content missing');
await shot('qa-5b-raids.png', 'Arena/Raids');

// ─── 6. INVENTORY ───────────────────────────────────────────────────────────
console.error('\n📄 INVENTORY');
await navigate('inventory');
await checkEmpty('Inventory');
await shot('qa-6-inventory.png', 'Inventory');

// ─── 7. MARKETPLACE ─────────────────────────────────────────────────────────
console.error('\n📄 MARKETPLACE');
await navigate('marketplace');
await wait(2000); // lazy loaded
await checkEmpty('Marketplace');
await shot('qa-7-marketplace.png', 'Marketplace');

// ─── 8. COOKING ─────────────────────────────────────────────────────────────
console.error('\n📄 COOKING');
await navigate('cooking');
await wait(2000);
await checkEmpty('Cooking');
await shot('qa-8-cooking.png', 'Cooking');

// ─── 9. CRAFT ───────────────────────────────────────────────────────────────
console.error('\n📄 CRAFT');
await navigate('craft');
await wait(1500);
await checkEmpty('Craft');
await shot('qa-9-craft.png', 'Craft');

// ─── 10. FARM ───────────────────────────────────────────────────────────────
console.error('\n📄 FARM');
await navigate('farm');
await wait(1500);
await checkEmpty('Farm');
await shot('qa-10-farm.png', 'Farm');

// ─── 11. PROFILE ────────────────────────────────────────────────────────────
console.error('\n📄 PROFILE');
await navigate('profile');
await wait(1500);
await checkEmpty('Profile');
await shot('qa-11-profile.png', 'Profile');

// ─── 12. NOTIFICATIONS ──────────────────────────────────────────────────────
console.error('\n📄 NOTIFICATIONS PANEL');
await navigate('home');
await wait(800);
// Try to open notifications
await ev(`[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.toLowerCase().includes('notif')||b.title?.toLowerCase().includes('notif'))?.click()`);
await wait(1000);
await shot('qa-12-notifications.png', 'Notifications');
await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });

// ─── 13. BOTTOM NAV ─────────────────────────────────────────────────────────
console.error('\n📄 BOTTOM NAV');
await navigate('home');
await shot('qa-13-home-nav.png', 'BottomNav');

// Check nav has labels
const navText = await ev(`document.querySelector('nav')?.innerText ?? ''`);
if (!navText?.includes('Home') && !navText?.includes('Skills')) {
  log('BottomNav', 'MEDIUM', 'Nav labels missing — may be icon-only');
}

// ─── 14. MORE MENU ──────────────────────────────────────────────────────────
console.error('\n📄 MORE MENU');
await ev(`document.querySelector('[aria-label="More"]')?.click()`);
await wait(800);
await shot('qa-14-more-menu.png', 'MoreMenu');
const moreText = await ev(`document.body.innerText`);
const expectedItems = ['Cook', 'Farm', 'Craft', 'Arena', 'Market', 'Profile', 'Settings'];
const missing = expectedItems.filter(item => !moreText?.toLowerCase().includes(item.toLowerCase()));
if (missing.length) log('MoreMenu', 'HIGH', `Missing menu items: ${missing.join(', ')}`);
await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });

// ─── SUMMARY ────────────────────────────────────────────────────────────────
console.error('\n' + '─'.repeat(60));
console.error(`📊 QA SUMMARY — ${issues.length} issues found`);
const bySev: Record<string, number> = {};
issues.forEach(i => { bySev[i.sev] = (bySev[i.sev] ?? 0) + 1; });
console.error(`   CRITICAL: ${bySev['CRITICAL'] ?? 0}  HIGH: ${bySev['HIGH'] ?? 0}  MEDIUM: ${bySev['MEDIUM'] ?? 0}  CONSOLE: ${bySev['CONSOLE'] ?? 0}`);
if (issues.length) {
  console.error('\nIssues:');
  issues.forEach((i, n) => console.error(`  ${n + 1}. [${i.sev}] ${i.page} — ${i.msg}`));
}
console.error('\n✅ Screenshots saved to', OUT);

// Write JSON report
fs.writeFileSync(`${OUT}/../qa-v390-issues.json`, JSON.stringify({ date: new Date().toISOString(), issues }, null, 2));

chrome.kill();
process.exit(0);
