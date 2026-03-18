/**
 * CDP screenshot tool using bun native WebSocket (bypasses Playwright entirely)
 * Usage: bun run scripts/cdp-screenshot.ts <url> <output.png> [width] [height]
 */
import * as fs from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';

const CHROME = 'C:\\Users\\fillo\\AppData\\Local\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
const CDP_PORT = 19555;

const [,, url, output, widthStr, heightStr] = process.argv;
if (!url || !output) {
  console.error('Usage: bun run scripts/cdp-screenshot.ts <url> <output.png> [width] [height]');
  process.exit(1);
}
const width = parseInt(widthStr ?? '1280');
const height = parseInt(heightStr ?? '900');

// Start Chrome
const chrome = childProcess.spawn(CHROME, [
  `--remote-debugging-port=${CDP_PORT}`,
  `--window-size=${width},${height}`,
  '--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
  '--headless', '--hide-scrollbars', '--mute-audio',
  '--user-data-dir=' + path.join(process.env.TEMP ?? '/tmp', 'cdp-chrome-' + Date.now()),
], { stdio: 'ignore', detached: false });

chrome.on('error', (e) => { console.error('Chrome error:', e); process.exit(1); });

// Wait for Chrome to be ready
await new Promise<void>((resolve, reject) => {
  const start = Date.now();
  const poll = setInterval(async () => {
    try {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (r.ok) { clearInterval(poll); resolve(); }
    } catch {}
    if (Date.now() - start > 10000) { clearInterval(poll); reject(new Error('Chrome start timeout')); }
  }, 200);
});

// Get WS URL
const versionInfo = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json() as any;
const wsUrl: string = versionInfo.webSocketDebuggerUrl;

// CDP client using bun native WebSocket
class CDP {
  private ws: WebSocket;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  private id = 1;
  ready: Promise<void>;

  constructor(wsUrl: string) {
    this.ws = new WebSocket(wsUrl);
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e: any) => reject(new Error('WS error: ' + e.message));
    });
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data as string);
      if (msg.id) {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          if (msg.error) p.reject(new Error(msg.error.message));
          else p.resolve(msg.result);
        }
      }
    };
  }

  send(method: string, params: any = {}): Promise<any> {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() { this.ws.close(); }
}

const cdp = new CDP(wsUrl);
await cdp.ready;

// Get or create a page target
const { targetInfos } = await cdp.send('Target.getTargets');
let targetId: string = targetInfos.find((t: any) => t.type === 'page')?.targetId;
if (!targetId) {
  const { targetId: newId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  targetId = newId;
}

// Attach to the target
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });

// Helper to send session commands
const session = (method: string, params: any = {}) =>
  cdp.send('Target.sendMessageToTarget', {
    sessionId,
    message: JSON.stringify({ id: cdp['id']++, method, params }),
  });

// Actually, use a separate WS for the target session
const targetWsUrl = `http://127.0.0.1:${CDP_PORT}/json/list`;
const targets = await (await fetch(targetWsUrl)).json() as any[];
const pageTarget = targets.find((t: any) => t.id === targetId);
const pageWs = pageTarget?.webSocketDebuggerUrl;

const pageCdp = new CDP(pageWs);
await pageCdp.ready;

// Enable necessary domains
await pageCdp.send('Page.enable');
await pageCdp.send('Network.enable');
await pageCdp.send('Emulation.setDeviceMetricsOverride', {
  width, height, deviceScaleFactor: 1, mobile: false,
});

// Navigate
console.error(`Navigating to ${url}...`);
await pageCdp.send('Page.navigate', { url });

// Wait for load + extra time for React render
await new Promise<void>((resolve) => {
  let resolved = false;
  const done = () => { if (!resolved) { resolved = true; resolve(); } };
  // Wait for network idle or 8s
  setTimeout(done, 8000);
  pageCdp['ws'].addEventListener('message', (e: any) => {
    const msg = JSON.parse(e.data);
    if (msg.method === 'Page.loadEventFired') {
      setTimeout(done, 2000); // 2s after load for React
    }
  });
});

// Screenshot
console.error('Taking screenshot...');
const { data } = await pageCdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });

const dir = path.dirname(output);
if (dir) fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(output, Buffer.from(data, 'base64'));
console.error(`Saved: ${output} (${fs.statSync(output).size} bytes)`);

pageCdp.close();
cdp.close();
chrome.kill();
process.exit(0);
