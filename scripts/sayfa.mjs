// Sayfa kodundan ve tarayıcı isteklerinden çıkan ek olgular — ek istek atılmaz.
// WordPress teması/eklentileri · üçüncü taraf (dış) alan adları · paylaşım etiketleri.
import { kayitliAlan } from './kimlik.mjs';
import { satir, guvenliMetin } from './ortak.mjs';
import { dislanirMi, alanDislanirMi } from './kategoriler.mjs';

// kapsam dışı eklenti: ödeme · ısı haritası/oturum kaydı · yazı tipi · harita · video (slug sözcüğüyle)
const DISLANAN_SOZCUK = new Set([
  'iyzico', 'iyzipay', 'paytr', 'stripe', 'paypal', 'payment', 'payments', 'gateway', 'odeme', 'pos',
  'hotjar', 'clarity', 'heatmap', 'heatmaps', 'fullstory', 'mouseflow', 'smartlook', 'crazyegg', 'luckyorange', 'inspectlet',
  'font', 'fonts', 'map', 'maps', 'gmaps', 'youtube', 'vimeo', 'video', 'videos', 'player', 'jwplayer', 'brightcove', 'wistia',
]);
const eklentiDislanirMi = (slug) => slug.toLowerCase().split(/[-_.]+/).some((s) => DISLANAN_SOZCUK.has(s));

const WP_YOL = /\/wp-content\/(themes|plugins)\/([a-z0-9][a-z0-9_.-]{0,60})\//gi;

export function wordpressIzleri({ html = '', istekler = [], scriptSrc = [] } = {}) {
  let tema = null;
  const eklentiler = [];
  for (const kaynak of [html, ...istekler, ...scriptSrc]) {
    for (const [, tur, slug] of String(kaynak ?? '').matchAll(WP_YOL)) {
      const ad = slug.toLowerCase();
      if (tur.toLowerCase() === 'themes') tema ??= ad;
      else if (!eklentiDislanirMi(ad) && !eklentiler.includes(ad)) eklentiler.push(ad);
    }
  }
  return { tema, eklentiler };
}

const AZAMI = 40;

// yalnız üçüncü taraf kayıtlı alan adları; sorgu dizesi/yol hiç tutulmaz.
// teknolojiBul(url) → [{ad, kategoriler}]: kapsam dışı teknolojiye düşen istek, o host'un tamamını dışlar.
export function disAlanAdlari({ istekler = [], scriptSrc = [], siteHost, teknolojiBul = () => [] } = {}) {
  const site = kayitliAlan(siteHost);
  const hostAdresleri = new Map();
  for (const adres of [...istekler, ...scriptSrc]) {
    let u;
    try { u = new URL(adres); } catch { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    const h = u.hostname.toLowerCase();
    if (kayitliAlan(h) === site || alanDislanirMi(h)) continue;
    (hostAdresleri.get(h) ?? hostAdresleri.set(h, []).get(h)).push(adres);
  }
  const alanlar = new Set();
  for (const [h, adresler] of hostAdresleri) {
    const dislanan = adresler.some((a) => teknolojiBul(a).some((t) => dislanirMi(t.ad, t.kategoriler ?? [])));
    if (!dislanan) alanlar.add(kayitliAlan(h));
  }
  const liste = [...alanlar].sort();
  const fazla = liste.length - AZAMI;
  const ad = liste.slice(0, AZAMI).join(', ') + (fazla > 0 ? ` +${fazla} daha` : '');
  return { liste, ad };
}

// ---------- paylaşım etiketleri: Open Graph · Twitter Card · JSON-LD · hreflang · manifest ----------
// Site metni VERİDİR: yalnız kısa değer (başlık, tür adı, dil kodu) süzgeçten geçerek yazılır; içerik getirilmez.
const nitelik = (etiket, ad) => etiket.match(new RegExp(`\\b${ad}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];

function jsonLdTurleri(html) {
  const turler = [];
  let bozuk = 0;
  let blok = 0;
  const topla = (x) => {
    if (Array.isArray(x)) return x.forEach(topla);
    if (!x || typeof x !== 'object') return;
    for (const t of [].concat(x['@type'] ?? [])) {
      const ad = guvenliMetin(String(t), 40);
      if (ad && !turler.includes(ad)) turler.push(ad);
    }
    if (x['@graph']) topla(x['@graph']);
  };
  for (const m of String(html).matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    blok++;
    try { topla(JSON.parse(m[1])); } catch { bozuk++; }
  }
  return { turler, bozuk, blok };
}

export function paylasimEtiketleri({ html = '', meta = {} } = {}) {
  const anahtar = (on) => Object.keys(meta).filter((k) => k.startsWith(on));
  const og = anahtar('og:');
  const openGraph = og.length
    ? satir('var', [`${og.length} etiket`, meta['og:title'] ? `başlık “${guvenliMetin(meta['og:title'], 60)}”` : 'başlık yok', `görsel ${meta['og:image'] ? '✓' : '✗'}`].join(' · '), 'meta property="og:*"')
    : satir('yok', 'bulunamadı', 'meta property="og:*"');

  const tw = anahtar('twitter:');
  const twitter = tw.length
    ? satir('var', `${meta['twitter:card'] ? guvenliMetin(meta['twitter:card'], 30) : 'kart türü yok'} · ${tw.length} etiket`, 'meta name="twitter:*"')
    : satir('yok', 'bulunamadı', 'meta name="twitter:*"');

  const ld = jsonLdTurleri(html);
  const bozukNot = ld.bozuk ? ` · ${ld.bozuk} blok çözülemedi` : '';
  const jsonLd = ld.turler.length
    ? satir('var', `${ld.turler.slice(0, 10).join(', ')}${ld.turler.length > 10 ? ` +${ld.turler.length - 10} daha` : ''}${bozukNot}`, `${ld.blok} application/ld+json bloğu`, { turler: ld.turler })
    : ld.blok ? satir('olcmedi', `ölçülemedi — ${ld.blok} blok var, tür okunamadı${bozukNot}`, 'application/ld+json')
      : satir('yok', 'bulunamadı', 'application/ld+json');

  const linkler = [...String(html).matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const diller = [...new Set(linkler.filter((l) => /\balternate\b/i.test(nitelik(l, 'rel') ?? '')).map((l) => nitelik(l, 'hreflang')).filter(Boolean)
    .map((d) => d.toLowerCase()).filter((d) => /^[a-z]{2,3}(-[a-z0-9]{2,8})*$|^x-default$/.test(d)))].sort();
  const hreflang = diller.length
    ? satir('var', `${diller.length} dil: ${diller.slice(0, 15).join(', ')}${diller.length > 15 ? ` +${diller.length - 15} daha` : ''}`, 'link rel="alternate" hreflang', { diller })
    : satir('yok', 'bulunamadı', 'link rel="alternate" hreflang');

  const mHref = linkler.filter((l) => /\bmanifest\b/i.test(nitelik(l, 'rel') ?? '')).map((l) => nitelik(l, 'href')).find(Boolean);
  let manifest = satir('yok', 'bulunamadı', 'link rel="manifest"');
  if (mHref) {
    let yol;
    try { yol = new URL(mHref, 'https://yer.invalid').pathname; } catch { yol = null; }
    manifest = yol ? satir('var', guvenliMetin(yol, 80), 'link rel="manifest" (dosya açılmadı)') : satir('olcmedi', 'ölçülemedi — adres çözülemedi', 'link rel="manifest"');
  }
  return { openGraph, twitter, jsonLd, hreflang, manifest };
}
