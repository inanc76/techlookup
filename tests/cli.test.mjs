// Komut satırı ve paket ölçütleri — `node --test tests/cli.test.mjs`
// K-CLI kurulum · yeniden kurulum · proje kurulumu · kaldırma · doğrudan tarama · yardım
// K-PAKET pakete giren / girmeyen dosyalar
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const kok = dirname(dirname(fileURLToPath(import.meta.url)));
const bin = join(kok, 'bin', 'techlookup.mjs');
const koş = promisify(execFile);
const geciciler = [];
const gecici = (ad) => { const d = mkdtempSync(join(tmpdir(), `tl-${ad}-`)); geciciler.push(d); return d; };

async function cagir(arg, { home, cwd } = {}) {
  try {
    const r = await koş('node', [bin, ...arg], { cwd: cwd ?? kok, env: { ...process.env, HOME: home ?? process.env.HOME }, timeout: 90_000 });
    return { cikis: 0, ...r };
  } catch (e) {
    return { cikis: e.code, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

let sunucu, taban;
before(async () => {
  sunucu = http.createServer((_, c) => { c.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); c.end(readFileSync(join(kok, 'tests', 'fikstur', 'ajans.html'))); });
  await new Promise((r) => sunucu.listen(0, '127.0.0.1', r));
  taban = `http://127.0.0.1:${sunucu.address().port}`;
});
after(() => { sunucu.close(); for (const d of geciciler) rmSync(d, { recursive: true, force: true }); });

test('K-CLI yardım — kullanım metni basar', async () => {
  const r = await cagir(['--yardim']);
  assert.equal(r.cikis, 0);
  assert.match(r.stdout, /techlookup kur/);
  assert.match(r.stdout, /techlookup <adres>/);
});

test('K-CLI kur — global skill kurulur, yeniden kurulumda önbellek ve yabancı dosya korunur', async () => {
  const home = gecici('home');
  const r = await cagir(['kur'], { home });
  assert.equal(r.cikis, 0, r.stderr);
  const hedef = join(home, '.claude', 'skills', 'techlookup');
  for (const f of ['SKILL.md', 'scripts/techlookup.mjs', 'scripts/kimlik.mjs', 'scripts/surum.mjs']) assert.ok(existsSync(join(hedef, f)), `${f} kurulmadı`);
  assert.ok(!existsSync(join(hedef, 'tests')), 'ölçütler kuruluma girmemeli');
  assert.match(readFileSync(join(hedef, 'SKILL.md'), 'utf8'), /node ~\/\.claude\/skills\/techlookup\/scripts\/techlookup\.mjs/);

  mkdirSync(join(hedef, 'veri'), { recursive: true });
  writeFileSync(join(hedef, 'veri', 'onbellek.json'), '{}');
  writeFileSync(join(hedef, 'notum.md'), 'benim');
  writeFileSync(join(hedef, 'scripts', 'techlookup.mjs'), '// bozuk');
  assert.equal((await cagir(['kur'], { home })).cikis, 0);
  assert.ok(existsSync(join(hedef, 'veri', 'onbellek.json')), 'yeniden kurulum önbelleği sildi');
  assert.equal(readFileSync(join(hedef, 'notum.md'), 'utf8'), 'benim', 'yeniden kurulum yabancı dosyaya dokundu');
  assert.notEqual(readFileSync(join(hedef, 'scripts', 'techlookup.mjs'), 'utf8'), '// bozuk', 'yeniden kurulum betiği tazelemedi');
});

test('K-CLI kur --proje — projeye kurulur, komut yolu göreli', async () => {
  const home = gecici('home');
  const proje = gecici('proje');
  const r = await cagir(['kur', '--proje'], { home, cwd: proje });
  assert.equal(r.cikis, 0, r.stderr);
  const skill = readFileSync(join(proje, '.claude', 'skills', 'techlookup', 'SKILL.md'), 'utf8');
  assert.match(skill, /node \.claude\/skills\/techlookup\/scripts\/techlookup\.mjs/);
  assert.doesNotMatch(skill, /~\/\.claude/, 'proje kurulumu global yolu gösteriyor');
  assert.ok(!existsSync(join(home, '.claude', 'skills', 'techlookup')), 'proje kurulumu global kataloğa da yazdı');
});

test('K-CLI kaldır — yalnız kendi kurduğu dosyaları siler', async () => {
  const home = gecici('home');
  await cagir(['kur'], { home });
  const hedef = join(home, '.claude', 'skills', 'techlookup');
  mkdirSync(join(hedef, 'veri'), { recursive: true });
  writeFileSync(join(hedef, 'veri', 'onbellek.json'), '{}');
  writeFileSync(join(hedef, 'notum.md'), 'benim');
  const r = await cagir(['kaldir'], { home });
  assert.equal(r.cikis, 0, r.stderr);
  assert.ok(!existsSync(join(hedef, 'SKILL.md')), 'SKILL.md kaldı');
  assert.ok(!existsSync(join(hedef, 'scripts')), 'scripts kaldı');
  assert.ok(!existsSync(join(hedef, 'veri')), 'önbellek kaldı');
  assert.equal(readFileSync(join(hedef, 'notum.md'), 'utf8'), 'benim', 'kaldırma yabancı dosyayı sildi');
  // hiç kurulmamışken kaldırma hata değildir
  assert.equal((await cagir(['kaldir'], { home: gecici('bos') })).cikis, 0);
});

test('K-CLI doğrudan tarama — Claude olmadan tabloyu basar', async () => {
  const r = await cagir([`${taban}/`, '--statik']);
  assert.equal(r.cikis, 0, r.stderr);
  assert.match(r.stdout, /Site kimliği/);
  assert.match(r.stdout, /Örnek Dijital Ajans/);
  const j = await cagir([`${taban}/`, '--statik', '--json']);
  assert.equal(JSON.parse(j.stdout).cikis, 0);
});

test('K-PAKET — ürün dosyaları girer, ölçüt ve önbellek girmez', async () => {
  const { stdout } = await koş('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: kok, timeout: 60_000 });
  const yollar = JSON.parse(stdout)[0].files.map((f) => f.path);
  for (const y of ['bin/techlookup.mjs', 'scripts/techlookup.mjs', 'SKILL.md', 'README.md', 'LICENSE', 'package.json']) assert.ok(yollar.includes(y), `${y} pakette yok`);
  for (const y of yollar) assert.ok(!/^(tests|veri|gecici)\//.test(y) && !y.includes('.yedek-'), `${y} pakete girmemeli`);
});
