// Teknoloji eki ölçütleri — `node --test tests/sayfa.test.mjs`
// K27 CMS tam sürümü · K28 WordPress teması/eklentileri · K29 dış alan adları · K35 paylaşım etiketleri
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cmsSurumu } from '../scripts/cms-surum.mjs';
import { wordpressIzleri, disAlanAdlari, paylasimEtiketleri } from '../scripts/sayfa.mjs';

const ORIGIN = 'https://www.example.com';
function sahteGetir(tablo, cagrilar) {
  return async (url) => {
    cagrilar.push(url);
    const d = tablo[new URL(url).pathname];
    if (!d) return { durum: 'HTTP 404', kod: 404, govde: 'yok', tur: 'text/html' };
    return { durum: 'tamam', kod: 200, govde: d, tur: 'text/xml' };
  };
}

test('K27 CMS sürümü — bilinen dosyadan, kanıtıyla; CMS yoksa ya da sürüm zaten varsa istek yok', async () => {
  const cagrilar = [];
  const wp = { CMS: [{ ad: 'WordPress', surum: null, kanit: ['html: wp-content'] }] };
  await cmsSurumu(wp, ORIGIN, '<html></html>', { getir: sahteGetir({ '/feed/': '<?xml version="1.0"?><rss><channel><generator>https://wordpress.org/?v=6.4.3</generator></channel></rss>' }, cagrilar) });
  assert.equal(wp.CMS[0].surum, '6.4.3');
  assert.ok(wp.CMS[0].kanit.some((k) => /\/feed\/ generator/.test(k)), `kanıt: ${wp.CMS[0].kanit}`);

  // sayfa kodundaki çekirdek dosya sürümü: istek atılmaz
  const c2 = [];
  const wp2 = { CMS: [{ ad: 'WordPress', surum: null, kanit: [] }] };
  await cmsSurumu(wp2, ORIGIN, '<link rel="stylesheet" href="/wp-includes/css/dist/block-library/style.min.css?ver=6.5.2"><script src="/wp-includes/js/jquery/jquery.min.js?ver=3.7.1"></script>', { getir: sahteGetir({}, c2) });
  assert.equal(wp2.CMS[0].surum, '6.5.2', 'jQuery sürümü WordPress sürümü sanılmamalı');
  assert.equal(c2.length, 0);

  const c3 = [];
  const jo = { CMS: [{ ad: 'Joomla', surum: null, kanit: [] }] };
  await cmsSurumu(jo, ORIGIN, '', { getir: sahteGetir({ '/administrator/manifests/files/joomla.xml': '<?xml version="1.0"?><extension><version>4.4.1</version></extension>' }, c3) });
  assert.equal(jo.CMS[0].surum, '4.4.1');
  assert.ok(jo.CMS[0].kanit.some((k) => /joomla\.xml/.test(k)));

  const c4 = [];
  await cmsSurumu({ CMS: [] }, ORIGIN, '', { getir: sahteGetir({}, c4) });
  await cmsSurumu({ CMS: [{ ad: 'WordPress', surum: '6.6.2', kanit: [] }] }, ORIGIN, '', { getir: sahteGetir({}, c4) });
  assert.equal(c4.length, 0, `gereksiz istek: ${c4}`);

  // dosya bulunamazsa sürüm uydurulmaz
  const c5 = [];
  const bos = { CMS: [{ ad: 'WordPress', surum: null, kanit: [] }] };
  await cmsSurumu(bos, ORIGIN, '', { getir: sahteGetir({}, c5) });
  assert.equal(bos.CMS[0].surum, null);
});

test('K28 WordPress teması ve eklentileri — yollardan; kapsam dışı eklenti basılmaz', () => {
  const html = `<link href="/wp-content/themes/ornek-tema/style.css"><script src="/wp-content/plugins/contact-form-7/includes/js/index.js"></script>
    <script src="https://www.example.com/wp-content/plugins/iyzico-woocommerce/x.js"></script><img src="/wp-content/plugins/hotjar/logo.png">`;
  const w = wordpressIzleri({ html, istekler: ['https://www.example.com/wp-content/plugins/wordpress-seo/js/a.js?ver=1', 'https://www.example.com/wp-content/plugins/google-maps-widget/m.js', 'https://www.example.com/wp-content/plugins/ornek-player-pro/p.js'], scriptSrc: [] });
  assert.equal(w.tema, 'ornek-tema');
  assert.deepEqual(w.eklentiler, ['contact-form-7', 'wordpress-seo']);
  assert.deepEqual(wordpressIzleri({ html: '<html></html>', istekler: [], scriptSrc: [] }), { tema: null, eklentiler: [] });
});

test('K29 dış alan adları — yalnız üçüncü taraf kayıtlı alanlar; site, kapsam dışı ve sorgu dizesi yok', () => {
  const istekler = [
    'https://www.example.com/a.js', 'https://cdn.example.com/b.js',
    'https://www.googletagmanager.com/gtm.js?id=GTM-X', 'https://connect.facebook.net/en_US/fbevents.js',
    'https://api.ornekcrm.io/track?token=GIZLI',
    'https://fonts.gstatic.com/s/x.woff2', 'https://www.youtube.com/embed/x', 'https://static.hotjar.com/c/hotjar-1.js',
    'https://odeme.ornekpos.com/sdk.js',
  ];
  // parmak izi eşleşmesi: ornekpos bir ödeme aracı (kategori 41) gibi davranır
  const teknolojiBul = (url) => (/ornekpos/.test(url) ? [{ ad: 'OrnekPOS', kategoriler: [41] }] : []);
  const d = disAlanAdlari({ istekler, scriptSrc: [], siteHost: 'www.example.com', teknolojiBul });
  assert.deepEqual(d.liste, ['facebook.net', 'googletagmanager.com', 'ornekcrm.io']);
  const metin = JSON.stringify(d);
  for (const y of ['GIZLI', 'token', 'gstatic', 'youtube', 'hotjar', 'ornekpos', 'example.com']) assert.ok(!metin.includes(y), `${y} çıktıya girdi`);
  const cok = disAlanAdlari({ istekler: Array.from({ length: 45 }, (_, i) => `https://a${i}.ornek${i}.net/x.js`), scriptSrc: [], siteHost: 'www.example.com', teknolojiBul: () => [] });
  assert.equal(cok.liste.length, 45);
  assert.match(cok.ad, /\+5 daha/);
});

test('K35 paylaşım etiketleri — Open Graph · Twitter Card · JSON-LD · hreflang · manifest; yoksa ➖', () => {
  const html = `<head><meta property="og:title" content="Ornek Baslik"><meta property="og:image" content="https://www.example.com/k.png"><meta property="og:type" content="website">
    <meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@ornek">
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":["WebSite","Thing"]}]}</script>
    <script type="application/ld+json">{bozuk</script>
    <link rel="alternate" hreflang="tr" href="/tr/"><link hreflang="en" rel="alternate" href="/en/"><link rel="alternate" hreflang="x-default" href="/">
    <link rel="manifest" href="/site.webmanifest?v=GIZLI3"></head>`;
  const meta = { 'og:title': 'Ornek Baslik', 'og:image': 'https://www.example.com/k.png', 'og:type': 'website', 'twitter:card': 'summary_large_image', 'twitter:site': '@ornek' };
  const p = paylasimEtiketleri({ html, meta });
  for (const k of ['openGraph', 'twitter', 'jsonLd', 'hreflang', 'manifest']) assert.equal(p[k]?.durum, 'var', `${k}: ${JSON.stringify(p[k])}`);
  assert.match(p.openGraph.deger, /3 etiket/);
  assert.match(p.openGraph.deger, /görsel ✓/);
  assert.match(p.openGraph.deger, /Ornek Baslik/);
  assert.match(p.twitter.deger, /summary_large_image/);
  assert.deepEqual(p.jsonLd.turler, ['Organization', 'WebSite', 'Thing']);
  assert.match(p.jsonLd.deger, /1 blok çözülemedi/);
  assert.deepEqual(p.hreflang.diller, ['en', 'tr', 'x-default']);
  assert.equal(p.manifest.deger, '/site.webmanifest');
  assert.ok(!JSON.stringify(p).includes('GIZLI3'), 'manifest sorgu dizesi çıktıya girdi');

  const bos = paylasimEtiketleri({ html: '<html><head></head></html>', meta: {} });
  for (const k of ['openGraph', 'twitter', 'jsonLd', 'hreflang', 'manifest']) assert.equal(bos[k]?.durum, 'yok', k);
});
