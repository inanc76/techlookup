// Sayfa kodundan ve tarayıcı isteklerinden çıkan ek olgular — ek istek atılmaz.
// WordPress teması/eklentileri · üçüncü taraf (dış) alan adları.
import { kayitliAlan } from './kimlik.mjs';
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
