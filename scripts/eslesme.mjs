// Wappalyzer (webappanalyzer) parmak izi kurallarını sinyallerle eşler. Saf fonksiyonlar; ağ yok.
// Desen biçimi: "regex\;version:\1\;confidence:50"

const dizi = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

export function desenAyir(ham) {
  const [kalip, ...ekler] = String(ham).split('\\;');
  const d = { kalip, surum: null, guven: 100, regex: null };
  for (const e of ekler) {
    const i = e.indexOf(':');
    if (i < 0) continue;
    const ad = e.slice(0, i);
    const deger = e.slice(i + 1);
    if (ad === 'version') d.surum = deger;
    if (ad === 'confidence') d.guven = Number(deger) || 0;
  }
  try {
    d.regex = new RegExp(kalip, 'i');
  } catch {
    d.regex = null; // JS'de geçersiz desen — o kural sessizce düşer, diğerleri çalışır
  }
  return d;
}

// "\1" grup yerleştirme ve "\1?evet:hayır" üçlüsü
function surumCoz(sablon, eslesme) {
  if (!sablon || !eslesme) return null;
  let s = sablon.replace(/\\(\d)\?([^:]*):(.*)/, (_, n, evet, hayir) => (eslesme[n] ? evet : hayir));
  s = s.replace(/\\(\d)/g, (_, n) => eslesme[n] ?? '');
  s = s.trim();
  return s && s.length < 30 ? s : null;
}

const derle = (x) => dizi(x).map(desenAyir);
const derleNesne = (o) =>
  Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k.toLowerCase(), derle(v)]));

export function veritabaniDerle(teknolojiler) {
  const db = [];
  for (const [ad, t] of Object.entries(teknolojiler)) {
    let dom = null;
    if (t.dom) {
      dom = {};
      if (typeof t.dom === 'string' || Array.isArray(t.dom)) {
        for (const s of dizi(t.dom)) dom[s] = { exists: true };
      } else {
        for (const [s, k] of Object.entries(t.dom)) dom[s] = k ?? { exists: true };
      }
    }
    db.push({
      ad,
      kategoriler: t.cats ?? [],
      url: derle(t.url),
      html: derle(t.html),
      scriptSrc: derle(t.scriptSrc),
      scripts: derle(t.scripts),
      xhr: derle(t.xhr),
      certIssuer: derle(t.certIssuer),
      meta: derleNesne(t.meta),
      headers: derleNesne(t.headers),
      cookies: derleNesne(t.cookies),
      js: Object.fromEntries(Object.entries(t.js ?? {}).map(([k, v]) => [k, derle(v)])),
      dns: Object.fromEntries(Object.entries(t.dns ?? {}).map(([k, v]) => [k.toUpperCase(), derle(v)])),
      dom,
      implies: dizi(t.implies).map((x) => desenAyir(x)),
      excludes: dizi(t.excludes).map((x) => String(x).split('\\;')[0]),
      requires: dizi(t.requires).map((x) => String(x).split('\\;')[0]),
      requiresCategory: dizi(t.requiresCategory),
    });
  }
  return db;
}

// Tarayıcıda sınanacak js yolları ve dom seçicileri
export function tarayiciIstekleri(db) {
  const js = new Set();
  const dom = {};
  for (const t of db) {
    for (const k of Object.keys(t.js)) js.add(k);
    if (t.dom) for (const [s, k] of Object.entries(t.dom)) dom[s] = { ...(dom[s] ?? {}), ...k };
  }
  return { js: [...js], dom };
}

const kisalt = (s, n = 60) => {
  s = String(s).replace(/\s+/g, ' ');
  return s.length > n ? s.slice(0, n) + '…' : s;
};

/**
 * sinyaller: {
 *   url, html, scriptSrc: [], scripts: [], meta: {ad: deger}, headers: {ad: deger},
 *   cookies: {ad: deger}, istekler: [url], certIssuer, dns: {MX: [], TXT: [], NS: []},
 *   js: {yol: deger} | null, dom: {secici: {exists, text, attributes, properties}} | null
 * }
 */
export function eslestir(db, sinyal) {
  const bulunan = new Map();

  const ekle = (t, guven, surum, kanit) => {
    let b = bulunan.get(t.ad);
    if (!b) {
      b = { ad: t.ad, kategoriler: t.kategoriler, surum: null, guven: 0, kanit: [] };
      bulunan.set(t.ad, b);
    }
    b.guven = Math.min(100, b.guven + guven);
    if (surum && (!b.surum || surum.length > b.surum.length)) b.surum = surum;
    if (kanit && b.kanit.length < 2 && !b.kanit.includes(kanit)) b.kanit.push(kanit);
  };

  // gizli: kanıta değer yazılmaz (çerez değeri kişisel veri taşıyabilir), yalnız alan adı
  const dene = (t, desenler, deger, alan, gizli = false) => {
    if (deger == null) return;
    for (const d of desenler) {
      if (!d.regex) continue;
      const m = d.regex.exec(String(deger));
      if (m) ekle(t, d.guven, surumCoz(d.surum, m), gizli ? alan : `${alan}: ${kisalt(d.kalip ? m[0] : deger)}`);
    }
  };

  const listeDene = (t, desenler, liste, alan) => {
    if (!desenler.length) return;
    for (const deger of liste ?? []) dene(t, desenler, deger, alan);
  };

  const nesneDene = (t, kurallar, kaynak, alan, gizli = false) => {
    if (!kaynak) return;
    for (const [ad, desenler] of Object.entries(kurallar)) {
      if (!(ad in kaynak)) continue;
      dene(t, desenler, kaynak[ad], `${alan} ${ad}`, gizli);
    }
  };

  const scriptAdresleri = [...(sinyal.scriptSrc ?? []), ...(sinyal.istekler ?? []).filter((u) => /\.m?js(\?|$)|\/gtm\.js|\/gtag\/|fbevents|signals\/config/i.test(u))];
  const istekHostlari = (sinyal.istekler ?? []).map((u) => {
    try { return new URL(u).hostname; } catch { return u; }
  });

  for (const t of db) {
    if (sinyal.url) listeDene(t, t.url, [sinyal.url], 'adres');
    if (sinyal.html) listeDene(t, t.html, [sinyal.html], 'html');
    listeDene(t, t.scriptSrc, scriptAdresleri, 'script');
    listeDene(t, t.scripts, sinyal.scripts, 'satır içi script');
    listeDene(t, t.xhr, istekHostlari, 'ağ isteği');
    if (sinyal.certIssuer) listeDene(t, t.certIssuer, [sinyal.certIssuer], 'sertifika');
    nesneDene(t, t.meta, sinyal.meta, 'meta');
    nesneDene(t, t.headers, sinyal.headers, 'başlık');
    nesneDene(t, t.cookies, sinyal.cookies, 'çerez', true);
    if (sinyal.js) nesneDene(t, t.js, sinyal.js, 'js');
    if (sinyal.dns) {
      for (const [tur, desenler] of Object.entries(t.dns)) listeDene(t, desenler, sinyal.dns[tur], `dns ${tur}`);
    }
    if (sinyal.dom && t.dom) {
      for (const [secici, kural] of Object.entries(t.dom)) {
        const s = sinyal.dom[secici];
        if (!s || !s.exists) continue;
        if (kural.exists !== undefined && !kural.text && !kural.attributes && !kural.properties) {
          ekle(t, 100, null, `dom: ${kisalt(secici)}`);
          continue;
        }
        if (kural.text) dene(t, derle(kural.text), s.text, `dom ${secici}`);
        for (const [a, p] of Object.entries(kural.attributes ?? {})) dene(t, derle(p), s.attributes?.[a], `dom ${secici}[${a}]`);
        for (const [p, d] of Object.entries(kural.properties ?? {})) dene(t, derle(d), s.properties?.[p], `dom ${secici}.${p}`);
      }
    }
  }

  // implies zinciri
  const adlaDb = new Map(db.map((t) => [t.ad, t]));
  let degisti = true;
  while (degisti) {
    degisti = false;
    for (const b of [...bulunan.values()]) {
      for (const imp of adlaDb.get(b.ad)?.implies ?? []) {
        const hedef = adlaDb.get(imp.kalip);
        if (hedef && !bulunan.has(hedef.ad)) {
          ekle(hedef, imp.guven, null, `${b.ad} bunu gerektirir`);
          degisti = true;
        }
      }
    }
  }

  // requires / requiresCategory / excludes
  const kategoriVar = (k) => [...bulunan.values()].some((b) => b.kategoriler.includes(k));
  for (const b of [...bulunan.values()]) {
    const t = adlaDb.get(b.ad);
    if (t.requires.length && !t.requires.some((r) => bulunan.has(r))) bulunan.delete(b.ad);
    else if (t.requiresCategory.length && !t.requiresCategory.some(kategoriVar)) bulunan.delete(b.ad);
  }
  for (const b of [...bulunan.values()]) for (const x of adlaDb.get(b.ad)?.excludes ?? []) bulunan.delete(x);

  return [...bulunan.values()];
}
