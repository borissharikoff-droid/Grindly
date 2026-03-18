import { chromium } from 'playwright';
import * as fs from 'fs';

const LOG = '/c/idly/.gstack/pw-test.log';
const log = (msg: string) => {
  fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${msg}\n`);
  process.stderr.write(msg + '\n');
};

log('Starting playwright test');
log('Chromium executable: ' + chromium.executablePath());

try {
  log('Calling chromium.launch...');
  const browser = await chromium.launch({ 
    headless: true,
    timeout: 10000,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  log('Browser launched!');
  const page = await browser.newPage();
  log('Page created');
  await page.goto('about:blank');
  log('Navigated to about:blank');
  await browser.close();
  log('Done - success!');
} catch (e: any) {
  log('ERROR: ' + (e?.message?.substring(0, 1000) || String(e)));
}
process.exit(0);
