const { chromium } = require('playwright-extra');
const stealthPlugin = require('puppeteer-extra-plugin-stealth');

// Apply the stealth plugin
chromium.use(stealthPlugin());

// Configuration
const LOGIN_URL = 'https://richmondlp.com/login';
const ADMIN_URL = 'https://richmondlp.com/admin';
const USER = 'mramirez@richmondelt.com';
const PASS = 'Pass2026*';
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

// State
let browser;
let page;
let isSystemReady = false;
let lastActivityTime = Date.now();

// --- Request Queue Implementation ---
class RequestQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
    }

    async enqueue(fn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject });
            this.processNext();
        });
    }

    async processNext() {
        if (this.processing || this.queue.length === 0) return;

        this.processing = true;
        const { fn, resolve, reject } = this.queue.shift();

        try {
            const result = await fn();
            resolve(result);
        } catch (error) {
            reject(error);
        } finally {
            this.processing = false;
            this.processNext();
        }
    }
}

const browserQueue = new RequestQueue();

// --- Core Helper Functions ---

async function checkSessionTimeout() {
    const now = Date.now();
    if (browser && (now - lastActivityTime > SESSION_TIMEOUT_MS)) {
        console.log('⏱️ Session timed out. Restarting browser...');
        try { await browser.close(); } catch (e) { }
        browser = null;
        page = null;
        isSystemReady = false;
        initBrowser().catch(console.error);
        return true;
    }
    return false;
}

async function initBrowser(retryCount = 0) {
    const MAX_RETRIES = 3;
    if (isSystemReady && page && !page.isClosed()) return;

    isSystemReady = false;
    lastActivityTime = Date.now();

    try {
        console.log('🌐 Starting Chromium (Stealth)...');
        if (browser) try { await browser.close(); } catch (e) { }

        browser = await chromium.launch({
            headless: true, // Always headless in PROD
            args: [
                '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
                '--disable-gpu', '--disable-blink-features=AutomationControlled'
            ]
        });

        const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        page = await context.newPage();

        console.log('📡 Logging in to Richmond...');
        await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 60000 });

        // Login Flow
        await page.waitForSelector('#identifier', { timeout: 30000 });
        await page.type('#identifier', USER, { delay: 50 });
        await page.click('#password'); // Focus
        await page.type('#password', PASS, { delay: 50 });
        await page.click('button:has-text("Sign in")');

        await page.waitForLoadState('networkidle');

        if (page.url().includes('login') || page.url().includes('error')) {
            throw new Error('Login failed');
        }

        console.log('✅ Login successful. Validating Admin access...');
        await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded' });

        if (page.url().includes('login')) throw new Error('Admin session invalid');

        isSystemReady = true;
        lastActivityTime = Date.now();
        console.log('✅ System Ready for Tokens.');

    } catch (error) {
        console.error(`❌ Browser Init Failed (Attempt ${retryCount + 1}):`, error.message);
        if (browser) try { await browser.close(); } catch (e) { }
        browser = null;
        page = null;
        if (retryCount < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, 5000));
            return initBrowser(retryCount + 1);
        }
    }
}

// --- Masking Helpers ---
function maskName(name) {
    if (!name) return name;
    return name.split(' ').map(part => {
        if (part.length <= 4) return part[0] + '**' + part.slice(-1);
        return part.slice(0, 2) + '**' + part.slice(-2);
    }).join(' ');
}

function smartMaskCell(header, value) {
    if (!value) return value;
    const lower = header.toLowerCase();
    if (lower.includes('name') && !lower.includes('institution')) {
        return maskName(value);
    }
    return value;
}

// --- Main Token Check Logic ---

async function processAccessCodeCheck(accessCode) {
    await checkSessionTimeout();
    lastActivityTime = Date.now();

    if (!page || page.isClosed()) {
        await initBrowser();
        if (!page) throw new Error("Browser unavailable");
    }

    console.log(`🔍 Checking Token: ${accessCode}`);
    if (!page.url().includes('/admin')) {
        await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded' });
    }

    // Find input (Robust strategy)
    let input = await page.$('#token_input_token');
    if (!input || !(await input.isVisible())) {
        // Fallback: Force navigation to manage codes
        await page.goto(`${ADMIN_URL}#manage-access-codes`, { waitUntil: 'networkidle' });
        input = await page.$('#token_input_token');
    }

    if (!input) throw new Error("Input field not found");

    await input.fill('');
    await input.fill(accessCode);

    // Click Search - Try multiple selectors
    const btnParams = ['#check-token-button', 'a[href*="#check-token"]', 'button:has-text("Check")'];
    let btnClicked = false;
    for (const sel of btnParams) {
        if (await page.$(sel)) {
            await page.click(sel);
            btnClicked = true;
            break;
        }
    }
    if (!btnClicked) throw new Error("Search button not found");

    // Wait for results
    await page.waitForTimeout(2000);
    try { await page.waitForSelector('table tbody tr', { timeout: 5000 }); } catch (e) { }

    // Extract Logic
    const resultInfo = await page.evaluate(() => {
        const table = document.querySelector('#manage-access-codes table') || document.querySelector('table');
        if (!table) return { found: false };

        const rows = Array.from(table.querySelectorAll('tbody tr'))
            .filter(tr => tr.innerText.trim() && !tr.innerText.toLowerCase().includes('no result'));

        if (rows.length === 0) return { found: false };

        const headers = Array.from(table.querySelectorAll('th')).map(th => th.innerText.trim());
        const data = Array.from(rows[0].querySelectorAll('td')).map(td => td.innerText.trim());

        return { found: true, headers, data };
    });

    if (!resultInfo.found) {
        return { valid: false, message: 'Token not found or invalid' };
    }

    // Format Result
    const details = {};
    resultInfo.headers.forEach((h, i) => {
        details[h] = smartMaskCell(h, resultInfo.data[i]);
    });

    return { valid: true, details };
}

// --- Public API ---

async function checkToken(tokenCode) {
    return browserQueue.enqueue(() => processAccessCodeCheck(tokenCode));
}

// Initialize on load (async)
initBrowser().catch(console.error);

module.exports = { checkToken };
