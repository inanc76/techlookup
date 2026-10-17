// CMS bulundu ama sürümü yoksa: CMS'in kendi bilinen dosyasından tam sürüm.
// Yalnız o CMS zaten bulunduysa, her yol bir kez, yalnız aynı siteye. Dosya gövdesi basılmaz; yalnız sürüm.
import { sinirliGetir } from './ortak.mjs';
import { kayitliAlan } from './kimlik.mjs';
import { ayniSiteGetir } from './dosyalar.mjs';

const SURUM = /^\d+(\.\d+){1,3}$/;
const TAVAN = 64 * 1024;

// WordPress çekirdek dosyalarının ?ver= değeri çekirdek sürümüdür (jQuery vb. kitaplık ?ver= kendi sürümünü taşır)
const WP_CEKIRDEK = /\/wp-includes\/(?:js\/wp-emoji-release\.min\.js|css\/dist\/block-library\/style\.min\.css)\?ver=([\d.]+)/i;

const YOKLAMALAR = {
  WordPress: { yol: '/feed/', desen: /<generator>\s*https?:\/\/wordpress\.org\/\?v=([\d.]+)\s*<\/generator>/i, kanit: '/feed/ generator' },
  Joomla: { yol: '/administrator/manifests/files/joomla.xml', desen: /<version>\s*([\d.]+)\s*<\/version>/i, kanit: 'joomla.xml <version>' },
  Drupal: { yol: '/CHANGELOG.txt', desen: /^\s*Drupal\s+([\d.]+)/im, kanit: 'CHANGELOG.txt ilk satırı' },
};

const kanitEkle = (t, k) => { (t.kanit ??= []).push(k); };

export async function cmsSurumu(gruplar, origin, html, { getir = sinirliGetir } = {}) {
  const adaylar = (gruplar?.CMS ?? []).filter((t) => !t.surum && YOKLAMALAR[t.ad]);
  if (!adaylar.length) return;
  const site = kayitliAlan(new URL(origin).hostname);
  await Promise.all(adaylar.map(async (t) => {
    if (t.ad === 'WordPress') {
      const m = String(html ?? '').match(WP_CEKIRDEK);
      if (m && SURUM.test(m[1])) { t.surum = m[1]; kanitEkle(t, 'sayfa kodu: wp-includes ?ver='); return; }
    }
    const y = YOKLAMALAR[t.ad];
    let r;
    try { r = await ayniSiteGetir(new URL(y.yol, origin).href, site, getir, TAVAN); } catch { return; }
    if (r?.kod !== 200 || typeof r.govde !== 'string') return;
    const s = r.govde.match(y.desen)?.[1];
    if (s && SURUM.test(s)) { t.surum = s; kanitEkle(t, y.kanit); }
  }));
}
