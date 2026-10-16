// Sürüm olguları: bulunan sürümün çıkış yılı + bugünkü güncel sürüm.
// Kullanıcı kararı (2026-10-16): yalnız OLGU basılır — "eski / riskli" yorumu yapılmaz.
// Kaynaklar: npm (ön yüz kütüphaneleri, sürüm başına gün) · endoflife.date (sunucu tarafı, aile başına gün).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERI = join(dirname(dirname(fileURLToPath(import.meta.url))), 'veri');
const ONBELLEK = join(VERI, 'surum-onbellek.json');
const YEDI_GUN = 7 * 24 * 3600 * 1000;

// webappanalyzer adı → kaynak. Eşleşmesi kesin olmayan teknoloji bilerek listede yok:
// yanlış paketin tarihini basmaktansa "kaynakta yok" demek doğrudur.
const NPM = {
  jQuery: 'jquery', 'jQuery UI': 'jquery-ui', 'jQuery Migrate': 'jquery-migrate', Bootstrap: 'bootstrap',
  AngularJS: 'angular', Angular: '@angular/core', React: 'react', 'Vue.js': 'vue', 'Next.js': 'next', 'Nuxt.js': 'nuxt',
  Svelte: 'svelte', 'Alpine.js': 'alpinejs', 'Moment.js': 'moment', SweetAlert2: 'sweetalert2', 'core-js': 'core-js',
  Swiper: 'swiper', toastr: 'toastr', Isotope: 'isotope-layout', Masonry: 'masonry-layout', Skrollr: 'skrollr',
  Lodash: 'lodash', 'Underscore.js': 'underscore', 'Animate.css': 'animate.css', 'OWL Carousel': 'owl.carousel',
  Lightbox: 'lightbox2', 'Magnific Popup': 'magnific-popup', Slick: 'slick-carousel', GSAP: 'gsap', AOS: 'aos',
  'Chart.js': 'chart.js', Select2: 'select2', Axios: 'axios', 'Tailwind CSS': 'tailwindcss', Handlebars: 'handlebars',
  'Hammer.js': 'hammerjs', RequireJS: 'requirejs', 'Three.js': 'three', D3: 'd3', 'Backbone.js': 'backbone',
  'Knockout.js': 'knockout', Modernizr: 'modernizr', lazysizes: 'lazysizes', Gatsby: 'gatsby', Highcharts: 'highcharts',
  Popper: (v) => (Number(v.split('.')[0]) >= 2 ? '@popperjs/core' : 'popper.js'),
  'parallax.js': 'jquery-parallax.js', 'Fancybox': '@fancyapps/ui', 'Video.js': 'video.js', 'Clipboard.js': 'clipboard',
};
const EOL = {
  PHP: 'php', Nginx: 'nginx', 'Apache HTTP Server': 'apache-http-server', WordPress: 'wordpress', Drupal: 'drupal',
  Joomla: 'joomla', 'Node.js': 'nodejs', Python: 'python', Ruby: 'ruby', 'Ruby on Rails': 'rails', Laravel: 'laravel',
  Django: 'django', MySQL: 'mysql', MariaDB: 'mariadb', 'Apache Tomcat': 'tomcat', Varnish: 'varnish', TYPO3: 'typo3',
  Magento: 'magento', Symfony: 'symfony', OpenSSL: 'openssl', Umbraco: 'umbraco', 'Microsoft .NET': 'dotnet',
};

const yil = (iso) => (iso ? String(iso).slice(0, 4) : null);
const sayiSirasi = (a, b) => {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};

let bellek = null;
function onbellekOku() {
  if (bellek) return bellek;
  try { bellek = existsSync(ONBELLEK) ? JSON.parse(readFileSync(ONBELLEK, 'utf8')) : {}; } catch { bellek = {}; }
  return bellek;
}
function onbellekYaz() {
  try { mkdirSync(VERI, { recursive: true }); writeFileSync(ONBELLEK, JSON.stringify(bellek)); } catch { /* önbellek yazılamazsa sonuç yine doğru */ }
}

async function jsonGetir(u) {
  const c = await fetch(u, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  if (!c.ok) throw new Error(`HTTP ${c.status}`);
  return c.json();
}

/** Kaynağı kısalt: yalnız gereken alanlar önbelleğe girer (npm belgesi MB'larca olabilir). */
const ucustaki = new Map();
function kaynakAl(anahtar, adres, getir, kullanOnbellek) {
  const k = `${anahtar}|${kullanOnbellek}|${getir === jsonGetir}`;
  if (!ucustaki.has(k)) ucustaki.set(k, kaynakIndir(anahtar, adres, getir, kullanOnbellek).finally(() => ucustaki.delete(k)));
  return ucustaki.get(k);
}
async function kaynakIndir(anahtar, adres, getir, kullanOnbellek) {
  const ob = kullanOnbellek ? onbellekOku() : {};
  const kayit = ob[anahtar];
  if (kayit && Date.now() - kayit.zaman < YEDI_GUN) return kayit.veri;
  const ham = await getir(adres);
  const veri = anahtar.startsWith('npm:')
    ? { surumler: Object.fromEntries(Object.entries(ham.time ?? {}).filter(([k]) => /^\d/.test(k)).map(([k, v]) => [k, v.slice(0, 10)])), son: ham['dist-tags']?.latest }
    : ham.map((r) => ({ aile: String(r.cycle), cikis: r.releaseDate, son: r.latest, sonCikis: r.latestReleaseDate }));
  if (kullanOnbellek) { ob[anahtar] = { zaman: Date.now(), veri }; onbellekYaz(); }
  return veri;
}

/**
 * @returns null (bakılacak sürüm yok) · {durum:'kaynakta yok'} · {durum:'ölçülemedi (…)'} ·
 *          {durum:'tamam', yil, guncel, guncelYil, kaynak}
 */
export async function surumBilgisi(ad, surum, { getir = jsonGetir, onbellek = true } = {}) {
  if (!surum || !/^\d+(\.\d+)*$/.test(surum)) return null;
  const npm = typeof NPM[ad] === 'function' ? NPM[ad](surum) : NPM[ad];
  const eol = EOL[ad];
  if (!npm && !eol) return { durum: 'kaynakta yok' };
  try {
    if (npm) {
      const v = await kaynakAl(`npm:${npm}`, `https://registry.npmjs.org/${npm}`, getir, onbellek);
      let y = yil(v.surumler[surum]);
      if (!y && !surum.includes('.')) {
        // "11" gibi eksik sürüm: o hattın ilk çıkışı — sonraki bir alt sürüm de olabilir, "≥" ile yazılır
        const hat = Object.keys(v.surumler).filter((k) => k.startsWith(`${surum}.`) && !k.includes('-')).sort(sayiSirasi)[0];
        if (hat) y = `≥${yil(v.surumler[hat])}`;
      }
      return { durum: 'tamam', yil: y ?? null, guncel: v.son ?? null, guncelYil: yil(v.surumler[v.son]), kaynak: 'npm' };
    }
    const aileler = await kaynakAl(`eol:${eol}`, `https://endoflife.date/api/${eol}.json`, getir, onbellek);
    const aile = aileler.filter((a) => surum === a.aile || surum.startsWith(`${a.aile}.`)).sort((a, b) => b.aile.length - a.aile.length)[0];
    const y = !aile ? null : aile.son === surum ? yil(aile.sonCikis) : `aile: ${yil(aile.cikis)}`;
    const enYeni = [...aileler].sort((a, b) => sayiSirasi(b.aile, a.aile))[0];
    return { durum: 'tamam', yil: y, guncel: enYeni?.son ?? null, guncelYil: yil(enYeni?.sonCikis), kaynak: 'endoflife.date' };
  } catch (e) {
    return { durum: `ölçülemedi (${e.cause?.code ?? e.message})` };
  }
}

/** Gruplardaki her teknolojiye `surumBilgi` ekler; istekler paralel, aynı kaynak bir kez sorulur. */
export async function surumleriEkle(gruplar, secenek) {
  const hepsi = Object.values(gruplar).flat();
  await Promise.all(hepsi.map(async (t) => { t.surumBilgi = await surumBilgisi(t.ad, t.surum, secenek); }));
}
