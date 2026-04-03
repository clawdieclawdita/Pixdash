const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = '/home/pschivo/.openclaw/workspace-devo/pixdash';
  const screenshotDir = path.join(root, 'test-screenshots');
  fs.mkdirSync(screenshotDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1720, height: 1200 } });

  const consoleMessages = [];
  const pageErrors = [];
  const requestFailures = [];
  const responseErrors = [];
  const websockets = [];

  page.on('console', (msg) => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (err) => {
    pageErrors.push(String(err));
  });
  page.on('requestfailed', (req) => {
    requestFailures.push({ url: req.url(), failure: req.failure()?.errorText || 'unknown' });
  });
  page.on('response', (res) => {
    if (res.status() >= 400) {
      responseErrors.push({ url: res.url(), status: res.status() });
    }
  });
  page.on('websocket', (ws) => {
    const entry = { url: ws.url(), framesSent: 0, framesReceived: 0, closed: false, errors: [] };
    websockets.push(entry);
    ws.on('framesent', () => entry.framesSent++);
    ws.on('framereceived', () => entry.framesReceived++);
    ws.on('close', () => { entry.closed = true; });
    ws.on('socketerror', (err) => { entry.errors.push(String(err)); });
  });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);

  const rosterButtons = page.getByRole('button');
  const rosterTexts = await rosterButtons.evaluateAll((els) => els.map((el) => el.textContent?.trim()).filter(Boolean));

  await page.screenshot({ path: path.join(screenshotDir, 'v4-01-homepage.png'), fullPage: true });

  const canvas = page.locator('canvas').first();
  await canvas.screenshot({ path: path.join(screenshotDir, 'v4-02-canvas-sprites.png') });

  const canvasMetrics = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
    const sample = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonBg = 0;
    const colors = new Set();
    for (let i = 0; i < sample.length; i += 4) {
      const a = sample[i + 3];
      if (a === 0) continue;
      const r = sample[i], g = sample[i + 1], b = sample[i + 2];
      if (!(r < 40 && g < 40 && b < 40)) {
        nonBg++;
        colors.add(`${r},${g},${b}`);
      }
    }
    return {
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      nonBgPixels: nonBg,
      uniqueColors: colors.size,
      cameraText: Array.from(document.querySelectorAll('div')).map((el) => el.textContent || '').find((t) => t.includes('Zoom') && t.includes('Pan')) || null,
    };
  });

  const agentsRes = await page.request.get('http://localhost:3000/api/v1/agents');
  const agentsJson = await agentsRes.json();
  const agents = agentsJson.agents || [];

  const targetAgent = agents.find((a) => a.id === 'devo') || agents[0] || null;
  let clickResult = null;

  if (targetAgent && canvasMetrics?.rect) {
    const cam = { x: 88, y: 84, zoom: 1.6 };
    const worldX = targetAgent.position.x * 32 + 16;
    const worldY = targetAgent.position.y * 32 + 14;
    const screenX = canvasMetrics.rect.x + cam.x + worldX * cam.zoom;
    const screenY = canvasMetrics.rect.y + cam.y + worldY * cam.zoom;
    await page.mouse.click(screenX, screenY);
    await page.waitForTimeout(1500);
    const panelTitle = (await page.locator('h2').first().textContent())?.trim() || null;
    const panelBody = await page.locator('main').textContent();
    clickResult = { targetAgentId: targetAgent.id, targetAgentName: targetAgent.name, screenX, screenY, panelTitle, panelShowsAgent: !!panelBody && panelBody.includes(targetAgent.name) };
  }

  await page.screenshot({ path: path.join(screenshotDir, 'v4-03-agent-click.png'), fullPage: true });

  const tabNames = ['status', 'config', 'logs', 'tasks'];
  const tabResults = [];
  for (const tab of tabNames) {
    const btn = page.getByRole('button', { name: new RegExp(`^${tab}$`, 'i') });
    if (await btn.count()) {
      await btn.click();
      await page.waitForTimeout(500);
      tabResults.push({ tab, present: true });
    } else {
      tabResults.push({ tab, present: false });
    }
  }

  await page.screenshot({ path: path.join(screenshotDir, 'v4-04-panels.png'), fullPage: true });

  const bodyText = await page.locator('body').textContent();
  const demoNames = ['Orion', 'Luma', 'Vanta'];
  const demoHits = demoNames.filter((name) => (bodyText || '').includes(name) || JSON.stringify(agentsJson).includes(name));

  const results = {
    rosterTexts,
    agents,
    canvasMetrics,
    clickResult,
    tabResults,
    consoleMessages,
    pageErrors,
    requestFailures,
    responseErrors,
    websockets,
    demoHits,
  };

  fs.writeFileSync(path.join(root, 'test-screenshots', 'live-qa-v4-results.json'), JSON.stringify(results, null, 2));
  await browser.close();
})();
