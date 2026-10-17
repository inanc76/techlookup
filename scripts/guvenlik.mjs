// SSL ve güvenlik eki: sertifika kapsamı · yönlendirme zinciri · HSTS önyükleme koşulları · çerez bayrakları.
import { satir, sinirliGetir, guvenliMetin, UA_TARAYICI, sureSiniri, sureMetni } from './ortak.mjs';
import { kayitliAlan } from './kimlik.mjs';

/** Sertifikanın kapsadığı adlar ve bitişe kalan gün (tls getPeerCertificate nesnesinden). */
export function sertifikaKapsami(sertifika, simdi = new Date()) {
  const adlar = (sertifika?.subjectaltname ?? '').split(/,\s*/).filter((s) => s.startsWith('DNS:')).map((s) => s.slice(4));
  const bitis = sertifika?.valid_to ? new Date(sertifika.valid_to) : null;
  const kalanGun = bitis && !Number.isNaN(bitis.getTime()) ? Math.floor((bitis - simdi) / 86_400_000) : null;
  if (!adlar.length) return satir('yok', 'sertifikada ad listesi yok', '', { adlar, kalanGun });
  const liste = `${adlar.slice(0, 6).join(', ')}${adlar.length > 6 ? ` · +${adlar.length - 6} ad daha` : ''}`;
  const gun = kalanGun == null ? '' : kalanGun >= 0 ? ` · ${kalanGun} gün kaldı` : ` · süresi ${-kalanGun} gün önce doldu`;
  return satir('var', `${liste}${gun}`, 'sertifikanın ad listesi (SAN)', { adlar, kalanGun });
}

/** HSTS önyükleme koşulları başlıktan okunur (liste sorgusu yapılmaz): max-age ≥ 1 yıl · includeSubDomains · preload. */
export function hstsKosullari(baslik) {
  if (!baslik) return satir('yok', 'HSTS başlığı yok', '', { maxAge: false, altAlanlar: false, preload: false });
  const sn = Number(baslik.match(/max-age\s*=\s*"?(\d+)/i)?.[1] ?? 0);
  const k = { maxAge: sn >= 31_536_000, altAlanlar: /includesubdomains/i.test(baslik), preload: /(^|;)\s*preload\s*(;|$)/i.test(baslik) };
  const parca = [`max-age ${k.maxAge ? '≥ 1 yıl ✓' : `${sn} sn ✗`}`, `includeSubDomains ${k.altAlanlar ? '✓' : '✗'}`, `preload ${k.preload ? '✓' : '✗'}`].join(' · ');
  const hepsi = k.maxAge && k.altAlanlar && k.preload;
  return satir(hepsi ? 'var' : 'yok', hepsi ? `üç koşul sağlanıyor (${parca})` : `koşullar eksik: ${parca}`, 'Strict-Transport-Security başlığı', k);
}

const sameSiteAd = (s) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : null);

/** Set-Cookie satırlarından yalnız ad ve bayraklar; değer burada atılır. */
export function setCookieBayraklari(satirlar) {
  return satirlar.map((s) => {
    const [cift, ...nitelikler] = s.split(';').map((x) => x.trim());
    const ad = cift.slice(0, Math.max(cift.indexOf('='), 0)).trim();
    const n = nitelikler.map((x) => x.toLowerCase());
    return { ad: guvenliMetin(ad, 60), secure: n.includes('secure'), httpOnly: n.includes('httponly'), sameSite: sameSiteAd(n.find((x) => x.startsWith('samesite='))?.split('=')[1]) };
  }).filter((c) => c.ad);
}

/** Tarayıcı çerez nesnelerinden (Network.getCookies) yalnız ad ve bayraklar. */
export const tarayiciCerezBayraklari = (cerezler) => cerezler.map((c) => ({ ad: guvenliMetin(c.name, 60), secure: !!c.secure, httpOnly: !!c.httpOnly, sameSite: sameSiteAd(c.sameSite) }));

export function cerezSatiri(liste, kaynak) {
  if (!liste) return satir('olcmedi', 'ölçülemedi — sayfa açılamadı');
  if (!liste.length) return satir('yok', 'ilk sayfa çerez bırakmıyor', kaynak, { liste });
  const n = liste.length;
  const say = (f) => liste.filter(f).length;
  return satir('var', `${n} çerez · Secure ${say((c) => c.secure)}/${n} · HttpOnly ${say((c) => c.httpOnly)}/${n} · SameSite ${say((c) => c.sameSite)}/${n}`, kaynak, { liste });
}

// sorgu dizesi ve ;oturum parametreleri yazılmaz (jeton taşıyabilir)
const adresKirp = (u) => { const x = new URL(u); return `${x.protocol}//${x.host}${x.pathname.split(';')[0]}`; };

/** http:// adresinden başlayan yönlendirme zinciri; başka alana geçince o adım yazılır, sonrası izlenmez. */
export function yonlendirmeZinciri(baslangic, { getir = sinirliGetir, sure = 40_000 } = {}) {
  return sureSiniri(yonlendirmeZinciriIc(baslangic, getir), sure, () => satir('olcmedi', sureMetni(sure), baslangic, { adimlar: [] }));
}

async function yonlendirmeZinciriIc(baslangic, getir) {
  const site = kayitliAlan(new URL(baslangic).hostname);
  const adimlar = [];
  const gorulen = new Set();
  let adres = baslangic;
  let not = '';
  for (let i = 0; ; i++) {
    if (i === 10) { not = ' · 10 adımda durduruldu'; break; }
    const r = await getir(adres, { yonlendirme: 'manual', bayt: 1024, ua: UA_TARAYICI });
    if (!r.kod) {
      if (!adimlar.length) {
        return /ECONNREFUSED/.test(r.durum)
          ? satir('yok', 'şifresiz (http) adres bağlantı kabul etmiyor', adresKirp(baslangic), { adimlar })
          : satir('olcmedi', `ölçülemedi — ${r.durum.replace(/^ölçülemedi \((.*)\)$/, '$1')}`, '', { adimlar });
      }
      not = ` · sonraki adım açılamadı (${r.durum})`;
      break;
    }
    adimlar.push({ kod: r.kod, adres: adresKirp(adres) });
    gorulen.add(adres);
    const yer = r.basliklar?.get('location');
    if (r.kod < 300 || r.kod >= 400 || !yer) break;
    let sonraki;
    try { sonraki = new URL(yer, adres).href; } catch { not = ' · geçersiz Location'; break; }
    if (gorulen.has(sonraki)) { not = ' · döngü, durduruldu'; break; }
    if (!/^https?:$/.test(new URL(sonraki).protocol)) break;
    if (kayitliAlan(new URL(sonraki).hostname) !== site) {
      adimlar.push({ kod: null, adres: adresKirp(sonraki) });
      not = ' · başka alana geçiyor, izlenmedi';
      break;
    }
    adres = sonraki;
  }
  const metin = adimlar.map((a) => `${a.kod ?? '→'} ${a.adres}`).join(' → ');
  return satir('var', `${metin}${not}`, `${adimlar.length} adım`, { adimlar });
}
