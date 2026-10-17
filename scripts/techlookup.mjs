#!/usr/bin/env node
// /techlookup — bir web adresinin teknolojilerini çıkarır.
// Kullanım: node techlookup.mjs <adres> [--statik] [--json]
//   --statik  tarayıcı katmanını atla (yalnız ham kod + DNS + SSL)
//   --json    makine okunur çıktı (testler kullanır)
//   --skill   sona Claude'a kopyalama hatırlatması ekler (SKILL.md kullanır; terminalde gereksiz)
// Çıkış: 0 sonuç var · 2 site hiç ölçülemedi
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tls from 'node:tls';
import { veritabaniDerle, eslestir, tarayiciIstekleri, adresTeknolojileri } from './eslesme.mjs';
import { grupla, GRUPLAR } from './kategoriler.mjs';
import { dnsTopla, dnsYorumla, kokAlan, dnsGuvenlik, sunucuBilgisi } from './dns.mjs';
import { satir, SURUM, guvenliMetin } from './ortak.mjs';
import { cmsSurumu } from './cms-surum.mjs';
import { wordpressIzleri, disAlanAdlari, paylasimEtiketleri } from './sayfa.mjs';
import { epostaGuvenligi } from './eposta.mjs';
import { siteDosyalari } from './dosyalar.mjs';
import { sertifikaKapsami, hstsKosullari, setCookieBayraklari, cerezSatiri, yonlendirmeZinciri } from './guvenlik.mjs';
import { tarayiciTara } from './tarayici.mjs';
import { alanAdiSorgula, ajansBul, sablonTarihi } from './kimlik.mjs';
import { surumleriEkle } from './surum.mjs';

const KOK = dirname(dirname(fileURLToPath(import.meta.url)));
const VERI = join(KOK, 'veri');
const KAYNAK = 'https://raw.githubusercontent.com/enthec/webappanalyzer/main/src';
const HARFLER = ['_', ...'abcdefghijklmnopqrstuvwxyz'];
const YEDI_GUN = 7 * 24 * 3600 * 1000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

// ---------- parmak izi veritabanı ----------
async function veritabaniYukle() {
  const dosya = join(VERI, 'teknolojiler.json');
  const taze = existsSync(dosya) && Date.now() - statSync(dosya).mtimeMs < YEDI_GUN;
  if (!taze) {
    try {
      const parcalar = await Promise.all(
        HARFLER.map(async (h) => {
          const c = await fetch(`${KAYNAK}/technologies/${h}.json`, { signal: AbortSignal.timeout(30_000) });
          if (!c.ok) throw new Error(`${h}.json HTTP ${c.status}`);
          return c.json();
        }),
      );
      const birlesik = Object.assign({}, ...parcalar);
      mkdirSync(VERI, { recursive: true });
      writeFileSync(dosya, JSON.stringify(birlesik));
      return { teknolojiler: birlesik, not: null };
    } catch (e) {
      if (!existsSync(dosya)) return { teknolojiler: null, not: `parmak izi veritabanı indirilemedi (${e.message})` };
      return { teknolojiler: JSON.parse(readFileSync(dosya, 'utf8')), not: `veritabanı güncellenemedi, önbellek kullanıldı (${e.message})` };
    }
  }
  return { teknolojiler: JSON.parse(readFileSync(dosya, 'utf8')), not: null };
}

// ---------- statik katman ----------
function htmlAyikla(html) {
  const scriptSrc = [];
  const scripts = [];
  const meta = {};
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const src = m[1].match(/\bsrc\s*=\s*["']?([^"'\s>]+)/i);
    if (src) scriptSrc.push(src[1]);
    else if (m[2].trim()) scripts.push(m[2].slice(0, 20000));
  }
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const ad = m[0].match(/\b(?:name|property|http-equiv)\s*=\s*["']([^"']+)["']/i);
    const icerik = m[0].match(/\bcontent\s*=\s*["']([^"']*)["']/i);
    if (ad && !(ad[1].toLowerCase() in meta)) meta[ad[1].toLowerCase()] = icerik ? icerik[1] : '';
  }
  return { scriptSrc, scripts, meta };
}

async function statikTara(adres) {
  try {
    const c = await fetch(adres, {
      redirect: 'follow',
      headers: { 'user-agent': UA, 'accept-language': 'tr-TR,tr;q=0.9,en;q=0.8', accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(20_000),
    });
    const html = (await c.text()).slice(0, 2_000_000);
    const headers = {};
    c.headers.forEach((v, k) => { if (k !== 'set-cookie') headers[k] = v; });
    const cookies = {};
    for (const s of c.headers.getSetCookie()) {
      const [cift] = s.split(';');
      const i = cift.indexOf('=');
      if (i > 0) cookies[cift.slice(0, i).trim().toLowerCase()] = cift.slice(i + 1).trim();
    }
    const cerezBayraklari = setCookieBayraklari(c.headers.getSetCookie());
    return { durum: c.ok ? 'tamam' : `HTTP ${c.status}`, veri: { url: c.url, html, headers, cookies, cerezBayraklari, durumKodu: c.status, ...htmlAyikla(html) } };
  } catch (e) {
    const neden = e.cause?.code ?? e.name ?? e.message;
    return { durum: `ölçülemedi (${neden})`, cozulemedi: neden === 'ENOTFOUND' };
  }
}

// ---------- SSL ----------
function sslTara(host) {
  return new Promise((coz) => {
    const s = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: 10_000 }, () => {
      const c = s.getPeerCertificate();
      coz({
        veren: c?.issuer?.O ?? c?.issuer?.CN ?? null,
        bitis: c?.valid_to ? new Date(c.valid_to).toISOString().slice(0, 10) : null,
        tls: s.getProtocol(),
        gecerli: s.authorized,
        kapsam: sertifikaKapsami(c),
      });
      s.end();
    });
    s.on('timeout', () => { s.destroy(); coz(null); });
    s.on('error', () => coz(null));
  });
}

const GUVENLIK_BASLIKLARI = [
  ['strict-transport-security', 'HSTS (yalnız şifreli bağlantı zorunlu)'],
  ['content-security-policy', 'CSP (hangi kaynaktan kod yükleneceği sınırı)'],
  ['x-frame-options', 'X-Frame-Options (başka sitenin çerçevesine gömülme engeli)'],
  ['x-content-type-options', 'X-Content-Type-Options'],
  ['referrer-policy', 'Referrer-Policy'],
  ['permissions-policy', 'Permissions-Policy'],
];

// ---------- birleştirme ----------
function sinyalBirlestir(statik, tarayici) {
  const s = statik ?? {};
  const t = tarayici ?? {};
  return {
    url: t.url ?? s.url,
    html: [s.html, t.html].filter(Boolean).join('\n'),
    scriptSrc: [...new Set([...(s.scriptSrc ?? []), ...(t.scriptSrc ?? [])])],
    scripts: [...(s.scripts ?? []), ...(t.scripts ?? [])],
    meta: { ...(t.meta ?? {}), ...(s.meta ?? {}) },
    headers: { ...(t.headers ?? {}), ...(s.headers ?? {}) },
    cookies: { ...(s.cookies ?? {}), ...(t.cookies ?? {}) },
    istekler: t.istekler ?? [],
    js: t.js ?? null,
    dom: t.dom ?? null,
  };
}

const hucre = (x) => String(x ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const isaret = (d) => (d === 'tamam' ? '✅' : d === 'atlandı' ? '➖ atlandı' : `⚠️ ${d}`);
const IKON = { var: '✅', yok: '➖', olcmedi: '⚠️', eksik: '❌' };
const GRUP_IKON = {
  Frontend: '🎨', Backend: '⚙️', CMS: '📝', 'E-ticaret': '🛒', 'PaaS / Barındırma': '☁️', 'CDN ve güvenlik': '🛡️',
  Analytics: '📊', 'Etiket yöneticisi': '🏷️', 'Reklam pikselleri': '🎯', 'Canlı destek / CRM': '💬', 'Çerez onayı': '🍪',
  'Hata izleme': '🐞', 'E-posta altyapısı': '✉️', 'Doğrulama kayıtları': '🔑', Diğer: '🧩',
};
// Bu gruplardaki araçlar çoğunlukla sonradan (GTM vb. ile) yüklenir: tarayıcı yoksa "bulunamadı" denemez.
const TARAYICI_GRUPLARI = ['Analytics', 'Reklam pikselleri', 'Canlı destek / CRM', 'Çerez onayı', 'Hata izleme'];

const gun = (iso) => (iso ? iso.split('-').reverse().join('.') : '?');
const AY_ADI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const ay = (z) => `${AY_ADI[Number(z.slice(4, 6)) - 1]} ${z.slice(0, 4)}`;
function sure(baslangic) {
  const b = new Date(baslangic);
  const s = new Date();
  let a = (s.getFullYear() - b.getFullYear()) * 12 + s.getMonth() - b.getMonth();
  if (s.getDate() < b.getDate()) a--;
  const y = Math.floor(a / 12);
  const kalan = a % 12;
  return [y ? `${y} yıl` : '', kalan ? `${kalan} ay` : ''].filter(Boolean).join(' ') || '1 aydan az';
}
const ayFarki = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(4, 6)) - Number(a.slice(4, 6));
const zamanTarih = (z) => `${z.slice(0, 4)}-${z.slice(4, 6)}-${z.slice(6, 8)}`;
const olcmediMetin = (d) => `ölçülemedi${d && d !== 'ölçülemedi' ? ` — ${d.replace(/^ölçülemedi \((.*)\)$/, '$1')}` : ''}`;

/** [Sürüm hücresi, Güncel hücresi] — yalnız olgu; "eski" yorumu yapılmaz (kullanıcı kararı 2026-10-16). */
export function surumHucreleri(t) {
  if (!t.surum) return ['', ''];
  const b = t.surumBilgi;
  if (!b) return [t.surum, ''];
  if (b.durum === 'kaynakta yok') return [t.surum, `${IKON.yok} kaynakta yok`];
  if (b.durum !== 'tamam') return [t.surum, `${IKON.olcmedi} ölçülemedi`];
  const surum = b.yil ? `${t.surum} (${b.yil})` : t.surum;
  if (!b.guncel) return [surum, `${IKON.olcmedi} ölçülemedi`];
  return [surum, b.guncel === t.surum ? '= güncel' : `${b.guncel}${b.guncelYil ? ` (${b.guncelYil})` : ''}`];
}

export function kimlikSatirlari(k) {
  const s = [];
  const a = k.alanAdi;
  const kaynak = a?.kaynak ?? '';
  if (a?.durum === 'tamam') {
    if (a.sahipOlcmedi && !a.sahip && !a.sahipGizli) s.push([IKON.olcmedi, 'Alan adı sahibi', `ölçülemedi — ${a.sahipOlcmedi}`, kaynak]);
    else s.push([a.sahip ? IKON.var : IKON.yok, 'Alan adı sahibi', a.sahip ?? (a.sahipGizli ? '🔒 gizli (kayıtta sahip bilgisi gizlenmiş)' : 'kayıtta görünmüyor'), kaynak]);
    s.push([a.kayit ? IKON.var : IKON.yok, 'Kayıt tarihi', a.kayit ? `${gun(a.kayit)} · **${sure(a.kayit)}**` : 'kayıtta yazmıyor', a.alan]);
    s.push([a.bitis ? IKON.var : IKON.yok, 'Bitiş tarihi', a.bitis ? gun(a.bitis) : 'kayıtta yazmıyor', '']);
    s.push([a.kayitFirmasi ? IKON.var : IKON.yok, 'Kayıt firması', a.kayitFirmasi ?? 'kayıtta yazmıyor', '']);
  } else {
    for (const b of ['Alan adı sahibi', 'Kayıt tarihi', 'Bitiş tarihi', 'Kayıt firması']) s.push([IKON.olcmedi, b, olcmediMetin(a?.durum), a?.alan ?? '']);
  }
  const j = k.ajans;
  if (j === undefined) s.push([IKON.olcmedi, 'Siteyi yapan ajans', 'ölçülemedi — sayfa kodu alınamadı', '']);
  else if (j) s.push([IKON.var, 'Siteyi yapan ajans', `**${j.ad}**${j.alan ? ` · ${j.alan}` : ''}`, j.kanit]);
  else s.push([IKON.yok, 'Siteyi yapan ajans', 'imza bulunamadı', 'alt bilgi · bağlantılar · meta etiketleri']);

  const t = k.sablon;
  const ILK = 'Arşivde ilk görülme';
  if (t?.aySayisi > 0) s.push([IKON.var, ILK, `**${ay(t.ilkKayit)}** (${sure(zamanTarih(t.ilkKayit))}) · ${t.aySayisi} ayda kayıt`, 'archive.org (aylık kayıt listesi)']);
  else if (t?.aySayisi === 0) s.push([IKON.yok, ILK, 'arşivde kayıt yok', 'archive.org']);
  else s.push([IKON.olcmedi, ILK, olcmediMetin(t?.durum), 'archive.org']);
  const ONCEKI = 'Önceki siteyi yapan ajans';
  if (!t || /^(ölçülemedi|atlandı)/.test(t.durum)) s.push([IKON.olcmedi, ONCEKI, `ölçülemedi — şablon geçmişi okunamadı`, 'archive.org']);
  else if (!t.sonFarkli) s.push([IKON.yok, ONCEKI, 'arşivde önceki şablon yok', 'archive.org']);
  else if (t.oncekiAjansOlcmedi) s.push([IKON.olcmedi, ONCEKI, `ölçülemedi — ${t.oncekiAjansOlcmedi}`, `archive.org · ${ay(t.sonFarkli)} kaydı`]);
  else if (t.oncekiAjans) s.push([IKON.var, ONCEKI, `**${t.oncekiAjans.ad}**${t.oncekiAjans.alan ? ` · ${t.oncekiAjans.alan}` : ''}`, `archive.org · ${ay(t.sonFarkli)} kaydı · ${t.oncekiAjans.kanit}`]);
  else s.push([IKON.yok, ONCEKI, 'imza bulunamadı', `archive.org · ${ay(t.sonFarkli)} kaydı`]);
  const n = t?.incelenen != null ? `archive.org · ${t.incelenen} kayıt incelendi` : 'archive.org';
  if (!t || /^(ölçülemedi|atlandı)/.test(t.durum)) s.push([IKON.olcmedi, 'Bu şablonla yayında', olcmediMetin(t?.durum), 'archive.org']);
  else if (!t.ilkAyni) s.push([IKON.var, 'Bu şablonla yayında', `son arşiv kaydı (${ay(t.sonFarkli)}) eski şablonu gösteriyor — yeni şablon henüz arşivde yok`, n]);
  else if (!t.sonFarkli && t.durum === 'tamam') s.push([IKON.var, 'Bu şablonla yayında', `başlangıç: **${ay(t.ilkAyni)}** veya öncesi (${sure(zamanTarih(t.ilkAyni))}) · arşivin ilk kaydından beri aynı`, n]);
  else if (t.durum === 'tamam' && ayFarki(t.sonFarkli, t.ilkAyni) > 2) s.push([IKON.var, 'Bu şablonla yayında', `**${ay(t.sonFarkli)} ile ${ay(t.ilkAyni)} arasında** geçilmiş (arşivde aradaki aylardan kullanılabilir kayıt yok) · en az ${sure(zamanTarih(t.ilkAyni))}`, n]);
  else if (t.durum === 'tamam') s.push([IKON.var, 'Bu şablonla yayında', `başlangıç: **${ay(t.ilkAyni)}** (${sure(zamanTarih(t.ilkAyni))}) · önceki şablon en son ${ay(t.sonFarkli)} kaydında görüldü`, n]);
  else s.push([IKON.olcmedi, 'Bu şablonla yayında', `kesinleşmedi — ${t.sonFarkli ? `${ay(t.sonFarkli)} ile ${ay(t.ilkAyni)} arasında geçilmiş` : `en geç ${ay(t.ilkAyni)}`} (arşiv yanıt vermeyi kesti)`, n]);
  return s;
}

function markdownYaz(r) {
  const s = [];
  s.push(`## 🔎 Teknoloji taraması — ${r.host}`);
  s.push('');
  s.push(`Adres: ${r.sonAdres ?? r.adres} · ${new Date().toISOString().slice(0, 10)}`);
  s.push(`Katmanlar: Sayfa kodu ${isaret(r.durum.statik)} · Tarayıcı ${isaret(r.durum.tarayici)} · DNS ${isaret(r.durum.dns)} · SSL ${isaret(r.durum.ssl)}`);
  s.push('');
  s.push('`✅ bulundu · ➖ bulunamadı · ⚠️ ölçülemedi · ❌ eksik`');
  for (const n of r.notlar) s.push(`> Not: ${n}`);
  s.push('');
  s.push('### 🪪 Site kimliği');
  s.push('');
  s.push('|  | Bilgi | Değer | Kaynak |');
  s.push('|:-:|---|---|---|');
  for (const [i, b, d, k] of kimlikSatirlari(r.kimlik)) s.push(`| ${i} | ${b} | ${hucre(d)} | ${hucre(k)} |`);
  s.push('');
  s.push('### 🧩 Teknolojiler');
  s.push('');
  s.push('|  | Grup | Teknoloji | Sürüm (yıl) | Güncel sürüm | Kanıt |');
  s.push('|:-:|---|---|---|---|---|');
  for (const g of r.grupSirasi) {
    const liste = r.gruplar[g];
    const baslik = `${GRUP_IKON[g] ?? ''} **${g}**`;
    if (!liste?.length) {
      if (g === 'Diğer') continue;
      const neden = r.olculemeyenGruplar[g];
      s.push(neden ? `| ${IKON.olcmedi} | ${baslik} | ölçülemedi — ${neden} |  |  |  |` : `| ${IKON.yok} | ${baslik} | bulunamadı |  |  |  |`);
      continue;
    }
    liste.forEach((t, i) => {
      const guven = t.guven != null && t.guven < 100 ? ` (olasılık %${t.guven})` : '';
      const [surum, guncel] = surumHucreleri(t);
      s.push(`| ${i === 0 ? IKON.var : ''} | ${i === 0 ? baslik : ''} | ${hucre(t.ad)}${guven} | ${hucre(surum)} | ${hucre(guncel)} | ${hucre(t.kanit?.join(' · ') ?? '')} |`);
    });
  }
  s.push('');
  s.push('### 🔒 SSL ve güvenlik başlıkları');
  s.push('');
  s.push('|  | Kontrol | Sonuç |');
  s.push('|:-:|---|---|');
  if (r.ssl) {
    s.push(`| ${r.ssl.gecerli ? IKON.var : IKON.eksik} | Sertifika | ${hucre(r.ssl.veren ?? '?')} · bitiş ${gun(r.ssl.bitis)} · ${r.ssl.tls ?? ''} · zincir ${r.ssl.gecerli ? 'geçerli' : '**GEÇERSİZ**'} |`);
  } else if (r.durum.ssl === 'atlandı') {
    s.push(`| ${IKON.yok} | Sertifika | şifresiz adres (http), bakılmadı |`);
  } else s.push(`| ${IKON.olcmedi} | Sertifika | ölçülemedi |`);
  for (const [k, ad] of GUVENLIK_BASLIKLARI) {
    const v = r.guvenlik?.find((x) => x[0] === k);
    s.push(v ? `| ${v[2] ? IKON.var : IKON.eksik} | ${ad} | ${v[2] ? 'var' : 'yok'} |` : `| ${IKON.olcmedi} | ${ad} | ölçülemedi |`);
  }
  return s.join('\n');
}

export async function calistir(girdi, { statik: yalnizStatik = false } = {}) {
  let adres = girdi.trim();
  if (!/^https?:\/\//i.test(adres)) adres = 'https://' + adres;
  let host;
  try { host = new URL(adres).hostname; } catch { return olculemedi(girdi, 'geçersiz adres'); }
  const notlar = [];

  const { teknolojiler, not } = await veritabaniYukle();
  if (!teknolojiler) return olculemedi(host, not);
  if (not) notlar.push(not);
  const db = veritabaniDerle(teknolojiler);

  const yerel = /^(localhost|127\.|\d+\.\d+\.\d+\.\d+$)/.test(host);
  const yerelSatir = () => satir('olcmedi', 'ölçülemedi — yerel adres, DNS ve dış kaynak sorulmadı');
  const dnsGuvenlikSozu = yerel ? Promise.resolve(null) : dnsGuvenlik(kokAlan(host), host);
  const http = new URL(adres);
  http.protocol = 'http:';
  const yonlendirmeSozu = yonlendirmeZinciri(`${http.origin}/`);
  const epostaSozu = yerel ? Promise.resolve(null) : epostaGuvenligi(kokAlan(host));
  const alanAdiSozu = yerel ? Promise.resolve({ durum: 'ölçülemedi (yerel adres, alan adı kaydı yok)' }) : alanAdiSorgula(host);
  const [st, dnsHam, ssl] = await Promise.all([
    statikTara(adres),
    yerel ? Promise.resolve(undefined) : dnsTopla(host),
    adres.startsWith('https:') && !yerel ? sslTara(host) : Promise.resolve(undefined),
  ]);
  if (st.cozulemedi) return olculemedi(host, 'alan adı çözülemedi (DNS kaydı yok)');
  const sunucuSozu = yerel ? Promise.resolve(null) : sunucuBilgisi(host, dnsHam?.a?.[0]);
  const dosyalarSozu = siteDosyalari(new URL(st.veri?.url ?? adres).origin);

  // arşiv karşılaştırması tarayıcıyla aynı anda koşar; canlı iz ham sayfa kodundan çıkar (arşiv de ham kodu verir)
  const sablonSozu = yerel ? Promise.resolve({ durum: 'ölçülemedi (yerel adres, arşivde yok)' })
    : st.veri ? sablonTarihi(new URL(st.veri.url).hostname, st.veri.html) : Promise.resolve({ durum: 'ölçülemedi (sayfa kodu alınamadı)' });
  let tr = { durum: 'atlandı' };
  if (!yalnizStatik) {
    const { js, dom } = tarayiciIstekleri(db);
    tr = await tarayiciTara(st.veri?.url ?? adres, { jsYollari: js, domKurallari: dom });
    if (tr.durum.startsWith('bot duvarı')) notlar.push('Site otomatik ziyaretçiyi doğrulama sayfasına yönlendirdi; tarayıcı sonuçları eksik olabilir.');
  }
  const tarayiciVeri = tr.durum === 'tamam' ? tr.veri : null;
  if (!st.veri && !tarayiciVeri) return olculemedi(host, `sayfa açılamadı — sayfa kodu: ${st.durum}; tarayıcı: ${tr.durum}`);
  if (!yalnizStatik && !tarayiciVeri) notlar.push('Tarayıcı katmanı yok: sonradan yüklenen araçlar (GTM ile gelen pikseller vb.) eksik olabilir.');

  const sinyal = sinyalBirlestir(st.veri, tarayiciVeri);
  if (dnsHam) sinyal.dns = { MX: dnsHam.mx, TXT: dnsHam.txt, NS: dnsHam.ns, CNAME: dnsHam.cname };
  if (ssl?.veren) sinyal.certIssuer = ssl.veren;

  const { gruplar, dislanan } = grupla(eslestir(db, sinyal));

  // DNS grupları
  const ekle = (g, b) => {
    const l = (gruplar[g] ??= []);
    if (!l.some((x) => x.ad === b.ad)) l.push({ ...b, kanit: [b.kanit] });
  };
  if (dnsHam) {
    const y = dnsYorumla(dnsHam);
    for (const b of y.eposta) ekle('E-posta altyapısı', b);
    for (const b of y.dogrulama) ekle('Doğrulama kayıtları', b);
    // parmak izi veritabanı aynı sağlayıcıyı zaten bulduysa (ör. "Cloudflare DNS") ikinci satır yazılmaz
    const zatenVar = (ad) => (gruplar['PaaS / Barındırma'] ?? []).some((x) => x.ad.toLowerCase().startsWith(ad.toLowerCase()));
    for (const b of y.barindirma) if (!zatenVar(b.ad)) ekle('PaaS / Barındırma', { ...b, ad: `${b.ad} (DNS)` });
    if (dnsHam.asn?.ad) {
      const cdn = /cloudflare|akamai|fastly|cloudfront|incapsula|imperva|sucuri|stackpath/i.test(dnsHam.asn.ad);
      ekle('PaaS / Barındırma', {
        ad: `${dnsHam.asn.ad} (sunucu ağı${cdn ? ' — CDN arkasında, asıl sunucu gizli' : ''})`,
        kanit: `IP ${dnsHam.asn.ip} → AS${dnsHam.asn.no}`,
      });
    }
  }

  const sonHeaders = sinyal.headers;
  const [cerezListe, cerezKaynak] = tarayiciVeri?.cerezBayraklari ? [tarayiciVeri.cerezBayraklari, 'tarayıcı (Network.getCookies)']
    : st.veri ? [st.veri.cerezBayraklari, 'Set-Cookie başlığı'] : [null, ''];
  const guvenlikEk = {
    kapsam: ssl ? ssl.kapsam : ssl === undefined ? satir('yok', 'şifresiz adres (http), sertifika yok') : satir('olcmedi', 'ölçülemedi — sertifika okunamadı'),
    yonlendirme: await yonlendirmeSozu,
    hstsOnyukleme: hstsKosullari(sonHeaders['strict-transport-security']),
    cerezler: cerezSatiri(cerezListe, cerezKaynak),
  };
  const guvenlik = st.veri || tarayiciVeri ? GUVENLIK_BASLIKLARI.map(([k, ad]) => [k, ad, k in sonHeaders]) : null;

  const grupSirasi = GRUPLAR;
  const olculemeyenGruplar = {};
  if (!dnsHam) for (const g of ['E-posta altyapısı', 'Doğrulama kayıtları']) olculemeyenGruplar[g] = yerel ? 'yerel adres, DNS sorgusu yapılmadı' : 'DNS sorgusu cevap vermedi';
  if (!tarayiciVeri) for (const g of TARAYICI_GRUPLARI) olculemeyenGruplar[g] = `tarayıcı katmanı ${tr.durum === 'atlandı' ? 'atlandı' : 'çalışmadı'}, sonradan yüklenen araçlar görünmez`;

  // CMS sürümü bilinen dosyadan dolar, sonra yıl/güncel sürüm o sürüme göre bulunur
  const sayfaOrigin = new URL(sinyal.url ?? adres).origin;
  const surumSozu = cmsSurumu(gruplar, sayfaOrigin, sinyal.html).then(() => surumleriEkle(gruplar));
  const [alanAdi, sablon, , dnsG, sunucu, epostaHam, dosyalar] = await Promise.all([alanAdiSozu, sablonSozu, surumSozu, dnsGuvenlikSozu, sunucuSozu, epostaSozu, dosyalarSozu]);

  // WordPress teması / eklentileri: sayfa kodu ve isteklerdeki /wp-content/ yollarından (ek istek yok)
  const wp = wordpressIzleri({ html: sinyal.html, istekler: sinyal.istekler, scriptSrc: sinyal.scriptSrc });
  const izKaynak = tarayiciVeri ? 'sayfa kodu + tarayıcı istekleri' : 'yalnız sayfa kodu (tarayıcı yok)';
  if (wp.tema) (gruplar.CMS ??= []).push({ ad: `WordPress teması: ${guvenliMetin(wp.tema, 60)}`, kategoriler: [], surum: null, kanit: [`${izKaynak}: /wp-content/themes/`] });
  if (wp.eklentiler.length) {
    const fazla = wp.eklentiler.length - 20;
    (gruplar.CMS ??= []).push({
      ad: `WordPress eklentileri (${wp.eklentiler.length}): ${wp.eklentiler.slice(0, 20).map((e) => guvenliMetin(e, 60)).join(', ')}${fazla > 0 ? ` +${fazla} daha` : ''}`,
      kategoriler: [], surum: null, liste: wp.eklentiler, kanit: [`${izKaynak}: /wp-content/plugins/`],
    });
  }
  // dış alan adları: üçüncü taraf kayıtlı alanlar; kapsam dışı teknolojiye düşen istek basılmaz
  const dis = disAlanAdlari({
    istekler: sinyal.istekler, scriptSrc: sinyal.scriptSrc, siteHost: new URL(sayfaOrigin).hostname,
    teknolojiBul: (u) => adresTeknolojileri(db, u),
  });
  if (dis.liste.length) (gruplar['Diğer'] ??= []).push({ ad: `Dış alan adları (${dis.liste.length}): ${dis.ad}`, kategoriler: [], surum: null, liste: dis.liste, kanit: [izKaynak] });
  const eposta = Object.fromEntries(['spf', 'dmarc', 'dkim', 'mtaSts', 'tlsRpt', 'bimi'].map((k) => [k, epostaHam?.[k] ?? yerelSatir()]));
  const dnsSunucu = {
    dnssec: dnsG?.dnssec ?? yerelSatir(), caa: dnsG?.caa ?? yerelSatir(), soa: dnsG?.soa ?? yerelSatir(), https: dnsG?.https ?? yerelSatir(),
    ulke: sunucu?.ulke ?? yerelSatir(), yesil: sunucu?.yesil ?? yerelSatir(),
  };
  // sayfadaki imza önceliklidir; yoksa humans.txt'teki ajans adayı
  const humans = dosyalar.humans.ajans;
  const kimlik = { alanAdi, ajans: ajansBul(sinyal.html, host) ?? (humans ? { ad: humans.ad, alan: null, kanit: humans.kanit } : null), sablon };

  const r = {
    surum: SURUM, adres, host, sonAdres: sinyal.url, notlar, gruplar, dislanan, grupSirasi, olculemeyenGruplar, kimlik, dnsSunucu, eposta, guvenlikEk, dosyalar,
    paylasim: paylasimEtiketleri({ html: sinyal.html, meta: sinyal.meta }),
    durum: {
      statik: st.durum,
      tarayici: tr.durum,
      dns: yerel ? 'atlandı' : dnsHam ? 'tamam' : 'ölçülemedi',
      ssl: ssl === undefined ? 'atlandı' : ssl ? 'tamam' : 'ölçülemedi',
      eposta: yerel ? 'atlandı' : Object.values(eposta).every((x) => x.durum === 'olcmedi') ? 'ölçülemedi' : 'tamam',
      yonlendirme: guvenlikEk.yonlendirme.durum === 'olcmedi' ? 'ölçülemedi' : 'tamam',
      dosyalar: Object.values(dosyalar).every((x) => x.durum === 'olcmedi') ? 'ölçülemedi' : 'tamam',
      ulke: yerel ? 'atlandı' : dnsSunucu.ulke.durum === 'olcmedi' ? 'ölçülemedi' : 'tamam',
      yesilEnerji: yerel ? 'atlandı' : dnsSunucu.yesil.durum === 'olcmedi' ? 'ölçülemedi' : 'tamam',
    },
    ssl: ssl ? { veren: ssl.veren, bitis: ssl.bitis, tls: ssl.tls, gecerli: ssl.gecerli, adlar: ssl.kapsam.adlar, kalanGun: ssl.kapsam.kalanGun } : null,
    guvenlik,
  };
  r.markdown = markdownYaz(r);
  r.cikis = 0;
  return r;
}

function olculemedi(host, neden) {
  return {
    host, cikis: 2, gruplar: {}, durum: { statik: 'ölçülemedi', tarayici: 'ölçülemedi', dns: 'ölçülemedi', ssl: 'ölçülemedi' },
    markdown: `## Teknoloji taraması — ${host}\n\n**ÖLÇÜLEMEDİ:** ${neden}\n\nHiçbir teknoloji listesi üretilmedi; bu "teknoloji yok" demek değildir.`,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = process.argv.slice(2);
  const adres = arg.find((a) => !a.startsWith('--'));
  if (!adres) {
    console.error('Kullanım: node techlookup.mjs <adres> [--statik] [--json]');
    process.exit(2);
  }
  const r = await calistir(adres, { statik: arg.includes('--statik') });
  if (arg.includes('--json')) {
    const { grupSirasi, olculemeyenGruplar, ...cikti } = r;
    process.stdout.write(JSON.stringify(cikti));
  } else process.stdout.write(r.markdown + '\n');
  // Model komut çıktısını kullanıcının gördüğünü sanıp yalnız yorum yazabiliyordu (4 koşuda 1);
  // talimat SKILL.md'nin başında değil, cevabı yazmadan hemen önce okuduğu yerde durmalı.
  if (arg.includes('--skill') && !arg.includes('--json')) {
    process.stdout.write('\n<!-- Claude: kullanıcı bu komut çıktısını GÖRMEZ. Yukarıdaki çıktının TAMAMINI cevabına AYNEN kopyala, sonra en fazla 3 satır yorum yaz. -->\n');
  }
  process.exit(r.cikis);
}
