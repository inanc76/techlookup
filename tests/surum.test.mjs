// /techlookup sürüm ölçütleri — `node --test ~/.claude/skills/techlookup/tests/surum.test.mjs`
// K18 sürüm bilgisi (npm + endoflife.date) · K19 tablo hücreleri
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const kok = dirname(dirname(fileURLToPath(import.meta.url)));
const fikstur = (ad) => readFileSync(join(kok, 'tests', 'fikstur', ad), 'utf8');
const KAYITLAR = {
  'https://registry.npmjs.org/angular': 'npm-angular.json',
  'https://registry.npmjs.org/sweetalert2': 'npm-sweetalert2.json',
  'https://endoflife.date/api/php.json': 'eol-php.json',
};
const sahte = async (u) => {
  if (!KAYITLAR[u]) throw new Error(`beklenmeyen istek: ${u}`);
  return JSON.parse(fikstur(KAYITLAR[u]));
};

test('K18 sürüm bilgisi — çıkış yılı ve güncel sürüm kaynaktan gelir, tahmin edilmez', async () => {
  const { surumBilgisi } = await import(join(kok, 'scripts', 'surum.mjs'));
  const opt = { getir: sahte, onbellek: false };

  const a = await surumBilgisi('AngularJS', '1.7.8', opt);
  assert.equal(a.durum, 'tamam');
  assert.equal(a.yil, '2019', 'kullanıcının tahmini 2020 idi — kaynak 2019 diyor');
  assert.equal(a.guncel, '1.8.3');
  assert.equal(a.guncelYil, '2022');

  // sweetalert2@11 gibi eksik sürüm: o hattın ilk çıkışı, "≥" ile
  const s = await surumBilgisi('SweetAlert2', '11', opt);
  assert.equal(s.yil, '≥2021');

  // PHP 5.6.40 = 5.6 ailesinin son sürümü → tam tarih; 5.6.3 → yalnız aile yılı
  const p = await surumBilgisi('PHP', '5.6.40', opt);
  assert.equal(p.yil, '2019');
  assert.equal(p.guncel, '8.5.11');
  assert.equal(p.guncelYil, '2026');
  assert.equal((await surumBilgisi('PHP', '5.6.3', opt)).yil, 'aile: 2014');

  // kaynağı olmayan teknoloji: istek bile atılmaz, "kaynakta yok"
  assert.equal((await surumBilgisi('IIS', '10.0', opt)).durum, 'kaynakta yok');
  // sürüm sayı değilse (GA4, UA) bakılmaz
  assert.equal(await surumBilgisi('Google Analytics', 'GA4', opt), null);
  // kaynak cevap vermezse ölçülemedi — "kaynakta yok" DEĞİL
  const h = await surumBilgisi('AngularJS', '1.7.8', { getir: async () => { throw new Error('ETIMEDOUT'); }, onbellek: false });
  assert.match(h.durum, /^ölçülemedi/);
  // kaynakta o sürüm yoksa uydurulmaz
  assert.equal((await surumBilgisi('AngularJS', '9.9.9', opt)).yil, null);
});

test('K19 tablo hücreleri — sürüm (yıl) · güncel (yıl) · durumlar ayrı', async () => {
  const { surumHucreleri } = await import(join(kok, 'scripts', 'techlookup.mjs'));
  assert.deepEqual(surumHucreleri({ surum: '1.7.8', surumBilgi: { durum: 'tamam', yil: '2019', guncel: '1.8.3', guncelYil: '2022' } }), ['1.7.8 (2019)', '1.8.3 (2022)']);
  assert.deepEqual(surumHucreleri({ surum: '1.8.3', surumBilgi: { durum: 'tamam', yil: '2022', guncel: '1.8.3', guncelYil: '2022' } }), ['1.8.3 (2022)', '= güncel']);
  assert.deepEqual(surumHucreleri({ surum: '10.0', surumBilgi: { durum: 'kaynakta yok' } }), ['10.0', '➖ kaynakta yok']);
  assert.deepEqual(surumHucreleri({ surum: '1.7.8', surumBilgi: { durum: 'ölçülemedi (ETIMEDOUT)' } }), ['1.7.8', '⚠️ ölçülemedi']);
  assert.deepEqual(surumHucreleri({ surum: null }), ['', '']);
  assert.deepEqual(surumHucreleri({ surum: 'GA4', surumBilgi: null }), ['GA4', '']);
});
