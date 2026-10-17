// /techlookup kimlik ölçütleri — `node --test ~/.claude/skills/techlookup/tests/kimlik.test.mjs`
// K10 alan adı · K11 ajans · K12 şablon izi · K13 şablon sınırı · K14 sabit tablo · K30 arşivde ilk görülme
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const kok = dirname(dirname(fileURLToPath(import.meta.url)));
const fikstur = (ad) => readFileSync(join(kok, 'tests', 'fikstur', ad), 'utf8');
const kimlik = () => import(join(kok, 'scripts', 'kimlik.mjs'));
const koş = promisify(execFile);

let sunucu, taban;
before(async () => {
  sunucu = http.createServer((istek, cevap) => {
    cevap.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    cevap.end(fikstur(istek.url === '/ajans' ? 'ajans.html' : 'statik.html'));
  });
  await new Promise((r) => sunucu.listen(0, '127.0.0.1', r));
  taban = `http://127.0.0.1:${sunucu.address().port}`;
});
after(() => sunucu.close());

async function tara(...arg) {
  const betik = join(kok, 'scripts', 'techlookup.mjs');
  try {
    const { stdout } = await koş('node', [betik, ...arg, '--json'], { timeout: 90_000 });
    return { cikis: 0, ...JSON.parse(stdout) };
  } catch (e) {
    if (e.stdout) return { cikis: e.code, ...JSON.parse(e.stdout) };
    throw e;
  }
}

test('K10 alan adı — TRABİS ve RDAP cevabından sahip, kayıt ve bitiş tarihi çıkar', async () => {
  const { whoisCoz, rdapCoz, kayitliAlan } = await kimlik();
  const t = whoisCoz(fikstur('trabis.txt'));
  assert.equal(t.sahip, 'Örnek Kurum A.Ş.');
  assert.equal(t.kayit, '2012-03-05');
  assert.equal(t.bitis, '2027-03-04');
  assert.equal(t.kayitFirmasi, 'TRABİS KK');

  const gizli = whoisCoz(fikstur('trabis.txt').replace(/Örnek Kurum[^\n]*/, 'Hidden upon user request'));
  assert.equal(gizli.sahip, null, 'gizlenmiş sahip "Hidden upon user request" diye basılmamalı');
  assert.equal(gizli.sahipGizli, true);

  const r = rdapCoz(JSON.parse(fikstur('rdap.json')));
  assert.equal(r.kayit, '1997-09-15');
  assert.equal(r.bitis, '2028-09-14');
  assert.equal(r.kayitFirmasi, 'MarkMonitor Inc.');
  assert.equal(r.sahip, 'Google LLC');
  const kapali = JSON.parse(fikstur('rdap.json'));
  kapali.entities.at(-1).vcardArray[1] = [['fn', {}, 'text', 'REDACTED REGISTRANT'], ['org', {}, 'text', 'REDACTED FOR PRIVACY']];
  const k = rdapCoz(kapali);
  assert.equal(k.sahip, null, 'REDACTED sahip diye basılmamalı');
  assert.equal(k.sahipGizli, true);
  // gerçek .com kaydı (Tucows, 2026-10-16): sahip satırı var ama adı boş — bu da gizlenmiş demektir
  kapali.entities.at(-1).vcardArray[1] = [['fn', {}, 'text', '']];
  assert.equal(rdapCoz(kapali).sahipGizli, true, 'boş sahip adı gizli sayılmadı');

  assert.equal(kayitliAlan('www.ornek.gov.tr'), 'ornek.gov.tr');
  assert.equal(kayitliAlan('shop.ornek.com'), 'ornek.com');
  assert.equal(kayitliAlan('www.bbc.co.uk'), 'bbc.co.uk');
});

test('K11 ajans — alt bilgideki imzadan ajans çıkar, platform ve site kendisi ajans sayılmaz', async () => {
  const { ajansBul } = await kimlik();
  const a = ajansBul(fikstur('ajans.html'), 'ornekmusteri.com.tr');
  assert.equal(a?.ad, 'Örnek Dijital Ajans');
  assert.equal(a?.alan, 'ornekdijital.com.tr');

  const tr = ajansBul('<footer><a href="https://beta-yazilim.com">Beta Yazılım</a> tarafından geliştirilmiştir.</footer>', 'x.com');
  assert.equal(tr?.ad, 'Beta Yazılım');
  const en = ajansBul('<footer>Website by <a href="https://studio.io/?ref=x">Studio Nine</a></footer>', 'x.com');
  assert.equal(en?.ad, 'Studio Nine');
  // nextjs.org (2026-10-16): ad cümle sonunda biter, sonraki cümle ada girmez
  assert.equal(ajansBul('<footer><p>Website built by Vercel. examples and docs</p></footer>', 'nextjs.org')?.ad, 'Vercel');
  const meta = ajansBul('<meta name="author" content="Gamma Interactive"><body></body>', 'x.com');
  assert.equal(meta?.ad, 'Gamma Interactive');

  // gerçek sitelerden türetildi (2026-10-16) — adlar değiştirildi
  const konsol = ajansBul(`<body><p>x</p><script>console.log('Delta Dijital Ajans:: Web Tasarım Ajansı')</script></body>`, 'ornek-oto.com');
  assert.equal(konsol?.ad, 'Delta Dijital Ajans');
  const yorum = ajansBul('<body><!-- Developed by Yazılım Mühendisi Ayşe Örnek --></body>', 'ornek.bel.tr');
  assert.equal(yorum?.ad, 'Yazılım Mühendisi Ayşe Örnek');
  const baslik = ajansBul('<body><main>' + 'x'.repeat(3000) + '</main><div>© 2026 &nbsp;&nbsp;<a href="https://www.ornekmedya.net" title="web tasarım ankara">Web tasarım ornekmedya</a></div></body>', 'ornekklinik.com.tr');
  assert.equal(baslik?.alan, 'ornekmedya.net');
  assert.equal(ajansBul('<meta name="author" content="Özgür Market A.Ş."><body></body>', 'ozgurmarket.com.tr'), null, 'site sahibinin kendi adı ajans değil');
  const ic = ajansBul('<meta name="author" content="Bilgi İşlem Daire Başkanlığı"><body></body>', 'ornek.bel.tr');
  assert.match(ic?.kanit ?? '', /kurum içi/);

  // gerçek ajans sitesi arşivi (Ağustos 2020): alt kısımdaki Twitter akışı — hashtag imza değil, t.co ajans değil
  const tweet = '<footer><div class="text">Yeni projemiz yayında #web #webtasarım #webdesign <a href="https://t.co/BwrKAXhQMt" title="http://www.ornekmusteri.com.tr">http://www.ornekmusteri.com.tr</a></div></footer>';
  assert.equal(ajansBul(tweet, 'ornekajans.com.tr'), null, 'tweet bağlantısı ajans sayıldı');
  const kisa = ajansBul('<footer>Tasarım: <a href="https://bit.ly/3xYz">Beta Ajans</a></footer>', 'x.com');
  assert.equal(kisa?.ad, 'Beta Ajans', 'imza metni okunmalı');
  assert.notEqual(kisa?.alan, 'bit.ly', 'kısa bağlantı ajans adresi sayıldı');
  assert.equal(ajansBul(tweet.replace('https://t.co/BwrKAXhQMt', 'https://www.ornekmusteri.com.tr'), 'ornekajans.com.tr'), null, 'hashtag imza sayıldı');
  assert.equal(ajansBul('<footer>Powered by <a href="https://wordpress.org">WordPress</a></footer>', 'x.com'), null);
  assert.equal(ajansBul('<footer>Tasarım: <a href="https://x.com/hakkimizda">Biz</a></footer>', 'x.com'), null);
  assert.equal(ajansBul('<p>Kariyer geliştirme vizyonuyla <a href="https://uni.edu.tr">üniversite</a></p>', 'x.com'), null);
});

test('K12 şablon izi — içerik değişince aynı, şablon değişince farklı', async () => {
  const { sablonIzi, ayniSablon } = await kimlik();
  const eski = sablonIzi(fikstur('sablon-a1.html'));
  assert.equal(ayniSablon(eski, sablonIzi(fikstur('sablon-a2.html'))), true, 'yalnız içerik değişti — aynı şablon sayılmalı');
  assert.equal(ayniSablon(eski, sablonIzi(fikstur('sablon-b.html'))), false, 'şablon değişti — farklı sayılmalı');
  // nextjs.org (2026-10-16): her yayında dosya adına rastgele ek gelir — aynı şablon farklı görünmemeli
  // ölçülen: aynı şablonda sınıfların ~%42'si ortak (içerik sınıfları değişir), dosya adları tamamen farklı
  const nx = (ekler, sinif) => `<html><head>${ekler.map((e) => `<link rel="stylesheet" href="/_next/static/immutable/chunks/${e}.css"><script src="/_next/static/chunks/main-${e}.js"></script>`).join('')}</head><body><nav class="nav top"><a class="link">x</a></nav><main class="hero grid ${sinif}"></main></body></html>`;
  assert.equal(ayniSablon(sablonIzi(nx(['0nluicjmsuvr', '3rm9-g4b_2tme'], 'a1x a2x a3x')), sablonIzi(nx(['0h1ctucpphw0', 'bomqsbd0-f_f'], 'b1x b2x b3x'))), true, 'rastgele dosya adı eki şablon farkı sayıldı');
});

test('K13 şablon sınırı — ikiye bölerek değişim ayını bulur, az istekle', async () => {
  const { sablonSinirBul } = await kimlik();
  const zamanlar = Array.from({ length: 40 }, (_, i) => `20${String(10 + Math.floor(i / 12)).padStart(2, '0')}${String((i % 12) + 1).padStart(2, '0')}01000000`);
  const canli = { varliklar: new Set(['/yeni.css']), siniflar: new Set(['yeni']) };
  const eski = { varliklar: new Set(['/eski.css']), siniflar: new Set(['eski']) };
  let istek = 0;
  const getir = async (z) => { istek++; return zamanlar.indexOf(z) >= 27 ? canli : eski; };
  const s = await sablonSinirBul(zamanlar, getir, canli);
  assert.equal(s.durum, 'tamam');
  assert.equal(s.ilkAyni, zamanlar[27]);
  assert.equal(s.sonFarkli, zamanlar[26]);
  assert.ok(istek <= 9, `çok istek: ${istek}`);

  // gerçek site (2026-10-16): son arşiv kaydı bot doğrulama sayfası — boş iz "farklı şablon" sayılmaz
  const bos = { varliklar: new Set(), siniflar: new Set() };
  const s2 = await sablonSinirBul(zamanlar, async (z) => { const i = zamanlar.indexOf(z); return i === 39 ? bos : i >= 27 ? canli : eski; }, canli);
  assert.equal(s2.ilkAyni, zamanlar[27], `boş son kayıt sonucu bozdu: ${JSON.stringify(s2)}`);

  const hep = await sablonSinirBul(zamanlar, async () => canli, canli);
  assert.equal(hep.sonFarkli, null);
  assert.equal(hep.ilkAyni, zamanlar[0]);

  // bir kayıt açılamazsa yalan söylemez: aralığı daraltabildiği kadar verir
  const bozuk = await sablonSinirBul(zamanlar, async (z) => {
    const i = zamanlar.indexOf(z);
    if (i > 0 && i < 39) throw new Error('ECONNREFUSED');
    return i >= 27 ? canli : eski;
  }, canli);
  assert.equal(bozuk.durum, 'kısmen');
  assert.equal(bozuk.sonFarkli, zamanlar[0]);
  assert.equal(bozuk.ilkAyni, zamanlar[39]);
});

test('K14 sabit tablo — her grup ve kimlik satırı her zaman yerinde, durumu ikonla yazılı', async () => {
  const s = await tara(taban + '/ajans', '--statik');
  assert.equal(s.cikis, 0);
  const satir = (ad) => s.markdown.split('\n').find((l) => l.startsWith('|') && l.includes(ad));
  const { GRUPLAR } = await import(join(kok, 'scripts', 'kategoriler.mjs'));
  for (const g of GRUPLAR.filter((x) => x !== 'Diğer')) assert.ok(satir(g), `${g} satırı yok`);
  for (const k of ['Alan adı sahibi', 'Kayıt tarihi', 'Siteyi yapan ajans', 'Önceki siteyi yapan ajans', 'Bu şablonla yayında']) assert.ok(satir(k), `${k} satırı yok`);
  // yerel adres: DNS ve alan adı sorgusu yapılmadı → ölçülemedi, "bulunamadı" DEĞİL
  assert.match(satir('E-posta altyapısı'), /⚠️/);
  assert.match(satir('Alan adı sahibi'), /⚠️/);
  // tarayıcı atlandı → sonradan yüklenen araç grupları "bulunamadı" denemez
  assert.match(satir('Hata izleme'), /⚠️/);
  assert.doesNotMatch(satir('Hata izleme'), /➖/);
  // sayfa kodundan bakılabilen ve olmayan → bulunamadı
  assert.match(satir('E-ticaret'), /➖/);
  assert.match(satir('Siteyi yapan ajans'), /✅.*Örnek Dijital Ajans/);
  assert.match(s.markdown, /✅ bulundu · ➖ bulunamadı · ⚠️ ölçülemedi/);
});

test('K15 kimlik satırları — arşiv boşluğu aralık olarak, sorulamayan sahip ölçülemedi olarak yazılır', async () => {
  const { kimlikSatirlari } = await import(join(kok, 'scripts', 'techlookup.mjs'));
  const alanAdi = { durum: 'tamam', alan: 'x.com', kaynak: 'RDAP kaydı', kayit: '2005-08-30', bitis: '2032-08-30', kayitFirmasi: 'T', sahip: null, sahipGizli: false, sahipOlcmedi: 'kayıt firması cevap vermedi (HTTP 429)' };
  // gerçek site (2026-10-16): önceki şablon 08.2020, yenisi 05.2023 — arada arşiv kaydı yok
  const sablon = { durum: 'tamam', sonFarkli: '20200801000000', ilkAyni: '20230501000000', incelenen: 8 };
  const satir = (ad) => kimlikSatirlari({ alanAdi, ajans: null, sablon }).find((x) => x[1] === ad);
  assert.equal(satir('Alan adı sahibi')[0], '⚠️', 'sorulamayan sahip "yok" gibi gösterildi');
  assert.match(satir('Alan adı sahibi')[2], /ölçülemedi.*429/);
  assert.match(satir('Bu şablonla yayında')[2], /Ağustos 2020.*Mayıs 2023 arasında/);
  const yakin = kimlikSatirlari({ alanAdi, ajans: null, sablon: { ...sablon, sonFarkli: '20230401000000' } }).find((x) => x[1] === 'Bu şablonla yayında');
  assert.match(yakin[2], /başlangıç: \*\*Mayıs 2023\*\*/);
});

test('K16 önceki ajans — önceki şablonun son arşiv kaydındaki imza okunur', async () => {
  const { sablonTarihi } = await kimlik();
  const zamanlar = Array.from({ length: 10 }, (_, i) => `20${10 + i}0601000000`);
  const eskiSablon = fikstur('sablon-b.html').replace('</body>', '<footer>Web Tasarım: <a href="https://www.eskiajans.com.tr">Eski Ajans</a></footer></body>');
  const yeniSablon = fikstur('sablon-a1.html');
  const getir = async (u) => {
    if (u.includes('/cdx/')) return JSON.stringify([['timestamp'], ...zamanlar.map((z) => [z])]);
    const z = u.match(/\/web\/(\d+)id_\//)[1];
    return zamanlar.indexOf(z) >= 6 ? yeniSablon : eskiSablon;
  };
  const r = await sablonTarihi('ornek.gov.tr', fikstur('sablon-a2.html'), { getir });
  assert.equal(r.sonFarkli, zamanlar[5]);
  assert.equal(r.oncekiAjans?.ad, 'Eski Ajans', `önceki ajans okunmadı: ${JSON.stringify(r.oncekiAjans)}`);
  assert.equal(r.oncekiAjans?.alan, 'eskiajans.com.tr');
});

test('K17 önceki ajans satırı — bulundu · imza yok · önceki şablon yok · ölçülemedi ayrı yazılır', async () => {
  const { kimlikSatirlari } = await import(join(kok, 'scripts', 'techlookup.mjs'));
  const alanAdi = { durum: 'tamam', alan: 'x.gov.tr', kaynak: 'TRABİS kaydı', kayit: '2012-03-05', bitis: '2027-03-04', kayitFirmasi: 'T', sahip: 'S' };
  const sablon = { durum: 'tamam', sonFarkli: '20221201000000', ilkAyni: '20230101000000', incelenen: 8 };
  const satir = (t) => kimlikSatirlari({ alanAdi, ajans: null, sablon: t }).find((x) => x[1] === 'Önceki siteyi yapan ajans');
  const var_ = satir({ ...sablon, oncekiAjans: { ad: 'Eski Ajans', alan: 'eskiajans.com.tr', kanit: 'alt bilgi' } });
  assert.equal(var_?.[0], '✅');
  assert.match(var_[2], /Eski Ajans/);
  assert.match(var_[3], /Aralık 2022/, 'hangi arşiv kaydına bakıldığı yazılmalı');
  assert.equal(satir({ ...sablon, oncekiAjans: null })[0], '➖');
  assert.match(satir({ ...sablon, oncekiAjans: null })[2], /imza bulunamadı/);
  assert.match(satir({ ...sablon, sonFarkli: null })[2], /önceki şablon yok/);
  assert.equal(satir({ durum: 'ölçülemedi (archive.org: ECONNREFUSED)' })[0], '⚠️');
});

test('K30 arşivde ilk görülme — ilk ay ve kayıtlı ay sayısı, şablon izi olmasa da; ek istek yok', async () => {
  const { sablonTarihi } = await kimlik();
  const { kimlikSatirlari } = await import(join(kok, 'scripts', 'techlookup.mjs'));
  const zamanlar = ['20090315000000', '20100601000000', '20240101000000'];
  const istekler = [];
  const getir = async (u) => {
    istekler.push(u);
    if (u.includes('/cdx/')) return JSON.stringify([['timestamp'], ...zamanlar.map((z) => [z])]);
    throw new Error('beklenmedik arşiv kaydı isteği');
  };
  const r = await sablonTarihi('ornek.gov.tr', '<html><body>x</body></html>', { getir });
  assert.match(r.durum, /şablon izi yok/);
  assert.equal(r.ilkKayit, '20090315000000');
  assert.equal(r.aySayisi, 3);
  assert.equal(istekler.length, 1, `ilk görülme için ek istek atıldı: ${istekler}`);
  const satir = (t) => kimlikSatirlari({ alanAdi: { durum: 'ölçülemedi' }, ajans: null, sablon: t }).find((x) => x[1] === 'Arşivde ilk görülme');
  const v = satir(r);
  assert.equal(v?.[0], '✅', JSON.stringify(v));
  assert.match(v[2], /Mart 2009/);
  assert.match(v[2], /3 ay/);
  const bos = await sablonTarihi('ornek.gov.tr', fikstur('sablon-a2.html'), { getir: async () => JSON.stringify([['timestamp']]) });
  assert.equal(satir(bos)?.[0], '➖', JSON.stringify(satir(bos)));
  assert.equal(satir({ durum: 'ölçülemedi (archive.org: ECONNREFUSED)' })?.[0], '⚠️');
});
