// E-posta güvenliği: SPF ağacı (10 sorgu sınırına karşı sayım) · DMARC · DKIM (yaygın adlar) · MTA-STS · TLS-RPT · BIMI.
// Yalnız olgu yazılır; rapor/iletişim e-posta adresleri hiçbir çıktıya girmez.
import { digSor, guvenliAd, txtBirlestir, yedekNotu } from './dns.mjs';
import { satir, sinirliGetir, guvenliMetin, sureSiniri, sureMetni } from './ortak.mjs';

// DKIM anahtar adı dışarıdan listelenemez: yaygın sağlayıcı adları tek tek denenir
export const DKIM_ADLARI = [
  'google', 'selector1', 'selector2', 'default', 'dkim', 'dkim1', 'mail', 'email', 'smtp', 'mx',
  'k1', 'k2', 'k3', 's1', 's2', 's1024', 'key1', 'key2', 'sig1', 'zoho', 'zmail', 'mxvault',
  'everlytickey1', 'everlytickey2', 'mandrill', 'mailjet', 'amazonses', 'sendgrid', 'protonmail',
  'yandex', 'fm1', 'fm2', 'fm3', 'hs1', 'hs2',
];

async function sinirliParalel(liste, n, f) {
  const sonuc = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, liste.length) }, async () => {
    while (i < liste.length) { const j = i++; sonuc[j] = await f(liste[j]); }
  }));
  return sonuc;
}

const cevapVar = (c) => c.durum === 'NOERROR' || c.durum === 'NXDOMAIN';

async function txtKaydi(sor, ad, desen) {
  const c = await sor('TXT', ad);
  return { c, kayit: c.kayitlar.map(txtBirlestir).find((t) => desen.test(t)) };
}

function txtSatiri({ c, kayit }, varsa, yoksa) {
  if (kayit) return varsa(kayit, yedekNotu(c));
  if (cevapVar(c)) return satir('yok', yoksa, `DNS: ${c.durum}${yedekNotu(c)}`);
  return satir('olcmedi', `ölçülemedi — DNS ${c.durum}`);
}

const etiketler = (kayit) => Object.fromEntries(kayit.split(';').map((p) => p.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k.toLowerCase(), v.join('=').trim()]));

// ---------- SPF ----------
// RFC 7208: include · a · mx · ptr · exists · redirect her biri 1 DNS sorgusu sayılır, toplam sınır 10
async function spfAc(ad, sor, s, derinlik) {
  if (derinlik > 10 || s.istek >= 20) { s.cozulemeyen++; return null; }
  s.istek++;
  const { c, kayit } = await txtKaydi(sor, ad, /^v=spf1(\s|$)/i);
  if (!cevapVar(c)) { s.cozulemeyen++; s.kokHata ??= derinlik === 0 ? c.durum : null; return null; }
  if (!kayit) return null;
  for (const parca of kayit.split(/\s+/).slice(1)) {
    const m = parca.match(/^[+\-~?]?(include|a|mx|ptr|exists)(?::(.+))?$/i);
    const yon = parca.match(/^redirect=(.+)$/i);
    if (!m && !yon) continue;
    s.sorgu++;
    const hedef = yon ? yon[1] : m[1].toLowerCase() === 'include' ? m[2] : null;
    if (hedef === null) continue;
    // seçenek ya da makro taşıyan ad dig'e gitmez: sayılır, içi bilinmez
    if (!guvenliAd(hedef)) { s.sorgulanamayan++; continue; }
    await spfAc(hedef, sor, s, derinlik + 1);
  }
  return kayit;
}

async function spfSatiri(kok, sor) {
  const s = { sorgu: 0, istek: 0, cozulemeyen: 0, sorgulanamayan: 0, kokHata: null };
  const kayit = await spfAc(kok, sor, s, 0);
  if (s.kokHata) return satir('olcmedi', `ölçülemedi — DNS ${s.kokHata}`);
  if (!kayit) return satir('yok', 'kayıt yok', 'TXT');
  const hepsi = kayit.split(/\s+/).find((p) => /^[+\-~?]?all$/i.test(p));
  const son = hepsi ? ` · ${/^[+\-~?]/.test(hepsi) ? hepsi : `+${hepsi}`}` : '';
  if (s.cozulemeyen || s.sorgulanamayan) {
    const neden = [s.cozulemeyen && `${s.cozulemeyen} include çözülemedi`, s.sorgulanamayan && `${s.sorgulanamayan} mekanizma sorgulanamadı (makro / geçersiz ad)`].filter(Boolean).join(' · ');
    return satir('olcmedi', `en az ${s.sorgu} sorgu (sınır 10) · ${neden}${son}`, 'SPF ağacı');
  }
  return satir('var', `${s.sorgu} sorgu (sınır 10)${s.sorgu > 10 ? ' — sınır aşılıyor' : ''}${son}`, `SPF ağacı · ${s.istek} kayıt okundu`, { sorgu: s.sorgu });
}

// ---------- DKIM ----------
async function dkimSatiri(kok, sor) {
  const N = DKIM_ADLARI.length;
  const sonuclar = await sinirliParalel(DKIM_ADLARI, 15, async (ad) => ({ ad, ...(await txtKaydi(sor, `${ad}._domainkey.${kok}`, /v=DKIM1|(^|;)\s*p=/i)) }));
  const bulunan = sonuclar.filter((x) => x.kayit).map((x) => x.ad);
  const sorgulanan = sonuclar.filter((x) => cevapVar(x.c)).length;
  const yedekli = sonuclar.some((x) => x.c.yedek) ? ` · ${sonuclar.find((x) => x.c.yedek).c.yedek} üzerinden` : '';
  if (bulunan.length) return satir('var', `bulunan: ${bulunan.join(', ')}`, `${N} yaygın ad denendi${yedekli}`, { adlar: bulunan });
  if (!sorgulanan) return satir('olcmedi', `ölçülemedi — DNS ${sonuclar[0]?.c.durum ?? 'cevap yok'}`);
  if (sorgulanan < N) return satir('olcmedi', `ölçülemedi — ${sorgulanan}/${N} ad sorgulandı, bulunamadı`);
  return satir('yok', `${N} yaygın ad arasında bulunamadı (DKIM adı dışarıdan listelenemez)`, `${N} yaygın ad denendi${yedekli}`);
}

// ---------- MTA-STS ----------
const SERTIFIKA_HATASI = /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME|TLS/i;

async function mtaStsSatiri(kok, sor, getir) {
  const t = await txtKaydi(sor, `_mta-sts.${kok}`, /^v=STSv1/i);
  if (!t.kayit) return txtSatiri(t, null, 'kayıt yok');
  // politika doğrulayan TLS ile getirilir: geçersiz sertifikalı politikayı gönderen sunucular yok sayar
  const p = await getir(`https://mta-sts.${kok}/.well-known/mta-sts.txt`, { bayt: 64 * 1024 });
  if (p.durum !== 'tamam') {
    if (SERTIFIKA_HATASI.test(p.durum)) return satir('olcmedi', `ölçülemedi — politika sertifikası geçersiz (${p.durum.replace(/^ölçülemedi \((.*)\)$/, '$1')}), gönderen sunucular yok sayar`, '_mta-sts TXT');
    return satir('olcmedi', `ölçülemedi — DNS kaydı var, politika dosyası açılmadı (${p.durum})`, '_mta-sts TXT');
  }
  const mod = p.govde.match(/^\s*mode\s*:\s*([a-z]+)/im)?.[1]?.toLowerCase();
  if (!mod) return satir('olcmedi', 'ölçülemedi — politika dosyasında mode satırı yok', '_mta-sts TXT + politika dosyası');
  return satir('var', `mod: ${mod}`, `_mta-sts TXT + politika dosyası${yedekNotu(t.c)}`, { mod });
}

/** Kökteki e-posta kayıtları. secenek: { calistir, yedek } dig için, { getir } MTA-STS politikası için. */
export function epostaGuvenligi(kok, { calistir, yedek, getir = sinirliGetir, sure = 40_000 } = {}) {
  return sureSiniri(epostaGuvenligiIc(kok, { calistir, yedek, getir }), sure,
    () => Object.fromEntries(['spf', 'dmarc', 'dkim', 'mtaSts', 'tlsRpt', 'bimi'].map((k) => [k, satir('olcmedi', sureMetni(sure))])));
}

async function epostaGuvenligiIc(kok, { calistir, yedek, getir }) {
  const sor = (tur, ad) => digSor(tur, ad, { calistir, yedek });
  const [spf, dmarc, dkim, mtaSts, tlsRpt, bimi] = await Promise.all([
    spfSatiri(kok, sor),
    txtKaydi(sor, `_dmarc.${kok}`, /^v=DMARC1/i),
    dkimSatiri(kok, sor),
    mtaStsSatiri(kok, sor, getir),
    txtKaydi(sor, `_smtp._tls.${kok}`, /^v=TLSRPTv1/i),
    txtKaydi(sor, `default._bimi.${kok}`, /^v=BIMI1/i),
  ]);
  return {
    spf,
    dmarc: txtSatiri(dmarc, (kayit, not) => {
      const e = etiketler(kayit);
      const p = e.p?.toLowerCase();
      const parcalar = [p ? `politika: ${p}` : 'politika (p) yazılmamış'];
      if (e.sp) parcalar.push(`alt alan: ${e.sp.toLowerCase()}`);
      if (e.pct && e.pct !== '100') parcalar.push(`uygulama oranı %${e.pct}`);
      parcalar.push(e.rua ? 'rapor adresi tanımlı' : 'rapor adresi yok');
      return satir('var', parcalar.join(' · '), `_dmarc TXT${not}`, { p });
    }, 'kayıt yok'),
    dkim,
    mtaSts,
    tlsRpt: txtSatiri(tlsRpt, (kayit, not) => satir('var', etiketler(kayit).rua ? 'rapor adresi tanımlı' : 'kayıt var, rapor adresi yok', `_smtp._tls TXT${not}`), 'kayıt yok'),
    bimi: txtSatiri(bimi, (kayit, not) => {
      const e = etiketler(kayit);
      let logo = null;
      try { logo = e.l ? new URL(e.l).hostname : null; } catch {}
      return satir('var', `${logo ? `logo: ${guvenliMetin(logo, 60)}` : 'logo adresi yok'} · VMC sertifikası ${e.a ? 'tanımlı' : 'yok'}`, `default._bimi TXT${not}`);
    }, 'kayıt yok'),
  };
}
