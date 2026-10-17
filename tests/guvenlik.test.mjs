// SSL ve güvenlik eki ölçütleri — `node --test tests/guvenlik.test.mjs`
// K31a/b çerez bayrakları (değer sızmaz) · K32 yönlendirme zinciri + HSTS önyükleme · K33 sertifika kapsamı
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { sertifikaKapsami, hstsKosullari, yonlendirmeZinciri } from '../scripts/guvenlik.mjs';

const kok = dirname(dirname(fileURLToPath(import.meta.url)));
const betik = join(kok, 'scripts', 'techlookup.mjs');
const koş = promisify(execFile);
const DEGER = 'DEGER-SIZMAMALI-91';

let sunucu, taban;
before(async () => {
  sunucu = http.createServer((istek, cevap) => {
    const yonlendir = (kod, yer) => { cevap.writeHead(kod, { location: yer }); cevap.end(); };
    if (istek.url === '/') return yonlendir(301, '/a?sid=GIZLI123');
    if (istek.url.startsWith('/a')) return yonlendir(301, '/b;jsessionid=GIZLI456');
    if (istek.url.startsWith('/dis')) return yonlendir(302, 'http://baska.example.org/x?t=GIZLI789');
    if (istek.url.startsWith('/dongu')) return yonlendir(302, '/dongu');
    cevap.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'set-cookie': [`oturum=${DEGER}; HttpOnly; SameSite=Lax; Path=/`, 'tercih=koyu; Path=/'],
    });
    cevap.end(readFileSync(join(kok, 'tests', 'fikstur', 'statik.html')));
  });
  await new Promise((r) => sunucu.listen(0, '127.0.0.1', r));
  taban = `http://127.0.0.1:${sunucu.address().port}`;
});
after(() => sunucu.close());

async function tara(...arg) {
  const { stdout } = await koş('node', [betik, ...arg, '--json'], { timeout: 90_000, maxBuffer: 50e6 });
  return { ham: stdout, r: JSON.parse(stdout) };
}

function cerezKontrol(ham, r) {
  const liste = r.guvenlikEk?.cerezler?.liste;
  assert.ok(Array.isArray(liste), `çerez listesi yok: ${JSON.stringify(r.guvenlikEk?.cerezler)}`);
  const o = liste.find((c) => c.ad === 'oturum');
  assert.ok(o, 'oturum çerezi listede yok');
  assert.equal(o.httpOnly, true);
  assert.equal(o.secure, false);
  assert.equal(o.sameSite, 'Lax');
  assert.equal(liste.find((c) => c.ad === 'tercih')?.httpOnly, false);
  // tarayıcıda sayfanın betikleri de çerez bırakır: toplam değişir, HttpOnly yalnız sunucu çerezinde olur
  assert.match(r.guvenlikEk.cerezler.deger, /HttpOnly 1\/\d+/);
  assert.ok(!ham.includes(DEGER), 'çerez değeri --json çıktısına sızdı');
  assert.ok(!r.markdown.includes(DEGER), 'çerez değeri tabloya sızdı');
}

test('K31a çerez bayrakları — Set-Cookie yolu (tarayıcısız), değer sızmaz', async () => {
  const { ham, r } = await tara(`${taban}/b`, '--statik');
  cerezKontrol(ham, r);
  assert.match(r.guvenlikEk.cerezler.kanit, /Set-Cookie/);
});

test('K31b çerez bayrakları — tarayıcı yolu (Network.getCookies), değer sızmaz', async () => {
  const { ham, r } = await tara(`${taban}/b`);
  assert.equal(r.durum.tarayici, 'tamam', `tarayıcı katmanı: ${r.durum.tarayici}`);
  cerezKontrol(ham, r);
  assert.match(r.guvenlikEk.cerezler.kanit, /tarayıcı/);
});

test('K32 yönlendirme zinciri — adımlar sorgusuz yazılır, başka alana geçince durur, döngüde durur', async () => {
  const z = await yonlendirmeZinciri(`${taban}/`);
  assert.equal(z.durum, 'var');
  assert.deepEqual(z.adimlar.map((a) => a.kod), [301, 301, 200]);
  assert.equal(z.adimlar[1].adres, `${taban}/a`);
  assert.equal(z.adimlar[2].adres, `${taban}/b`);
  const metin = JSON.stringify(z);
  for (const g of ['GIZLI123', 'GIZLI456', 'sid=', 'jsessionid']) assert.ok(!metin.includes(g), `${g} çıktıya girdi`);

  const dis = await yonlendirmeZinciri(`${taban}/dis`);
  assert.equal(dis.adimlar.at(-1).adres, 'http://baska.example.org/x');
  assert.match(dis.deger, /başka alan/);
  assert.ok(!JSON.stringify(dis).includes('GIZLI789'));

  const dongu = await yonlendirmeZinciri(`${taban}/dongu`);
  assert.ok(dongu.adimlar.length <= 3, `döngüde durmadı: ${dongu.adimlar.length} adım`);
  assert.match(dongu.deger, /döngü/);
});

test('K32 HSTS önyükleme — üç koşul ayrı ayrı', () => {
  const tam = hstsKosullari('max-age=63072000; includeSubDomains; preload');
  assert.equal(tam.durum, 'var');
  assert.deepEqual([tam.maxAge, tam.altAlanlar, tam.preload], [true, true, true]);
  const yarim = hstsKosullari('max-age=86400');
  assert.equal(yarim.durum, 'yok');
  assert.deepEqual([yarim.maxAge, yarim.altAlanlar, yarim.preload], [false, false, false]);
  assert.match(yarim.deger, /max-age/);
  const yok = hstsKosullari(undefined);
  assert.equal(yok.durum, 'yok');
  assert.match(yok.deger, /başlığı yok/);
});

test('K33 sertifika kapsamı — adlar ve kalan gün', () => {
  const s = sertifikaKapsami({ subjectaltname: 'DNS:example.com, DNS:www.example.com, IP Address:192.0.2.1', valid_to: 'Jan 14 12:00:00 2027 GMT' }, new Date('2026-10-17T12:00:00Z'));
  assert.deepEqual(s.adlar, ['example.com', 'www.example.com']);
  assert.equal(s.kalanGun, 89);
  assert.equal(s.durum, 'var');
  assert.match(s.deger, /89 gün/);
  const cok = sertifikaKapsami({ subjectaltname: Array.from({ length: 12 }, (_, i) => `DNS:a${i}.example.com`).join(', '), valid_to: 'Jan 14 12:00:00 2027 GMT' }, new Date('2026-10-17T12:00:00Z'));
  assert.match(cok.deger, /\+6 ad daha/);
});
