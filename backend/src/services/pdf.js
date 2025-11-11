// backend/src/services/pdf.js
const puppeteer = require('puppeteer');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function resolveHeadless() {
  if (typeof process.env.PUPPETEER_HEADLESS !== 'undefined') {
    const v = String(process.env.PUPPETEER_HEADLESS).trim().toLowerCase();
    if (v === 'false') return false;
    if (v === 'new')   return 'new';
    return true;
  }
  return 'new';
}

function launchArgsByPlatform() {
  const base = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--font-render-hinting=medium',
    // Nota: evitar '--single-process' en algunos hosts puede ayudar
    // '--single-process',
    // '--no-zygote',
  ];
  return base;
}

async function createBrowser() {
  // 🔴 CLAVE: usar SIEMPRE el Chromium empacado por Puppeteer
  // Ignoramos binarios del sistema (chromium-browser via snap)
  const executablePath = puppeteer.executablePath(); // usa el que viene con puppeteer
  const headless = resolveHeadless();
  const args = launchArgsByPlatform();

  return puppeteer.launch({
    headless,
    args,
    executablePath, // forzado al empacado
  });
}

/**
 * Genera un PDF (ticket 80mm) desde HTML y devuelve Buffer.
 * Reintenta si el navegador se cierra durante printToPDF.
 */
async function htmlToPdfBuffer(html, pdfOptions = {}) {
  let browser;

  async function attempt(minimal = false) {
    browser = await createBrowser();
    try {
      const page = await browser.newPage();

      try { await page.setViewport({ width: 600, height: 800, deviceScaleFactor: 1 }); } catch {}

      await page.setContent(String(html || ''), {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      await sleep(minimal ? 80 : 150);

      try { await page.emulateMediaType('screen'); } catch {}

      const pdf = await page.pdf({
        printBackground: true,
        ...(minimal ? {} : { width: '80mm', margin: { top: '6mm', right: '6mm', bottom: '6mm', left: '6mm' } }),
        ...pdfOptions,
      });

      const buf = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
      if (!buf.length) throw new Error('PDF vacío');
      console.log(`[pdf] OK${minimal ? ' (reintento)' : ''}, bytes:`, buf.length);
      return buf;
    } finally {
      try { await browser.close(); } catch {}
    }
  }

  try {
    return await attempt(false);
  } catch (err) {
    const msg = String(err?.message || err);
    console.error('[pdf] ERROR generando PDF (intento 1):', msg);

    const isTargetClosed = /Target closed|Browser disconnected|Session closed|crash/i.test(msg);
    if (!isTargetClosed) throw err;

    try {
      console.warn('[pdf] Reintentando tras Target closed…');
      return await attempt(true);
    } catch (err2) {
      console.error('[pdf] Reintento falló:', err2?.message || err2);
      throw err2;
    }
  }
}

module.exports = { htmlToPdfBuffer };
