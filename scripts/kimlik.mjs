// Site kimliği: alan adı kaydı (TRABİS / RDAP / whois) · siteyi yapan ajans · şablonun arşivdeki başlangıcı.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guvenliMetin } from './ortak.mjs';

const VERI = join(dirname(dirname(fileURLToPath(import.meta.url))), 'veri');
const YEDI_GUN = 7 * 24 * 3600 * 1000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const komut = promisify(execFile);
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- alan adı ----------
const IKINCI_SEVIYE = /^(com|net|org|gov|edu|co|ac|gen|biz|info|bel|k12|av|dr|pol|tsk|web|tv|name|tel|ltd|plc|nhs|sch|gob|mil|or|ne|go)$/;

export function kayitliAlan(host) {
  const p = host.toLowerCase().replace(/\.$/, '').split('.');
  if (p.length >= 3 && p.at(-1).length === 2 && IKINCI_SEVIYE.test(p.at(-2))) return p.slice(-3).join('.');
  return p.slice(-2).join('.');
}

const GIZLI = /redact|privacy|private|gizli|hidden|withheld|not disclosed|data protected|statutory masking|non-public/i;
const AYLAR = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

function tarihCoz(s) {
  if (!s) return null;
  s = s.trim();
  let m = s.match(/^(\d{4})-([a-z]{3})-(\d{1,2})/i);
  if (m && AYLAR[m[2].toLowerCase()]) return `${m[1]}-${AYLAR[m[2].toLowerCase()]}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{4})[-./](\d{2})[-./](\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})[-./](\d{2})[-./](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

function sahipAyarla(ham) {
  const s = ham?.trim();
  if (!s) return { sahip: null, sahipGizli: false };
  return GIZLI.test(s) ? { sahip: null, sahipGizli: true } : { sahip: s, sahipGizli: false };
}

/** TRABİS (.tr) ve klasik whois metni. */
export function whoisCoz(metin) {
  const satirlar = metin.split(/\r?\n/);
  const r = { sahip: null, sahipGizli: false, kayit: null, bitis: null, kayitFirmasi: null };
  const i = satirlar.findIndex((l) => /^\*\*\s*Registrant:/i.test(l));
  if (i >= 0) Object.assign(r, sahipAyarla(satirlar.slice(i + 1).find((l) => l.trim())));
  const al = (re) => metin.match(re)?.[1]?.trim();
  if (i < 0) {
    const org = al(/^\s*Registrant(?: Organi[sz]ation| Name)?\s*:\s*(.+)$/im);
    if (org) Object.assign(r, sahipAyarla(org));
  }
  r.kayit = tarihCoz(al(/^\s*(?:Created on\.*|Creation Date|created|Registered on|Registration Time|Domain Registration Date)\s*:\s*(.+)$/im));
  r.bitis = tarihCoz(al(/^\s*(?:Expires on\.*|Registry Expiry Date|Expiration Date|Expiry Date|expires|paid-till|Registrar Registration Expiration Date)\s*:\s*(.+)$/im));
  const reg = metin.match(/\*\*\s*Registrar:[\s\S]*?Organization Name\s*:\s*(.+)/i)?.[1] ?? al(/^\s*Registrar\s*:\s*(.+)$/im);
  r.kayitFirmasi = reg?.trim() || null;
  return r;
}

function vcard(e, alan) {
  return e?.vcardArray?.[1]?.find((x) => x[0] === alan)?.[3] ?? null;
}

/** RDAP cevabı (kayıt kuruluşu veya kayıt firması). */
export function rdapCoz(j) {
  const olay = (ad) => j.events?.find((e) => e.eventAction === ad)?.eventDate?.slice(0, 10) ?? null;
  const rol = (ad) => (j.entities ?? []).find((e) => e.roles?.includes(ad));
  const kayitci = rol('registrar');
  const sahipVarligi = rol('registrant');
  const adlar = [vcard(sahipVarligi, 'org'), vcard(sahipVarligi, 'fn')].filter(Boolean);
  const acik = adlar.find((a) => !GIZLI.test(a));
  return {
    kayit: olay('registration'),
    bitis: olay('expiration'),
    kayitFirmasi: vcard(kayitci, 'fn') ?? vcard(kayitci, 'org'),
    sahip: acik ?? null,
    sahipGizli: !acik && Boolean(sahipVarligi),
  };
}

async function rdapSunucusu(tld) {
  const dosya = join(VERI, 'rdap-dns.json');
  let liste = null;
  if (existsSync(dosya) && Date.now() - statSync(dosya).mtimeMs < YEDI_GUN) liste = JSON.parse(readFileSync(dosya, 'utf8'));
  if (!liste) {
    try {
      const c = await fetch('https://data.iana.org/rdap/dns.json', { signal: AbortSignal.timeout(15_000) });
      liste = await c.json();
      mkdirSync(VERI, { recursive: true });
      writeFileSync(dosya, JSON.stringify(liste));
    } catch {
      if (existsSync(dosya)) liste = JSON.parse(readFileSync(dosya, 'utf8'));
    }
  }
  const hizmet = liste?.services?.find(([tldler]) => tldler.includes(tld));
  return hizmet?.[1]?.[0] ?? null;
}

async function rdapAl(adres) {
  for (let d = 0; ; d++) {
    const c = await fetch(adres, { headers: { accept: 'application/rdap+json' }, signal: AbortSignal.timeout(15_000) });
    if (c.ok) return c.json();
    if (c.status !== 429 || d >= 1) throw new Error(`RDAP HTTP ${c.status}`);
    await bekle(3000);
  }
}

export async function alanAdiSorgula(host) {
  const alan = kayitliAlan(host);
  const tld = alan.split('.').at(-1);
  try {
    if (tld === 'tr') {
      const { stdout } = await komut('whois', ['-h', 'whois.trabis.gov.tr', alan], { timeout: 20_000 });
      if (/No match found/i.test(stdout)) return { durum: 'ölçülemedi (TRABİS kaydı yok)', alan };
      return { durum: 'tamam', alan, kaynak: 'TRABİS kaydı', ...whoisCoz(stdout) };
    }
    const sunucu = await rdapSunucusu(tld);
    if (sunucu) {
      const j = await rdapAl(`${sunucu.replace(/\/?$/, '/')}domain/${alan}`);
      const r = rdapCoz(j);
      // kuruluş kaydı sahibi tutmaz (ör. .com) — kayıt firmasının RDAP'ına bir kez gidilir
      const ilgili = j.links?.find((l) => l.rel === 'related' && /rdap/.test(l.type ?? l.href))?.href;
      if (!r.sahip && !r.sahipGizli && ilgili) {
        try {
          const f = rdapCoz(await rdapAl(ilgili));
          Object.assign(r, { sahip: f.sahip, sahipGizli: f.sahipGizli, kayitFirmasi: r.kayitFirmasi ?? f.kayitFirmasi });
        } catch (e) {
          r.sahipOlcmedi = `kayıt firması cevap vermedi (${e.cause?.code ?? e.message.replace('RDAP ', '')})`;
        }
      }
      return { durum: 'tamam', alan, kaynak: 'RDAP kaydı', ...r };
    }
    const { stdout } = await komut('whois', [alan], { timeout: 20_000 });
    const r = whoisCoz(stdout);
    if (!r.kayit && !r.bitis) return { durum: 'ölçülemedi (whois cevabı çözülemedi)', alan };
    return { durum: 'tamam', alan, kaynak: 'whois kaydı', ...r };
  } catch (e) {
    return { durum: `ölçülemedi (${e.code === 'ENOENT' ? 'whois komutu yok' : e.killed ? 'zaman aşımı' : e.cause?.code ?? e.message})`, alan };
  }
}

// ---------- ajans ----------
const PLATFORM = /(^|\.)(wordpress\.(org|com)|wix\.com|shopify\.com|squarespace\.com|webflow\.(com|io)|blogger\.com|google\.[a-z.]+|github\.com|facebook\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com|youtube\.com|apple\.com|joomla\.org|drupal\.org|umbraco\.com|hubspot\.com|ikas\.com|ideasoft\.com\.tr|ticimax\.com|tsoft\.com\.tr|opencart\.com|prestashop\.com|turkiye\.gov\.tr|tiktok\.com|whatsapp\.com|t\.co|bit\.ly|goo\.gl|lnkd\.in|ow\.ly|buff\.ly|tinyurl\.com|fb\.me|wa\.me|youtu\.be|cutt\.ly|rebrand\.ly|shorturl\.at)$/i;
const ONCE = /(tasar[ıi]m|yaz[ıi]l[ıi]m|geli[şs]tirme|kodlama|design(?:ed)?|develop(?:ed|ment)?|website|web\s*site|made|built|created|crafted|powered|coded|produced|prodüksiyon|ajans|agency|site)\s*(?:by|ile)?\s*[:\-–—&|/]?\s*$/i;
const SONRA = /^\s*(?:taraf[ıi]ndan)\s+(?:tasarlan|geli[şs]tiril|yap[ıi]l|haz[ıi]rlan|kodlan|olu[şs]turul)/i;

const varlik = (s) => s.replace(/&amp;/g, '&').replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const duz = (h) => varlik(h.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ');
const nitelik = (a, ad) => a.match(new RegExp(`\\b${ad}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];
const temizAd = (s) => varlik(s ?? '').replace(/\s+/g, ' ').replace(/^[\s|·•-]+|[\s|·•-]+$/g, '').slice(0, 60) || null;

function hostAl(href) {
  try { return new URL(href).hostname.replace(/^www\./, ''); } catch { return null; }
}

const ANAHTAR = /tasar[ıi]m|yaz[ıi]l[ıi]m|ajans|agency|design|develop/i;
const IMZA = /(?:designed|developed|made|built|created|crafted|coded)\s+by\s*:?\s*|(?:web\s*)?(?:tasar[ıi]m|yaz[ıi]l[ıi]m)\s*:\s*/gi;
const AD = /^[A-ZÇĞİÖŞÜ0-9][\wÇĞİÖŞÜçğıöşü.&' -]{1,40}/;
const latin = (s) => s.toLocaleLowerCase('tr').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/[^a-z0-9]/g, '');

function imzaAra(metin) {
  for (const m of metin.matchAll(IMZA)) {
    const ad = metin.slice(m.index + m[0].length).match(AD)?.[0];
    const kisa = ad?.split(/\.\s+(?=[a-zçğıöşü])/)[0].replace(/\.$/, '');
    if (kisa) return { ad: temizAd(kisa), alinti: (m[0] + kisa).trim().slice(0, 60) };
  }
  return null;
}

/** Sayfa kodundan siteyi yapan ajansı çıkarır; imza yoksa null. */
export function ajansBul(html, siteHost) {
  const site = kayitliAlan(siteHost);
  const govde = html.replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ');
  const altSinir = Math.max(govde.search(/<footer\b/i), 0) || Math.floor(govde.length * 0.75);
  for (const m of govde.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const h = hostAl(nitelik(m[1], 'href') ?? '');
    if (!h || kayitliAlan(h) === site || PLATFORM.test(h)) continue;
    const ic = m[2];
    const yazi = temizAd(duz(ic).trim());
    // #webtasarım gibi etiketler (sosyal medya akışı) imza değildir
    const once = duz(govde.slice(Math.max(0, m.index - 300), m.index)).replace(/#[\p{L}\d_]+/gu, ' ').slice(-50);
    const sonra = duz(govde.slice(m.index + m[0].length, m.index + m[0].length + 200));
    // bağlantının kendi yazısı/başlığı "web tasarım …" diyorsa yalnız sayfanın alt kısmında imza sayılır
    const kendisi = m.index >= altSinir && ANAHTAR.test(`${yazi ?? ''} ${nitelik(m[1], 'title') ?? ''}`);
    if (!ONCE.test(once) && !SONRA.test(sonra) && !kendisi) continue;
    const ad = yazi ?? temizAd(nitelik(m[1], 'title')) ?? temizAd(nitelik(ic, 'alt')) ?? temizAd(nitelik(ic, 'title')) ?? h;
    return { ad, alan: h, kanit: kendisi && !ONCE.test(once) ? `alt bilgi bağlantısı: "${ad}" → ${h}` : `alt bilgi bağlantısı: "${once.trim().slice(-30)} → ${h}"` };
  }
  // sitenin kendi sayfalarına giden bağlantılar metinden çıkarılır: "Tasarım: <a href=/hakkimizda>Biz</a>" ajans değildir
  const disMetin = govde.replace(/<a\b([^>]*)>[\s\S]*?<\/a>/gi, (a, n) => {
    const h = hostAl(nitelik(n, 'href') ?? '');
    return !h || kayitliAlan(h) === site ? ' ' : a;
  });
  const alt = disMetin.match(/<footer\b[\s\S]*<\/footer>/i)?.[0];
  const yorumlar = [...html.matchAll(/<!--([\s\S]*?)-->/g)].map((x) => ['kod içi not', x[1].trim()]);
  for (const [kaynak, metin] of [['alt bilgi metni', alt ? duz(alt) : duz(disMetin).slice(-3000)], ...yorumlar]) {
    const b = imzaAra(metin);
    if (b) return { ad: b.ad, alan: null, kanit: `${kaynak}: "${b.alinti}"` };
  }
  // ajansların konsola bıraktığı imza: console.log('Delta Dijital Ajans:: Web Tasarım Ajansı')
  for (const m of html.matchAll(/console\.log\(\s*["'`]([^"'`]{3,120})["'`]/g)) {
    if (!ANAHTAR.test(m[1])) continue;
    const ad = temizAd(m[1].split(/\s*::?\s*|\s+[-–|]\s+/)[0]);
    if (ad) return { ad, alan: null, kanit: `kod içi konsol notu: "${m[1].slice(0, 60)}"` };
  }
  const sahip = latin(site.split('.')[0]);
  for (const ad of ['designer', 'author', 'web_author', 'created-by']) {
    const m = html.match(new RegExp(`<meta\\b[^>]*\\bname\\s*=\\s*["']${ad}["'][^>]*>`, 'i'));
    const deger = temizAd(m && nitelik(m[0], 'content'));
    if (!deger || (sahip.length >= 3 && latin(deger).includes(sahip))) continue;
    const icEkip = /bilgiislem|itdepartment|kurumsaliletisim/.test(latin(deger));
    return { ad: deger, alan: null, kanit: `meta ${ad} etiketi${icEkip ? ' — kurum içi ekip' : ' (site sahibi de olabilir)'}` };
  }
  return null;
}

// ---------- şablon izi ----------
/** İçerikten bağımsız iz: yüklenen stil/kod dosyaları + gövdedeki tasarım sınıfları. */
export function sablonIzi(html) {
  const varliklar = new Set();
  for (const m of html.matchAll(/<(?:link|script)\b[^>]*?\b(?:href|src)\s*=\s*["']?([^"'\s>]+)/gi)) {
    let u = m[1].toLowerCase();
    if (!/\.(css|js)(\?|#|$)/.test(u)) continue;
    u = u.replace(/^https?:\/\/web\.archive\.org\/web\/\d+[a-z_]*\//, '').replace(/[?#].*$/, '').replace(/^(https?:)?\/\/[^/]+/, '');
    // derleyicinin her yayında değiştirdiği dosya adları (Next.js chunk, Vite assets) şablon farkı değildir
    const i = u.lastIndexOf('/');
    let ad = u.slice(i + 1);
    if (/\/(_next|chunks|assets|build|dist|static\/(js|css))\//.test(u)) ad = ad.replace(/^.*?(\.(css|js))$/, '*$1');
    else ad = ad.split(/(?=[.\-_~])/).map((p) => (p.length >= 7 && /\d/.test(p) && /[a-z]/.test(p) ? p[0] + '#' : p)).join('');
    varliklar.add((u.slice(0, i + 1) + ad).replace(/[0-9a-f]{8,}/g, '#').replace(/\d+/g, '0'));
  }
  const siniflar = new Set();
  for (const m of html.replace(/^[\s\S]*?<body/i, '').matchAll(/\bclass\s*=\s*["']([^"']+)["']/gi))
    for (const s of m[1].split(/\s+/)) if (s && !/\d{3,}/.test(s)) siniflar.add(s.toLowerCase());
  return { varliklar, siniflar };
}

function jaccard(a, b) {
  if (!a.size && !b.size) return null;
  let k = 0;
  for (const x of a) if (b.has(x)) k++;
  return k / (a.size + b.size - k);
}

/** Ölçülen ayrım (2026-10-16, iki gerçek sitenin 15 yıllık arşivi): aynı şablon ≥ 0,86 · farklı ≤ 0,08. Eşik ortada. */
export function ayniSablon(a, b) {
  const p = [jaccard(a.varliklar, b.varliklar), jaccard(a.siniflar, b.siniflar)].filter((x) => x !== null);
  return p.length > 0 && p.reduce((x, y) => x + y, 0) / p.length >= 0.5;
}

/**
 * Arşiv kayıtları (eskiden yeniye) içinde şablonun canlıyla aynı olduğu ilk kaydı ikiye bölerek bulur.
 * Şablonun bir kez değişip geri dönmediği varsayılır. Açılamayan kayıt ölçüm sayılmaz.
 */
export async function sablonSinirBul(zamanlar, izGetir, canli, { sonTarih = Infinity, azamiHata = 3 } = {}) {
  const n = zamanlar.length;
  if (!n) return { durum: 'ölçülemedi (arşivde kayıt yok)' };
  let incelenen = 0;
  let hata = 0;
  const bozuk = new Set();
  const dene = async (i) => {
    if (Date.now() > sonTarih || hata >= azamiHata) return null;
    try {
      const iz = await izGetir(zamanlar[i]);
      hata = 0;
      // boş iz (bot doğrulama, yönlendirme sayfası) ölçüm değildir — "farklı şablon" sayılmaz
      if (!iz.varliklar.size && iz.siniflar.size < 5) { bozuk.add(i); return null; }
      incelenen++;
      return ayniSablon(iz, canli);
    } catch {
      hata++;
      bozuk.add(i);
      return null;
    }
  };
  const sonuc = (durum, lo, hi) => ({
    durum, ilkAyni: hi === null ? null : zamanlar[hi], sonFarkli: lo === -1 ? null : zamanlar[lo], ilkKayit: zamanlar[0], incelenen,
  });

  let son = n - 1;
  let sonda = null;
  for (; son >= Math.max(0, n - 4) && sonda === null; son--) sonda = await dene(son);
  son++;
  if (sonda === null) return { durum: 'ölçülemedi (arşiv kaydı açılamadı)', incelenen };
  if (sonda === false) return sonuc('tamam', son, null);
  let hi = son;
  let lo = -1;
  const ilk = hi > 0 ? await dene(0) : true;
  if (ilk === true) return sonuc('tamam', -1, 0);
  if (ilk === false) lo = 0;
  while (hi - lo > 1) {
    const orta = Math.floor((lo + hi) / 2);
    const adaylar = [];
    for (let d = 0; d < hi - lo; d++) for (const i of [orta - d, orta + d]) if (i > lo && i < hi && !bozuk.has(i) && !adaylar.includes(i)) adaylar.push(i);
    if (!adaylar.length || hata >= azamiHata || Date.now() > sonTarih) break;
    const i = adaylar[0];
    const r = await dene(i);
    if (r === true) hi = i;
    else if (r === false) lo = i;
  }
  return sonuc(hi - lo === 1 && lo >= 0 ? 'tamam' : 'kısmen', lo, hi);
}

async function arsivGetir(adres, deneme = 2) {
  for (let d = 0; ; d++) {
    try {
      const c = await fetch(adres, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20_000) });
      if (c.status === 429 || c.status >= 500) throw new Error(`HTTP ${c.status}`);
      if (!c.ok) throw new Error(`HTTP ${c.status}`);
      return await c.text();
    } catch (e) {
      if (d + 1 >= deneme) throw e;
      await bekle(2500);
    }
  }
}

/** archive.org'da bu şablonun ilk göründüğü ay. İstekler sırayla gider (paralel istek bağlantı reddi alıyor). */
export async function sablonTarihi(host, canliHtml, { sure = 75_000, getir = arsivGetir } = {}) {
  const sonTarih = Date.now() + sure;
  const adaylar = [host, host.startsWith('www.') ? host.slice(4) : `www.${host}`];
  let zamanlar = [];
  let arsivHost = host;
  try {
    for (const h of adaylar) {
      const cdx = await getir(`https://web.archive.org/cdx/search/cdx?url=${h}/&output=json&fl=timestamp&filter=statuscode:200&filter=mimetype:text/html&collapse=timestamp:6`);
      zamanlar = (cdx.trim() ? JSON.parse(cdx) : []).slice(1).map((r) => r[0]);
      if (zamanlar.length) { arsivHost = h; break; }
    }
  } catch (e) {
    return { durum: `ölçülemedi (archive.org: ${e.cause?.code ?? e.message})` };
  }
  const canli = sablonIzi(canliHtml);
  if (!canli.varliklar.size && canli.siniflar.size < 5) return { durum: 'ölçülemedi (canlı sayfada şablon izi yok)' };
  const kayit = (z) => `https://web.archive.org/web/${z}id_/https://${arsivHost}/`;
  const sayfalar = new Map();
  const r = await sablonSinirBul(zamanlar, async (z) => {
    const html = await getir(kayit(z));
    sayfalar.set(z, html);
    return sablonIzi(html);
  }, canli, { sonTarih });
  // önceki şablonun arşivdeki son kaydı zaten indirildi: imzası bugünkü siteyle aynı yöntemle okunur
  if (r.sonFarkli) {
    try {
      r.oncekiAjans = ajansBul(sayfalar.get(r.sonFarkli) ?? (await getir(kayit(r.sonFarkli))), arsivHost);
    } catch (e) {
      r.oncekiAjansOlcmedi = `arşiv kaydı açılamadı (${e.cause?.code ?? e.message})`;
    }
  }
  return { ...r, toplam: zamanlar.length };
}


// ---------- humans.txt ----------
const HUMANS_ETIKET = /^[ \t]*(designer|developer|agency|company|design|web design|tasar[ıi]m|yaz[ıi]l[ıi]m)[ \t]*:[ \t]*(.+)$/gim;

/** humans.txt'ten ajans adayı: Designer/Developer/Agency/Company satırı ya da imza. E-posta ve adres düşürülür. */
export function humansAjans(metin) {
  for (const m of metin.matchAll(HUMANS_ETIKET)) {
    const ad = temizAd(m[2].replace(/\S+@\S+/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/[()<>[\]]/g, ' '));
    if (ad && /\p{L}/u.test(ad)) return { ad: guvenliMetin(ad, 60), kanit: `humans.txt: ${m[1].trim()} satırı` };
  }
  const b = imzaAra(metin.replace(/\S+@\S+/g, ' '));
  return b ? { ad: guvenliMetin(b.ad, 60), kanit: `humans.txt: "${guvenliMetin(b.alinti, 60)}"` } : null;
}
