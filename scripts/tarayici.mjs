// Gerçek tarayıcı katmanı: Chrome'u başsız açar, Chrome DevTools Protokolü (CDP) ile sayfayı yükler,
// ağ isteklerini toplar, window değişkenlerini ve DOM seçicilerini sınar. Bağımlılık yok (Node 22 WebSocket).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tarayiciCerezBayraklari } from './guvenlik.mjs';

const CHROME_YOLLARI = [
  process.env.TECHLOOKUP_CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

function chromeAc(profil) {
  const yol = CHROME_YOLLARI.find((y) => existsSync(y));
  if (!yol) throw new Error('Chrome bulunamadı');
  const ch = spawn(yol, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profil}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--mute-audio',
    '--disable-background-networking', '--window-size=1366,900', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const port = new Promise((coz, red) => {
    let tampon = '';
    const zaman = setTimeout(() => red(new Error('Chrome açılmadı (15 sn)')), 15_000);
    ch.stderr.on('data', (d) => {
      tampon += d;
      const m = tampon.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//);
      if (m) { clearTimeout(zaman); coz(Number(m[1])); }
    });
    ch.on('exit', () => { clearTimeout(zaman); red(new Error('Chrome kapandı')); });
  });
  return { ch, port };
}

function cdp(wsAdres) {
  const ws = new WebSocket(wsAdres);
  let sira = 0;
  const bekleyen = new Map();
  const dinleyici = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && bekleyen.has(m.id)) {
      const { coz, red } = bekleyen.get(m.id);
      bekleyen.delete(m.id);
      m.error ? red(new Error(m.error.message)) : coz(m.result);
    } else if (m.method) for (const f of dinleyici) f(m);
  };
  const acik = new Promise((coz, red) => { ws.onopen = coz; ws.onerror = () => red(new Error('CDP bağlantısı yok')); });
  return {
    acik,
    gonder: (method, params = {}) => new Promise((coz, red) => {
      const id = ++sira;
      bekleyen.set(id, { coz, red });
      ws.send(JSON.stringify({ id, method, params }));
    }),
    dinle: (f) => dinleyici.push(f),
    kapat: () => { try { ws.close(); } catch {} },
  };
}

// Sayfa içinde koşar: istenen js yollarını ve dom seçicilerini sınar
function sayfaIfadesi(jsYollari, domKurallari) {
  return `(() => {
    const js = {}, dom = {};
    for (const yol of ${JSON.stringify(jsYollari)}) {
      try {
        let o = window;
        for (const p of yol.split('.')) { if (o == null) { o = undefined; break; } o = o[p]; }
        if (o !== undefined && o !== null) js[yol] = (typeof o === 'string' || typeof o === 'number') ? String(o) : '';
      } catch (e) {}
    }
    const kurallar = ${JSON.stringify(domKurallari)};
    for (const s in kurallar) {
      try {
        const el = document.querySelector(s);
        if (!el) continue;
        const k = kurallar[s] || {};
        const r = { exists: true };
        if (k.text) r.text = (el.textContent || '').slice(0, 300);
        if (k.attributes) { r.attributes = {}; for (const a in k.attributes) { const v = el.getAttribute(a); if (v !== null) r.attributes[a] = v; } }
        if (k.properties) { r.properties = {}; for (const p in k.properties) { try { const v = el[p]; if (v !== undefined && v !== null) r.properties[p] = (typeof v === 'string' || typeof v === 'number') ? String(v) : ''; } catch (e) {} } }
        dom[s] = r;
      } catch (e) {}
    }
    const scriptSrc = [...document.scripts].map(s => s.src).filter(Boolean);
    const scripts = [...document.scripts].filter(s => !s.src).map(s => s.textContent.slice(0, 20000));
    const meta = {};
    for (const m of document.querySelectorAll('meta')) {
      const ad = (m.getAttribute('name') || m.getAttribute('property') || m.getAttribute('http-equiv') || '').toLowerCase();
      if (ad && !(ad in meta)) meta[ad] = m.getAttribute('content') || '';
    }
    return { js, dom, scriptSrc, scripts, meta, html: document.documentElement.outerHTML.slice(0, 2000000), title: document.title, url: location.href };
  })()`;
}

/**
 * @returns {Promise<{durum: 'tamam'|string, veri?: object}>}
 */
export async function tarayiciTara(adres, { jsYollari, domKurallari, sure = 25_000 } = {}) {
  const profil = mkdtempSync(join(tmpdir(), 'techlookup-'));
  let ch, baglanti;
  try {
    const acilan = chromeAc(profil);
    ch = acilan.ch;
    const port = await acilan.port;
    let sayfa;
    for (let i = 0; i < 20 && !sayfa; i++) {
      const liste = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      sayfa = liste.find((x) => x.type === 'page');
      if (!sayfa) await bekle(150);
    }
    if (!sayfa) throw new Error('Chrome sekmesi açılmadı');
    baglanti = cdp(sayfa.webSocketDebuggerUrl);
    await baglanti.acik;

    const istekler = new Set();
    let yuklendi = false;
    let anaBelge = null;
    baglanti.dinle((m) => {
      if (m.method === 'Network.requestWillBeSent') istekler.add(m.params.request.url);
      if (m.method === 'Network.responseReceived' && m.params.type === 'Document' && !anaBelge) anaBelge = m.params.response;
      if (m.method === 'Page.loadEventFired') yuklendi = true;
    });
    await baglanti.gonder('Network.enable');
    await baglanti.gonder('Page.enable');
    await baglanti.gonder('Network.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      acceptLanguage: 'tr-TR,tr;q=0.9,en;q=0.8',
    });
    const git = await baglanti.gonder('Page.navigate', { url: adres });
    if (git.errorText) return { durum: `açılamadı (${git.errorText})` };

    const bitis = Date.now() + sure;
    while (!yuklendi && Date.now() < bitis) await bekle(200);
    await bekle(3_000); // GTM ve geciken pikseller için

    const { result, exceptionDetails } = await baglanti.gonder('Runtime.evaluate', {
      expression: sayfaIfadesi(jsYollari ?? [], domKurallari ?? {}),
      returnByValue: true,
      timeout: 15_000,
    });
    if (exceptionDetails) return { durum: 'sayfa betiği hata verdi' };
    const veri = result.value;

    const { cookies } = await baglanti.gonder('Network.getCookies', { urls: [veri.url] });
    veri.cookies = Object.fromEntries(cookies.map((c) => [c.name.toLowerCase(), c.value]));
    // çıktıya giden çerez kaydı yalnız ad + bayrak; değer yalnız parmak izi eşleşmesinde kalır
    veri.cerezBayraklari = tarayiciCerezBayraklari(cookies);
    veri.istekler = [...istekler];
    veri.headers = anaBelge ? Object.fromEntries(Object.entries(anaBelge.headers).map(([k, v]) => [k.toLowerCase(), v])) : {};
    veri.durumKodu = anaBelge?.status ?? null;
    if (/just a moment|attention required|checking your browser/i.test(veri.title)) {
      return { durum: 'bot duvarı (Cloudflare doğrulaması)', veri };
    }
    return { durum: 'tamam', veri };
  } catch (e) {
    return { durum: `ölçülemedi (${e.message})` };
  } finally {
    baglanti?.kapat();
    if (ch && ch.exitCode === null) {
      ch.kill('SIGTERM');
      await Promise.race([new Promise((r) => ch.once('exit', r)), bekle(3_000)]);
      if (ch.exitCode === null) ch.kill('SIGKILL');
    }
    for (let i = 0; i < 5; i++) {
      try { rmSync(profil, { recursive: true, force: true }); break; } catch { await bekle(300); }
    }
  }
}
