import { chromium } from 'playwright';
import * as fs from 'fs';
console.error('Launching with no-sandbox...');
try {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  console.error('Launched!');
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('http://localhost:5173', { timeout: 10000 });
  console.error('Title:', await page.title());
  const screenshot = await page.screenshot();
  fs.writeFileSync('/tmp/ss_test.png', screenshot);
  console.error('Screenshot saved!');
  await browser.close();
} catch (e: any) {
  console.error('Error:', e?.message?.substring(0, 500) || e);
}
process.exit(0);
