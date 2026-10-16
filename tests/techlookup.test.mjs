// /techlookup ölçütleri — `node --test ~/.claude/skills/techlookup/tests/`
// K1 kimlik · K2 tarayıcı · K3 ölçülemedi · K4 dns · K7 temizlik (koruma)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const kok = dirname(dirname(fileURLToPath(import.meta.url)));
const betik = join(kok, 'scripts', 'techlookup.mjs');
const koş = promisify(execFile);

let sunucu, taban;
before(async () => {
  sunucu = http.createServer((istek, cevap) => {
    const ad = istek.url === '/calisma-ani' ? 'calisma-ani.html' : 'statik.html';
    cevap.writeHead(200, { 'content-type': 'text/html; charset=utf-8', server: 'nginx/1.25.3' });
    cevap.end(readFileSync(join(kok, 'tests', 'fikstur', ad)));
  });
  await new Promise((r) => sunucu.listen(0, '127.0.0.1', r));
  taban = `http://127.0.0.1:${sunucu.address().port}`;
});
after(() => sunucu.close());

async function calistir(...arg) {
  try {
    const { stdout } = await koş('node', [betik, ...arg, '--json'], { timeout: 90_000 });
    return { cikis: 0, ...JSON.parse(stdout) };
  } catch (e) {
    if (e.stdout) return { cikis: e.code, ...JSON.parse(e.stdout) };
    throw e;
  }
}

const adlar = (sonuc, grup) => (sonuc.gruplar[grup] ?? []).map((t) => t.ad);
const tumAdlar = (sonuc) => Object.values(sonuc.gruplar).flat().map((t) => t.ad);

test('K1 kimlik — doğru gruba düşer, kanıtı vardır, dışlananlar basılmaz', async () => {
  const s = await calistir(taban + '/');
  assert.equal(s.cikis, 0);
  assert.equal(s.durum.tarayici, 'tamam', `tarayıcı katmanı: ${s.durum.tarayici}`);
  assert.ok(adlar(s, 'CMS').includes('WordPress'), 'WordPress CMS grubunda değil');
  assert.ok(adlar(s, 'Etiket yöneticisi').includes('Google Tag Manager'), 'GTM yok');
  assert.ok(adlar(s, 'Reklam pikselleri').includes('Facebook Pixel'), 'Facebook Pixel reklam grubunda değil');
  assert.ok(adlar(s, 'Çerez onayı').includes('Cookiebot'), 'Cookiebot yok');
  assert.ok(adlar(s, 'Frontend').includes('jQuery'), 'jQuery yok');
  const wp = s.gruplar.CMS.find((t) => t.ad === 'WordPress');
  assert.equal(wp.surum, '6.6.2');
  assert.ok(wp.kanit && wp.kanit.length > 0, 'kanıt boş');
  const hepsi = tumAdlar(s);
  // dışlama ancak teknoloji gerçekten YAKALANDIYSA bir şey ölçer — önce yakalandığını kanıtla
  for (const yasak of ['Google Font API', 'YouTube', 'iyzico', 'Hotjar']) {
    assert.ok((s.dislanan ?? []).includes(yasak), `${yasak} hiç yakalanmadı — dışlama kontrolü boşa koşar`);
    assert.ok(!hepsi.includes(yasak), `${yasak} basılmamalıydı`);
  }
});

test('K2 tarayıcı — çalışma anında eklenen piksel yalnız tarayıcı katmanında bulunur', async () => {
  const statik = await calistir(taban + '/calisma-ani', '--statik');
  assert.ok(!tumAdlar(statik).includes('Facebook Pixel'), 'statik katman pikseli görmemeliydi');
  const tam = await calistir(taban + '/calisma-ani');
  assert.equal(tam.durum.tarayici, 'tamam', `tarayıcı katmanı: ${tam.durum.tarayici}`);
  assert.ok(adlar(tam, 'Reklam pikselleri').includes('Facebook Pixel'), 'tarayıcı katmanı pikseli bulamadı');
});

test('K3 ölçülemedi — var olmayan alan adı çıkış 2 ve ÖLÇÜLEMEDİ verir', async () => {
  const s = await calistir('bu-alan-adi-yok-xyz123.com.tr');
  assert.equal(s.cikis, 2);
  assert.match(s.markdown, /ÖLÇÜLEMEDİ/);
  assert.doesNotMatch(s.markdown, /bulunamadı/);
});

test('K4 dns — kayıtlardan sağlayıcı çıkar', async () => {
  const { dnsYorumla } = await import(join(kok, 'scripts', 'dns.mjs'));
  const y = dnsYorumla({
    mx: ['1 aspmx.l.google.com.', '5 alt1.aspmx.l.google.com.'],
    txt: [
      'v=spf1 include:_spf.google.com include:servers.mcsv.net ~all',
      'facebook-domain-verification=abc123',
    ],
    ns: ['ns1.natrohost.com.'],
  });
  const ad = (l) => l.map((x) => x.ad);
  assert.ok(ad(y.eposta).includes('Google Workspace'));
  assert.ok(ad(y.eposta).includes('Mailchimp'));
  assert.ok(ad(y.dogrulama).includes('Facebook'));
  assert.ok(ad(y.barindirma).includes('Natro'));

  // tanınmayan MX "bulunamadı" sayılmaz — kendi sunucusu olarak raporlanır
  const k = dnsYorumla({ mx: ['10 smtp1-dca.wordpress.org.'], txt: ['v=spf1 ip4:1.2.3.0/24 include:helpscoutemail.com -all'], ns: [] });
  assert.ok(ad(k.eposta).includes('Help Scout'), 'Help Scout SPF tanınmadı');
  assert.ok(k.eposta.some((x) => /kendi sunucusu/i.test(x.ad) && /smtp1-dca\.wordpress\.org/.test(x.kanit)), 'tanınmayan MX raporlanmadı');
});

test('K8 gizlilik — çerez kanıtında değer değil yalnız ad yazılır', async () => {
  const { veritabaniDerle, eslestir } = await import(join(kok, 'scripts', 'eslesme.mjs'));
  const db = veritabaniDerle({ Ornek: { cats: [10], cookies: { _ornek: '' } } });
  const [b] = eslestir(db, { cookies: { _ornek: 'GIZLI-DEGER-123' } });
  assert.ok(b, 'çerezden bulunamadı');
  assert.ok(b.kanit.every((k) => !k.includes('GIZLI-DEGER-123')), `kanıtta çerez değeri var: ${b.kanit}`);
});

test('K7 temizlik (koruma) — geçici Chrome profili kalmaz', () => {
  const kalan = readdirSync(tmpdir()).filter((a) => a.startsWith('techlookup-'));
  assert.deepEqual(kalan, []);
});

test('K9 gruplama — e-posta servisleri CRM değil E-posta altyapısı grubuna düşer', async () => {
  const { grupla } = await import(join(kok, 'scripts', 'kategoriler.mjs'));
  const { gruplar } = grupla([
    { ad: 'Google Workspace', kategoriler: [30, 75], kanit: [] },
    { ad: 'Amazon SES', kategoriler: [75], kanit: [] },
  ]);
  assert.deepEqual((gruplar['E-posta altyapısı'] ?? []).map((x) => x.ad), ['Amazon SES', 'Google Workspace']);
  assert.equal(gruplar['Canlı destek / CRM'], undefined);
});
