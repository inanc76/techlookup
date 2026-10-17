// Toplu tarama: bir listedeki siteleri SIRAYLA tarar, her siteyi sabit sütunlu CSV'ye tek satır olarak ekler.
// Kaldığı yerden sürer: son satırı "tamam" olan site atlanır, "ölçülemedi" olan yeniden denenir (yeni satır sona eklenir).
//   node scripts/toplu.mjs --liste siteler.txt [--cikti sonuc.csv] [--statik]
// Çıkış: 0 hepsi ölçüldü · 2 en az biri ölçülemedi · 1 liste/CSV okunamadı ya da CSV başlığı uymuyor
import { readFileSync, existsSync, appendFileSync, truncateSync, statSync } from 'node:fs';
import { calistir, kimlikSatirlari, sslSatirlari, BOLUM_SATIRLARI, IKON } from './techlookup.mjs';
import { GRUPLAR } from './kategoriler.mjs';
import { SURUM, guvenliMetin, dogrudanMi } from './ortak.mjs';
import { tarayicilariTemizle } from './tarayici.mjs';

const latin = (s) => s.toLocaleLowerCase('tr').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
  .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const yilan = (s) => s.replace(/[A-Z]/g, (h) => `_${h.toLowerCase()}`);

// "Alan adı sahibi" bilerek yok: kişi adı olabilir (toplu dosyada kişi verisi tutulmaz)
const KIMLIK = [
  ['Kayıt tarihi', 'kimlik_kayit_tarihi'], ['Bitiş tarihi', 'kimlik_bitis_tarihi'], ['Kayıt firması', 'kimlik_kayit_firmasi'],
  ['Siteyi yapan ajans', 'kimlik_ajans'], ['Arşivde ilk görülme', 'kimlik_arsiv_ilk'], ['Önceki siteyi yapan ajans', 'kimlik_onceki_ajans'],
  ['Bu şablonla yayında', 'kimlik_sablon'],
];
// sslSatirlari ile aynı sırada: sertifika · 6 yanıt başlığı · 4 ek satır
const SSL = ['ssl_sertifika', 'ssl_hsts', 'ssl_csp', 'ssl_x_frame_options', 'ssl_x_content_type_options', 'ssl_referrer_policy', 'ssl_permissions_policy',
  ...BOLUM_SATIRLARI.guvenlikEk.map(([k]) => `ssl_${yilan(k)}`)];
const bolumSutunlari = (on, ust) => BOLUM_SATIRLARI[ust].map(([k]) => [k, `${on}_${yilan(k)}`]);
const DNS = bolumSutunlari('dns', 'dnsSunucu');
const EPOSTA = bolumSutunlari('eposta', 'eposta');
const DOSYA = bolumSutunlari('dosya', 'dosyalar');
const PAYLASIM = bolumSutunlari('paylasim', 'paylasim');
const TEKNOLOJI = GRUPLAR.map((g) => [g, `teknoloji_${latin(g)}`]);

export const SUTUNLAR = [
  'techlookup_surum', 'adres', 'host', 'durum', 'not', 'tarih',
  ...KIMLIK.map((x) => x[1]), ...TEKNOLOJI.map((x) => x[1]), ...DNS.map((x) => x[1]), ...EPOSTA.map((x) => x[1]),
  ...SSL, ...DOSYA.map((x) => x[1]), ...PAYLASIM.map((x) => x[1]),
];

// ---------- CSV (RFC 4180) ----------
/** Tek hücre: formül gibi başlayan değere ' öneki, satır sonu boşluğa, virgül/tırnak varsa tırnak içine. */
export function csvHucre(x) {
  let t = String(x ?? '');
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  t = t.replace(/\r\n|\r|\n/g, ' ');
  return /[",]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** Tırnak, ikilenmiş tırnak ve tırnak içi satır sonunu bilen ayrıştırıcı. */
export function csvAyristir(metin) {
  const satirlar = [];
  let satir = [];
  let hucre = '';
  let tirnak = false;
  for (let i = 0; i < metin.length; i++) {
    const c = metin[i];
    if (tirnak) {
      if (c === '"' && metin[i + 1] === '"') { hucre += '"'; i++; } else if (c === '"') tirnak = false; else hucre += c;
    } else if (c === '"') tirnak = true;
    else if (c === ',') { satir.push(hucre); hucre = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && metin[i + 1] === '\n') i++;
      satir.push(hucre); satirlar.push(satir); satir = []; hucre = '';
    } else hucre += c;
  }
  if (hucre !== '' || satir.length) { satir.push(hucre); satirlar.push(satir); }
  return satirlar;
}

// ---------- satır ----------
const metin = (x) => guvenliMetin(String(x ?? '').replace(/\*\*/g, ''), Infinity);
const hucreMetni = (ikon, deger) => metin(`${ikon} ${deger}`);

function teknolojiHucresi(r, g) {
  const liste = r.gruplar?.[g];
  if (liste?.length) return metin(liste.map((t) => (t.surum ? `${t.ad} ${t.surum}` : t.ad)).join('; '));
  const neden = r.olculemeyenGruplar?.[g];
  return neden ? hucreMetni(IKON.olcmedi, `ölçülemedi — ${neden}`) : hucreMetni(IKON.yok, 'bulunamadı');
}

export function csvSatiri(r, { adres, host, tarih = new Date().toISOString().slice(0, 16).replace('T', ' ') }) {
  const temel = [SURUM ?? '', metin(adres), host, r.cikis === 0 ? 'tamam' : 'ölçülemedi', metin(r.cikis === 0 ? (r.notlar ?? []).join(' · ') : r.neden ?? ''), tarih];
  if (r.cikis !== 0) return [...temel, ...Array(SUTUNLAR.length - temel.length).fill('')];
  const kimlik = kimlikSatirlari(r.kimlik);
  const bolum = (ust, sutunlar) => sutunlar.map(([k]) => {
    const x = r[ust]?.[k];
    return hucreMetni(IKON[x?.durum] ?? IKON.olcmedi, x?.deger ?? 'ölçülemedi');
  });
  const satir = [
    ...temel,
    ...KIMLIK.map(([etiket]) => { const k = kimlik.find((x) => x[1] === etiket); return k ? hucreMetni(k[0], k[2]) : ''; }),
    ...TEKNOLOJI.map(([g]) => teknolojiHucresi(r, g)),
    ...bolum('dnsSunucu', DNS), ...bolum('eposta', EPOSTA),
    ...sslSatirlari(r).map(([i, , d]) => hucreMetni(i, d)),
    ...bolum('dosyalar', DOSYA), ...bolum('paylasim', PAYLASIM),
  ];
  if (satir.length !== SUTUNLAR.length) throw new Error(`sütun sayısı tutmuyor: ${satir.length} ≠ ${SUTUNLAR.length}`);
  return satir;
}

const satirYaz = (dosya, hucreler) => appendFileSync(dosya, `${hucreler.map(csvHucre).join(',')}\n`);

function anahtar(girdi) {
  try { return new URL(/^https?:\/\//i.test(girdi) ? girdi : `https://${girdi}`).host.toLowerCase().replace(/\.$/, ''); } catch { return girdi.toLowerCase(); }
}

const bugun = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

/** @returns {Promise<number>} çıkış kodu */
export async function topluTara({ liste, cikti = `techlookup-toplu-${bugun()}.csv`, statik = false, ara = 1000, yaz = (s) => process.stderr.write(`${s}\n`) } = {}) {
  let girdiler;
  try {
    girdiler = readFileSync(liste, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
  } catch (e) {
    yaz(`❌ liste okunamadı: ${liste} (${e.code ?? e.message})`);
    return 1;
  }

  // var olan dosya: başlık aynı değilse hiçbir şey yazılmaz; yarım kalmış son satır kesilir
  const son = new Map();
  const baslik = SUTUNLAR.map(csvHucre).join(',');
  if (existsSync(cikti) && statSync(cikti).size > 0) {
    let ham;
    try { ham = readFileSync(cikti, 'utf8'); } catch (e) { yaz(`❌ CSV okunamadı: ${cikti} (${e.code ?? e.message})`); return 1; }
    const govde = ham.replace(/^﻿/, '');
    if (govde.split('\n', 1)[0].replace(/\r$/, '') !== baslik) {
      yaz(`❌ ${cikti} başka bir sütun düzeniyle yazılmış (başka sürüm ya da başka dosya) — dokunulmadı. Yeni dosya adı ver: --cikti <ad>.csv`);
      return 1;
    }
    if (!ham.endsWith('\n')) {
      const kesik = ham.slice(0, ham.lastIndexOf('\n') + 1);
      truncateSync(cikti, Buffer.byteLength(kesik));
      yaz('⚠️ dosyanın son satırı yarım kalmıştı, kesildi');
      ham = kesik;
    }
    const satirlar = csvAyristir(ham.replace(/^﻿/, ''));
    const hi = SUTUNLAR.indexOf('host');
    const di = SUTUNLAR.indexOf('durum');
    for (const s of satirlar.slice(1)) son.set(s[hi], s[di]);
  } else {
    appendFileSync(cikti, `﻿${baslik}\n`);
  }

  let durdur = false;
  const kesinti = async () => {
    durdur = true;
    yaz('\n⏹ durduruluyor — Chrome kapatılıyor, geçici profil siliniyor…');
    await tarayicilariTemizle();
    yaz('⏹ durduruldu — yazılan satırlar dosyada; aynı komutla kaldığı yerden sürer');
    process.exit(130);
  };
  process.once('SIGINT', kesinti);
  process.once('SIGTERM', kesinti);

  const sayac = { tamam: 0, olcmedi: 0, atlandi: 0 };
  const bu = new Set();
  let ilk = true;
  for (const [i, girdi] of girdiler.entries()) {
    if (durdur) break;
    const host = anahtar(girdi);
    if (bu.has(host)) continue;
    bu.add(host);
    if (son.get(host) === 'tamam') { sayac.atlandi++; yaz(`[${i + 1}/${girdiler.length}] ${host} — önceden tamam, atlandı`); continue; }
    if (!ilk) await bekle(ara);
    ilk = false;
    const t0 = Date.now();
    let r;
    try { r = await calistir(girdi, { statik }); } catch (e) { r = { cikis: 2, neden: `beklenmedik hata: ${e.message}` }; }
    satirYaz(cikti, csvSatiri(r, { adres: girdi, host }));
    son.set(host, r.cikis === 0 ? 'tamam' : 'ölçülemedi');
    if (r.cikis === 0) sayac.tamam++; else sayac.olcmedi++;
    yaz(`[${i + 1}/${girdiler.length}] ${host} — ${r.cikis === 0 ? 'tamam' : `ölçülemedi (${guvenliMetin(r.neden ?? '', 60)})`} · ${Math.round((Date.now() - t0) / 1000)} sn`);
  }
  process.removeListener('SIGINT', kesinti);
  process.removeListener('SIGTERM', kesinti);

  const olculemeyen = [...bu].filter((h) => son.get(h) !== 'tamam').length;
  process.stdout.write(`${bu.size} site · tamam ${sayac.tamam} · ölçülemedi ${sayac.olcmedi} · önceden tamam ${sayac.atlandi} → ${cikti}\n`);
  return olculemeyen ? 2 : 0;
}

/** Komut satırı: --liste <dosya> [--cikti <dosya>] [--statik] */
export function topluArgumanlari(arg) {
  const deger = (ad) => { const i = arg.indexOf(ad); return i >= 0 ? arg[i + 1] : undefined; };
  return { liste: deger('--liste'), cikti: deger('--cikti'), statik: arg.includes('--statik') };
}

if (dogrudanMi(import.meta.url)) {
  const a = topluArgumanlari(process.argv.slice(2));
  if (!a.liste) { console.error('Kullanım: node toplu.mjs --liste siteler.txt [--cikti sonuc.csv] [--statik]'); process.exit(1); }
  process.exit(await topluTara({ ...a, cikti: a.cikti ?? undefined }));
}
