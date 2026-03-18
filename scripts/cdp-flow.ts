import * as fs from 'fs';
import * as childProcess from 'child_process';

const CHROME = 'C:\\Users\\fillo\\AppData\\Local\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
const CDP_PORT = 19777;
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
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ready = new Promise((res, rej) => { this.ws.onopen = () => res(); this.ws.onerror = (e: any) => rej(e); });
    this.ws.onmessage = (e) => {
      const m = JSON.parse(e.data as string);
      if (m.id) { const p = this.pending.get(m.id); if (p) { this.pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result); } }
    };
  }
  send(method: string, params: any = {}): Promise<any> {
    const id = this._id++;
    return new Promise((res, rej) => { this.pending.set(id, { resolve: res, reject: rej }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
}

const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json() as any[];
const c = new CDP(targets.find((t: any) => t.type === 'page').webSocketDebuggerUrl);
await c.ready;
await c.send('Page.enable');
await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const ev = async (code: string) => (await c.send('Runtime.evaluate', { expression: code, returnByValue: true })).result?.value;
const shot = async (name: string, ms = 1500) => {
  await wait(ms);
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT}/${name}`, Buffer.from(data, 'base64'));
  console.error('📸', name);
};
const fill = async (idx: number, val: string) => {
  await ev(`(()=>{const el=document.querySelectorAll('input')[${idx}];if(!el)return;el.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(val)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait(300);
};
const clickBtn = async (txt: string) => {
  await ev(`[...document.querySelectorAll('button')].find(el=>el.textContent?.includes(${JSON.stringify(txt)}))?.click()`);
  await wait(1000);
};
// Primary tabs via <nav> buttons: home(0), skills(1), friends(2), stats(3), more(4)
// Secondary tabs have text labels in the "..." popup menu
const navigate = async (tab: string) => {
  const PRIMARY_ORDER = ['home', 'skills', 'friends', 'stats'];
  if (PRIMARY_ORDER.includes(tab)) {
    const idx = PRIMARY_ORDER.indexOf(tab);
    await ev(`
      const nav = document.querySelector('nav');
      const btns = nav ? [...nav.querySelectorAll('button')] : [];
      if (btns[${idx}]) btns[${idx}].click();
    `);
  } else {
    // Open "..." menu first
    await ev(`document.querySelector('[aria-label="More"]')?.click()`);
    await wait(800);
    // Click by exact label text (Cook, Profile, Inventory, etc.)
    const LABELS: Record<string, string> = {
      cooking: 'cook', marketplace: 'market', inventory: 'inventory',
      farm: 'farm', arena: 'arena', craft: 'craft', profile: 'profile', settings: 'settings',
    };
    const label = LABELS[tab] ?? tab;
    await ev(`
      [...document.querySelectorAll('button')].find(b =>
        b.textContent?.trim().toLowerCase() === ${JSON.stringify(label)}
      )?.click()
    `);
  }
  await wait(1500);
};

// Navigate + login
console.error('Navigating...');
await c.send('Page.navigate', { url: 'http://localhost:5174' });
await wait(3000);
await ev(`[...document.querySelectorAll('a,button,span')].find(el=>el.textContent?.includes('Sign in'))?.click()`);
await wait(1500);
await fill(0, 'phil@mail.ru');
await fill(1, 'zxc123456');
await clickBtn('Sign in');
await wait(5000);

// Close What's New modal
console.error('Closing modals...');
await clickBtn("Let's go!");
await wait(1200);

// Dismiss all modals in a loop — achievements, alerts, etc.
console.error('Dismissing all modals...');
for (let i = 0; i < 15; i++) {
  await wait(600);
  const btns = await ev(`[...document.querySelectorAll('button')].map(b=>b.textContent?.trim()).filter(Boolean).join('|')`);
  console.error(`  Buttons: ${btns?.substring(0, 120)}`);
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await wait(300);
  const clicked = await ev(`
    const b = [...document.querySelectorAll('button')].find(b=>
      /^(CLAIM|Claim|Close|OK|Got it|Let.s go|Dismiss|Skip|Next|Continue|×|✕)$/i.test(b.textContent?.trim() ?? '')
      || b.getAttribute('aria-label')?.toLowerCase().includes('close')
    );
    if(b){b.click();true;}else{false;}
  `);
  if (!clicked) {
    const hasOverlay = await ev(`!!document.querySelector('[class*="modal"],[class*="overlay"],[class*="Modal"]')`);
    if (!hasOverlay) { console.error('  No more modals.'); break; }
  }
}
await wait(800);

// 1. Home
await shot('01_home.png');

// 2. Skills — scroll to show Production Skills (Cooking renamed from Chef)
await navigate('skills');
await shot('02_skills_activity.png');
// Scroll to Cooking skill — find element with "Cooking" text in skills section
await ev(`
  const cookingEl = [...document.querySelectorAll('*')].find(el =>
    el.children.length === 0 && el.textContent?.trim() === 'Cooking'
  );
  if (cookingEl) {
    cookingEl.scrollIntoView({ behavior: 'instant', block: 'center' });
  } else {
    // Fallback: scroll all overflow-auto containers
    document.querySelectorAll('*').forEach(el => {
      if (el.scrollHeight > el.clientHeight + 10) el.scrollTop = 99999;
    });
  }
`);
await shot('02_skills_production.png', 1000);

// 3. Stats
await navigate('stats');
await shot('03_stats.png');

// 4. Cooking page — shows onboarding modal with renamed "Cook" tab
await ev(`document.querySelector('[aria-label="More"]')?.click()`);
await wait(1000);
await ev(`[...document.querySelectorAll('button')].find(b => b.textContent?.trim().toLowerCase() === 'cook')?.click()`);
await wait(2000);
await shot('04_cooking.png');

// 5. Cooking - Cauldron tab (dismiss onboarding first)
await clickBtn('Got it!');
await wait(800);
await ev(`[...document.querySelectorAll('button')].find(el=>el.textContent?.includes('Cauldron'))?.click()`);
await wait(1500);
await shot('05_cauldron.png');

// 6. Profile
await navigate('profile');
await shot('06_profile.png');

// 7. Inventory
await navigate('inventory');
await shot('07_inventory.png');

console.error('\n✅ All screenshots saved to', OUT);
chrome.kill();
process.exit(0);
