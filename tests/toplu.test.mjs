// Toplu tarama ölçütü — `node --test tests/toplu.test.mjs`
// K36 sabit sütunlu CSV · kaldığı yerden sürer · yarım satır kesilir · formül etkisiz · başlığı uymayan dosyaya dokunulmaz
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, writeFileSync, appendFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SUTUNLAR, csvHucre, csvAyristir } from '../scripts/toplu.mjs';

const kok = dirname(dirname(fileURLToPath(import.meta.url)));
const koş = promisify(execFile);
let sunucu, taban, dizin;
before(async () => {
  const html = readFileSync(join(kok, 'tests', 'fikstur', 'statik.html'));
  sunucu = http.createServer((i, c) => {
    if (i.url === '/humans.txt') { c.writeHead(200, { 'content-type': 'text/plain' }); return c.end('/* TEAM */\nDesigner: =HYPERLINK(1) Acme, "Inc"\n'); }
    if (i.url === '/') { c.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return c.end(html); }
    c.writeHead(404); c.end('yok');
  });
  await new Promise((r) => sunucu.listen(0, '127.0.0.1', r));
  taban = `http://127.0.0.1:${sunucu.address().port}`;
  dizin = mkdtempSync(join(tmpdir(), 'techlookup-toplu-test-'));
});
after(() => { sunucu.close(); rmSync(dizin, { recursive: true, force: true }); });

async function toplu(liste, cikti) {
  try {
    const { stdout, stderr } = await koş('node', [join(kok, 'bin', 'techlookup.mjs'), '--liste', liste, '--cikti', cikti, '--statik'], { timeout: 240_000 });
    return { cikis: 0, stdout, stderr };
  } catch (e) {
    return { cikis: e.code, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}
const oku = (dosya) => csvAyristir(readFileSync(dosya, 'utf8').replace(/^﻿/, ''));

test('K36 hücre — RFC 4180 tırnak, formül öneki, satır sonu boşluğa; ayrıştırıcı geri okur', () => {
  assert.equal(csvHucre('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
  for (const b of ['+1', '-1', '@x', '\tx', '\rx']) assert.ok(csvHucre(b).replace(/^"/, '').startsWith("'"), `${JSON.stringify(b)} öneksiz`);
  assert.equal(csvHucre('Acme, "Inc"'), '"Acme, ""Inc"""');
  assert.equal(csvHucre('a\nb'), 'a b');
  assert.equal(csvHucre('düz'), 'düz');
  assert.deepEqual(csvAyristir('a,"b, ""c""",d\n1,2,3\n'), [['a', 'b, "c"', 'd'], ['1', '2', '3']]);
});

test('K36 toplu tarama — sabit sütun, kaldığı yerden sürer, yarım satır kesilir, uymayan başlıkta dokunmaz', async () => {
  const liste = join(dizin, 'siteler.txt');
  const cikti = join(dizin, 'sonuc.csv');
  writeFileSync(liste, `# yorum satırı\n\n${taban}/\nolmayan-alan-adi.invalid\n`);

  const k1 = await toplu(liste, cikti);
  assert.equal(k1.cikis, 2, `en az biri ölçülemedi → 2 (stderr: ${k1.stderr.slice(-300)})`);
  assert.ok(existsSync(cikti), `CSV yazılmadı (stdout: ${k1.stdout.slice(0, 200)})`);
  const s1 = oku(cikti);
  assert.deepEqual(s1[0], SUTUNLAR, 'başlık sütun listesiyle aynı değil');
  assert.equal(s1.length, 3, `başlık + 2 satır bekleniyordu: ${s1.length}`);
  for (const s of s1) assert.equal(s.length, SUTUNLAR.length, 'satırların sütun sayısı eşit değil');
  // sütunlar 7 bölüm sırasıyla
  const ilk = (on) => SUTUNLAR.findIndex((c) => c.startsWith(on));
  const sira = ['kimlik_', 'teknoloji_', 'dns_', 'eposta_', 'ssl_', 'dosya_', 'paylasim_'].map(ilk);
  assert.ok(sira.every((x) => x > 0), `bölüm öneki eksik: ${sira}`);
  assert.deepEqual([...sira].sort((a, b) => a - b), sira, 'bölüm sırası bozuk');
  assert.equal(SUTUNLAR[0], 'techlookup_surum');
  assert.ok(!SUTUNLAR.some((c) => /sahib|eposta_adres|mail/.test(c)), 'kişi/e-posta sütunu var');
  const col = (s, ad) => s[SUTUNLAR.indexOf(ad)];
  const [, yerel, yok] = s1;
  assert.equal(col(yerel, 'durum'), 'tamam');
  assert.equal(col(yok, 'durum'), 'ölçülemedi');
  assert.match(col(yerel, 'kimlik_ajans'), /Acme, "Inc"/);
  assert.match(col(yerel, 'dosya_humans'), /^✅/);

  // ikinci koşu: tamam olan atlanır, ölçülemedi olan yeniden denenip sona eklenir
  const k2 = await toplu(liste, cikti);
  assert.equal(k2.cikis, 2);
  const s2 = oku(cikti);
  assert.equal(s2.length, 4, `ikinci koşuda ${s2.length - 1} satır`);
  assert.equal(s2.filter((s) => col(s, 'host') === col(yerel, 'host')).length, 1, 'tamam olan site yeniden tarandı');
  assert.equal(col(s2[3], 'host'), 'olmayan-alan-adi.invalid');

  // yarım son satır kesilir
  appendFileSync(cikti, '1.1.0,yarim-satir,"kapanmamis');
  const k3 = await toplu(liste, cikti);
  assert.equal(k3.cikis, 2);
  const ham3 = readFileSync(cikti, 'utf8');
  assert.ok(!ham3.includes('yarim-satir'), 'yarım satır kesilmedi');
  assert.ok(ham3.endsWith('\n'));
  assert.equal(oku(cikti).length, 5);

  // başlığı uymayan var olan dosya: hiçbir şey yazılmaz, çıkış 1
  const yabanci = join(dizin, 'yabanci.csv');
  writeFileSync(yabanci, 'a,b,c\n1,2,3\n');
  const k4 = await toplu(liste, yabanci);
  assert.equal(k4.cikis, 1);
  assert.equal(readFileSync(yabanci, 'utf8'), 'a,b,c\n1,2,3\n', 'uymayan dosya değişti');

  // liste okunamazsa çıkış 1
  const k5 = await toplu(join(dizin, 'yok.txt'), join(dizin, 'x.csv'));
  assert.equal(k5.cikis, 1);
});
