/**
 * Jira Workflow Sync Script
 *
 * Syncs TP project workflow to match MYTUBE's 20 statuses.
 * Uses Playwright to:
 *   1. Open Jira board settings in a headed browser (login if needed)
 *   2. Intercept the "Add column" API request when you manually add ONE column
 *   3. Use that discovered API to add all remaining MYTUBE statuses automatically
 *
 * Usage:
 *   node scripts/jira-sync-workflow.js
 *   node scripts/jira-sync-workflow.js --use-saved-api   (reuse previously discovered API)
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const JIRA_BASE = 'https://dmtools.atlassian.net';
const TARGET_PROJECT = 'TP';
const SESSION_FILE = path.join(__dirname, '.jira-session.json');
const DISCOVERED_API_FILE = '/tmp/jira-discovered-api.json';

// The 15 MYTUBE statuses missing from TP workflow
const STATUSES_TO_ADD = [
  { name: 'Ready For Testing',     category: 'IN_PROGRESS' },
  { name: 'In Development',        category: 'IN_PROGRESS' },
  { name: 'In Testing',            category: 'IN_PROGRESS' },
  { name: 'In Review - Passed',    category: 'IN_PROGRESS' },
  { name: 'In Review - Failed',    category: 'IN_PROGRESS' },
  { name: 'Bug To Fix',            category: 'IN_PROGRESS' },
  { name: 'Solution Architecture', category: 'IN_PROGRESS' },
  { name: 'BA Analysis',           category: 'IN_PROGRESS' },
  { name: 'In Rework',             category: 'IN_PROGRESS' },
  { name: 'Passed',                category: 'DONE' },
  { name: 'PO Review',             category: 'IN_PROGRESS' },
  { name: 'Failed',                category: 'IN_PROGRESS' },
  { name: 'Refinement',            category: 'TODO' },
  { name: 'Re-run',                category: 'IN_PROGRESS' },
  { name: 'Merged',                category: 'DONE' },
];

async function waitForLogin(page) {
  console.log('\n⚠️  PLEASE LOG IN to Jira in the browser window that opened.');
  console.log('   After logging in, the script continues automatically.\n');
  // Poll URL instead of waitForFunction/waitForURL to survive cross-domain redirects
  for (let i = 0; i < 600; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    try {
      const url = page.url();
      if (url.includes('dmtools.atlassian.net') && !url.includes('id.atlassian') && !url.includes('/login')) {
        console.log('\n✅ Logged in! URL:', url);
        return;
      }
    } catch (_) {
      // page may be mid-redirect, keep waiting
    }
    if (i % 10 === 0) process.stdout.write('.');
  }
  throw new Error('Login timeout (10 minutes)');
}

async function discoverAddColumnApi(page) {
  const capturedRequests = [];

  page.on('request', request => {
    const method = request.method();
    if (['POST', 'PUT', 'PATCH'].includes(method) && request.url().includes('atlassian.net')) {
      capturedRequests.push({
        url: request.url(),
        method,
        headers: request.headers(),
        body: request.postData(),
      });
    }
  });

  const boardSettingsUrl = `${JIRA_BASE}/jira/software/projects/${TARGET_PROJECT}/settings/board`;
  console.log(`\n📋 Opening: ${boardSettingsUrl}`);
  await page.goto(boardSettingsUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const screenshotPath = '/tmp/jira-board-settings.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`📸 Screenshot saved: ${screenshotPath}`);

  // Show interactive elements to help identify "Add column"
  const elements = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button, [role="button"]'))
      .map(el => el.textContent?.trim())
      .filter(t => t && t.length < 60)
  );
  console.log('\n🔍 Buttons on page:', elements.slice(0, 20));

  console.log('\n' + '='.repeat(60));
  console.log('⚡ ACTION REQUIRED:');
  console.log('   In the browser:');
  console.log('   1. Click "Add column" (or "Add status")');
  console.log('   2. Type "DISCOVERY_TEST" as the name');
  console.log('   3. Save/confirm it');
  console.log('   The script will capture the API call and replicate it for all 15 statuses.');
  console.log('='.repeat(60) + '\n');
  console.log('Waiting for API call (120 seconds)...');

  const start = Date.now();
  while (Date.now() - start < 120000) {
    await page.waitForTimeout(1000);
    process.stdout.write('.');

    const relevant = capturedRequests.find(r => {
      const url = r.url.toLowerCase();
      const body = (r.body || '').toLowerCase();
      return (url.includes('status') || url.includes('column') || url.includes('workflow') ||
              body.includes('status') || body.includes('column') || body.includes('discovery'));
    });

    if (relevant) {
      console.log('\n\n✅ API endpoint discovered!');
      return relevant;
    }
  }

  console.log('\n\n⚠️  Timeout. Captured requests:');
  capturedRequests.forEach(r => {
    console.log(`  ${r.method} ${r.url}`);
    if (r.body) console.log(`    Body: ${r.body.substring(0, 200)}`);
  });
  return null;
}

async function addStatusViaApi(page, apiRequest, statusName) {
  let body = apiRequest.body;
  if (body) {
    try {
      const parsed = JSON.parse(body);
      // Replace name in common field patterns
      for (const field of ['name', 'title', 'columnName', 'statusName', 'label']) {
        if (field in parsed) parsed[field] = statusName;
      }
      if (parsed.column?.name) parsed.column.name = statusName;
      if (parsed.status?.name) parsed.status.name = statusName;
      body = JSON.stringify(parsed);
    } catch (_) {
      // Not JSON — try replacing "DISCOVERY_TEST" directly
      body = body.replace(/DISCOVERY_TEST/g, statusName.replace(/"/g, '\\"'));
    }
  }

  try {
    const response = await page.request.fetch(apiRequest.url, {
      method: apiRequest.method,
      headers: apiRequest.headers,
      data: body,
    });
    const respText = await response.text();
    if (response.ok()) {
      return { success: true };
    }
    return { success: false, status: response.status(), response: respText.substring(0, 300) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function main() {
  const useSavedApi = process.argv.includes('--use-saved-api');
  let savedApiRequest = null;

  if (useSavedApi && fs.existsSync(DISCOVERED_API_FILE)) {
    savedApiRequest = JSON.parse(fs.readFileSync(DISCOVERED_API_FILE, 'utf8'));
    console.log('📂 Using saved API from:', DISCOVERED_API_FILE);
  }

  // Load saved session
  let storageState = undefined;
  if (fs.existsSync(SESSION_FILE)) {
    console.log('📂 Loading saved browser session...');
    storageState = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  }

  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const context = await browser.newContext({
    storageState,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    // Navigate with more resilient approach (Jira login can trigger multiple redirects)
    await page.goto(`${JIRA_BASE}/jira`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await waitForLogin(page);

    // Save updated session
    const state = await context.storageState();
    fs.writeFileSync(SESSION_FILE, JSON.stringify(state, null, 2));
    console.log('💾 Session saved.');

    if (!savedApiRequest) {
      console.log('\n🔎 PHASE 1: Discovering the "Add column" API endpoint...');
      savedApiRequest = await discoverAddColumnApi(page);

      if (!savedApiRequest) {
        console.log('\n❌ Could not discover API endpoint.');
        console.log('   Check screenshot: /tmp/jira-board-settings.png');
        await browser.close();
        return;
      }

      fs.writeFileSync(DISCOVERED_API_FILE, JSON.stringify(savedApiRequest, null, 2));
      console.log(`💾 API details saved to: ${DISCOVERED_API_FILE}`);
      console.log('   (Next run can skip discovery with: --use-saved-api)\n');
    }

    console.log('\n🚀 PHASE 2: Adding all 15 MYTUBE statuses to TP workflow...');
    console.log(`   Endpoint: ${savedApiRequest.method} ${savedApiRequest.url}`);
    console.log(`   Template:  ${(savedApiRequest.body || '').substring(0, 150)}\n`);

    let added = 0, failed = 0;
    for (const status of STATUSES_TO_ADD) {
      const result = await addStatusViaApi(page, savedApiRequest, status.name);
      if (result.success) {
        console.log(`  ✅ ${status.name}`);
        added++;
      } else {
        console.log(`  ❌ ${status.name} → ${result.error || 'HTTP ' + result.status + ': ' + result.response}`);
        failed++;
      }
      await page.waitForTimeout(500);
    }

    console.log(`\n📊 Done: ${added} added, ${failed} failed`);

    // Final screenshot
    await page.goto(`${JIRA_BASE}/jira/software/projects/${TARGET_PROJECT}/settings/board`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(3000);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/jira-board-after-sync.png', fullPage: true });
    console.log('📸 Final state screenshot: /tmp/jira-board-after-sync.png');

    console.log('\n✅ Sync complete! Closing in 5 seconds...');
    await page.waitForTimeout(5000);

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
