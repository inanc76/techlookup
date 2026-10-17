// Belge ölçütleri — `node --test tests/belge.test.mjs`
// K-KAYNAK: koddaki her dış uç README'nin Gizlilik tablosunda yazılı; tabloda koda karşılığı olmayan uç yok
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kayitliAlan } from '../scripts/kimlik.mjs';

const kok = dirname(dirname(fileURLToPath(import.meta.url)));

/** Kodun konuştuğu sabit dış uçlar: https adresleri · whois -h sunucusu · dig ile sorulan sabit sonek. */
function koddakiUclar() {
  const uclar = new Set();
  for (const f of readdirSync(join(kok, 'scripts')).filter((x) => x.endsWith('.mjs'))) {
    const metin = readFileSync(join(kok, 'scripts', f), 'utf8');
    for (const m of metin.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) uclar.add(m[1]);
    for (const m of metin.matchAll(/'-h',\s*'([a-z0-9.-]+)'/gi)) uclar.add(m[1]);
    for (const m of metin.matchAll(/\$\{[^}]+\}\.((?:[a-z0-9-]+\.)+[a-z]{2,})`/gi)) uclar.add(m[1]);
  }
  return new Set([...uclar].filter((h) => !/^(127\.|localhost|example\.)/.test(h) && !/\.example$/.test(h)).map(kayitliAlan));
}

function gizlilikBolumu() {
  const readme = readFileSync(join(kok, 'README.md'), 'utf8');
  const bas = readme.indexOf('## Gizlilik');
  assert.ok(bas >= 0, 'README Gizlilik bölümü yok');
  const son = readme.indexOf('\n## ', bas + 5);
  return { readme, bolum: readme.slice(bas, son < 0 ? undefined : son) };
}

test('K-KAYNAK — koddaki dış uçlar ile README Gizlilik tablosu birebir', () => {
  const kod = koddakiUclar();
  const { readme, bolum } = gizlilikBolumu();
  assert.ok(kod.size >= 5, `koddan çok az uç çıktı (${[...kod]}) — çıkarıcı bozuk`);
  const tablodakiler = new Set([...bolum.matchAll(/^\|[^|\n]*`([a-z0-9.-]+\.[a-z]{2,})`/gim)].map((m) => kayitliAlan(m[1])));
  const eksik = [...kod].filter((h) => !tablodakiler.has(h));
  const fazla = [...tablodakiler].filter((h) => !kod.has(h));
  assert.deepEqual(eksik, [], `kodda var, Gizlilik tablosunda yok: ${eksik.join(', ')}`);
  assert.deepEqual(fazla, [], `Gizlilik tablosunda var, kodda yok: ${fazla.join(', ')}`);
  assert.ok(!readme.includes('hiçbir yere veri göndermez'), '"hiçbir yere veri göndermez" cümlesi hâlâ duruyor');
});
