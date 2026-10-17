// Sitenin kökündeki standart dosyalar: robots.txt · sitemap.xml · security.txt · llms.txt · ads.txt · humans.txt.
// Gövdeler VERİDİR ve basılmaz: yalnız yapısal olgu (var/yok, sayı, tarih, alan var mı) yazılır.
import { satir, sinirliGetir, UA_TARAYICI, sureSiniri, sureMetni } from './ortak.mjs';
import { kayitliAlan, humansAjans } from './kimlik.mjs';

const METIN_TAVANI = 256 * 1024;
const HARITA_TAVANI = 5 * 1024 * 1024;

const htmlMi = (r) => /text\/html/i.test(r.tur ?? '') || /^\s*(<!doctype|<html|<head|<body)/i.test(r.govde ?? '');
const satirlar = (g) => g.split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
const boyut = (g) => (Buffer.byteLength(g) >= 1024 ? `${(Buffer.byteLength(g) / 1024).toFixed(1)} KB` : `${Buffer.byteLength(g)} bayt`);

// siteden gelen adres (Sitemap:, Location) yalnız http/https ve aynı kayıtlı alandaysa getirilir
function ayniSite(adres, site) {
  try { const u = new URL(adres); return /^https?:$/.test(u.protocol) && kayitliAlan(u.hostname) === site; } catch { return false; }
}

export async function ayniSiteGetir(adres, site, getir, bayt) {
  let u = adres;
  for (let i = 0; i < 4; i++) {
    const r = await getir(u, { bayt, yonlendirme: 'manual', ua: UA_TARAYICI });
    if (!r.kod || r.kod < 300 || r.kod >= 400) return r;
    const yer = r.basliklar?.get('location');
    if (!yer) return { durum: `HTTP ${r.kod} (Location yok)`, kod: null };
    const sonraki = new URL(yer, u).href;
    if (!ayniSite(sonraki, site)) return { durum: 'farklı alan', kod: null, disHost: new URL(sonraki).hostname };
    u = sonraki;
  }
  return { durum: 'ölçülemedi (çok fazla yönlendirme)', kod: null };
}

// HTTP 200 + dosyanın kendi biçimi → var · 404/410 ya da HTML sayfa → yok · 401/403/429/5xx, ağ hatası → ölçülemedi
function dosyaSatiri(r, yol, bicim, olgu) {
  if (r.durum === 'farklı alan') return satir('yok', `yönlendirme farklı alan adına gidiyor: ${r.disHost}`, yol);
  if (r.kod >= 200 && r.kod < 300) {
    if (r.kod !== 200 || htmlMi(r) || !bicim(r.govde)) return satir('yok', 'yok (adres dosya değil, sayfa döndürüyor)', `${yol} · HTTP ${r.kod}`);
    return olgu(r.govde, r);
  }
  if (r.kod === 404 || r.kod === 410) return satir('yok', 'yok', `${yol} · HTTP ${r.kod}`);
  return satir('olcmedi', `ölçülemedi — ${r.durum.replace(/^ölçülemedi \((.*)\)$/, '$1')}`, yol);
}

const DIREKTIF = /^(user-agent|disallow|allow|crawl-delay|host|noindex|sitemap)\s*:/i;

function robotsOlgusu(govde) {
  const s = satirlar(govde);
  const yonerge = s.filter((x) => DIREKTIF.test(x) && !/^sitemap\s*:/i.test(x)).length;
  const harita = s.filter((x) => /^sitemap\s*:/i.test(x)).length;
  // "User-agent: *" grubunda "Disallow: /" → tüm site arama motorlarına kapalı
  let grup = false;
  let kapali = false;
  for (const x of s) {
    if (/^user-agent\s*:/i.test(x)) grup = /:\s*\*\s*$/.test(x);
    else if (grup && /^disallow\s*:\s*\/\s*$/i.test(x)) kapali = true;
  }
  return satir('var', `${yonerge} yönerge · ${harita} Sitemap satırı${kapali ? ' · User-agent: * için tüm site kapalı (Disallow: /)' : ''}`, `/robots.txt · ${boyut(govde)}`);
}

function haritaOlgusu(govde, r, yol) {
  const dizin = /<sitemapindex[\s>]/i.test(govde);
  const n = (govde.match(dizin ? /<sitemap[\s>]/gi : /<url[\s>]/gi) ?? []).length;
  const tarihler = [...govde.matchAll(/<lastmod>\s*([^<\s]+)/gi)].map((m) => m[1].slice(0, 10)).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
  const en = tarihler.at(-1);
  const kesik = r.kesildi ? 'en az ' : '';
  const deger = dizin
    ? `site haritası dizini · ${kesik}${n} alt harita (açılmadı)`
    : `${kesik}${n} adres${en ? ` · en yeni değişiklik ${en}` : ''}`;
  return satir('var', `${deger}${r.kesildi ? " · 5 MB'ta kesildi" : ''}`, yol);
}

function securityOlgusu(govde, yol) {
  const s = satirlar(govde);
  const alan = (ad) => s.find((x) => new RegExp(`^${ad}\\s*:`, 'i').test(x));
  const bitisHam = alan('expires')?.split(/:\s*/).slice(1).join(':').trim();
  const bitis = bitisHam && !Number.isNaN(new Date(bitisHam).getTime()) ? new Date(bitisHam) : null;
  const expires = bitis ? `Expires ${bitis.toISOString().slice(0, 10)}${bitis < new Date() ? ' (süresi geçmiş)' : ''}` : 'Expires ✗';
  // Contact çoğunlukla e-posta adresidir: yalnız varlığı yazılır
  return satir('var', `Contact ${alan('contact') ? '✓' : '✗'} · ${expires} · Policy ${alan('policy') ? '✓' : '✗'}`, `${yol} · ${boyut(govde)}`);
}

function adsOlgusu(govde) {
  const kayit = satirlar(govde).filter((x) => x.split(',').length >= 3);
  const sistem = new Set(kayit.map((x) => x.split(',')[0].trim().toLowerCase()));
  return satir('var', `${kayit.length} satıcı satırı · ${sistem.size} reklam sistemi`, `/ads.txt · ${boyut(govde)}`);
}

/** origin: taranan sitenin kökü (https://www.ornek.com). getir: test için değiştirilebilir. */
export function siteDosyalari(origin, { getir = sinirliGetir, sure = 30_000 } = {}) {
  return sureSiniri(siteDosyalariIc(origin, getir), sure,
    () => Object.fromEntries(['robots', 'sitemap', 'securityTxt', 'llms', 'ads', 'humans'].map((k) => [k, satir('olcmedi', sureMetni(sure))])));
}

async function siteDosyalariIc(origin, getir) {
  const site = kayitliAlan(new URL(origin).hostname);
  const al = (yol, bayt = METIN_TAVANI) => ayniSiteGetir(new URL(yol, origin).href, site, getir, bayt);
  const bosDegil = (g) => g.trim().length > 0;

  const [robotsHam, secWk, llmsHam, adsHam, humansHam] = await Promise.all([
    al('/robots.txt'), al('/.well-known/security.txt'), al('/llms.txt'), al('/ads.txt'), al('/humans.txt'),
  ]);
  const robots = dosyaSatiri(robotsHam, '/robots.txt', (g) => satirlar(g).some((x) => DIREKTIF.test(x)), robotsOlgusu);

  // site haritası: robots.txt'teki aynı-site Sitemap satırı öncelikli, yoksa /sitemap.xml
  let sitemap;
  const robotsHaritalar = robots.durum === 'var'
    ? satirlar(robotsHam.govde).filter((x) => /^sitemap\s*:/i.test(x)).map((x) => { try { return new URL(x.replace(/^sitemap\s*:\s*/i, ''), origin).href; } catch { return null; } }).filter(Boolean)
    : [];
  const ayni = robotsHaritalar.filter((u) => ayniSite(u, site));
  if (robotsHaritalar.length && !ayni.length) {
    sitemap = satir('yok', `robots.txt'teki Sitemap farklı alan adına işaret ediyor: ${new URL(robotsHaritalar[0]).hostname}`, '/robots.txt');
  } else {
    const hedef = ayni[0] ?? new URL('/sitemap.xml', origin).href;
    const yol = `${new URL(hedef).pathname}${ayni.length ? ' (robots.txt Sitemap satırı)' : ''}`;
    if (/\.gz$/i.test(new URL(hedef).pathname)) sitemap = satir('olcmedi', 'ölçülemedi — sıkıştırılmış site haritası (.gz) okunmadı', yol);
    else {
      const r = await ayniSiteGetir(hedef, site, getir, HARITA_TAVANI);
      sitemap = dosyaSatiri(r, yol, (g) => /<urlset[\s>]|<sitemapindex[\s>]/i.test(g), (g) => haritaOlgusu(g, r, yol));
    }
  }

  // security.txt önce /.well-known/ altında, yoksa kökte
  const secBicim = (g) => satirlar(g).some((x) => /^contact\s*:/i.test(x));
  let securityTxt = dosyaSatiri(secWk, '/.well-known/security.txt', secBicim, (g) => securityOlgusu(g, '/.well-known/security.txt'));
  if (securityTxt.durum === 'yok') {
    const kok = await al('/security.txt');
    const ikinci = dosyaSatiri(kok, '/security.txt', secBicim, (g) => securityOlgusu(g, '/security.txt'));
    if (ikinci.durum !== 'yok') securityTxt = ikinci;
  }

  const llms = dosyaSatiri(llmsHam, '/llms.txt', bosDegil, (g) => satir('var', `${g.split(/\r?\n/).length} satır · ${boyut(g)}`, '/llms.txt'));
  const ads = dosyaSatiri(adsHam, '/ads.txt', (g) => satirlar(g).some((x) => x.split(',').length >= 3), adsOlgusu);
  const humans = dosyaSatiri(humansHam, '/humans.txt', bosDegil, (g) => {
    const ajans = humansAjans(g);
    return satir('var', `${g.split(/\r?\n/).length} satır${ajans ? ' · ajans adayı var (kimlik bölümünde)' : ''}`, `/humans.txt · ${boyut(g)}`, { ajans });
  });
  return { robots, sitemap, securityTxt, llms, ads, humans };
}
