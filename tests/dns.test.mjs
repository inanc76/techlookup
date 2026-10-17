// DNS ve sunucu ölçütleri — `node --test tests/dns.test.mjs`
// K24 DNS güvenliği (DNSSEC · CAA · SOA · HTTPS kaydı) · K34 sunucu ülkesi + yeşil enerji
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dnsGuvenlik, sunucuBilgisi, guvenliAd } from '../scripts/dns.mjs';

const kok = dirname(dirname(fileURLToPath(import.meta.url)));
const F = JSON.parse(readFileSync(join(kok, 'tests', 'fikstur', 'dns-cevaplari.json'), 'utf8'));

// sahte dig: fikstürdeki ham çıktıyı verir; yoksa NXDOMAIN
const sahteCalistir = (cagrilar = []) => async (tur, ad, { sunucu } = {}) => {
  cagrilar.push(`${tur} ${ad}${sunucu ? ` @${sunucu}` : ''}`);
  const ham = sunucu ? F[`${tur} ${ad} @${sunucu}`] : F[`${tur} ${ad}`];
  if (ham === 'ZAMAN') return { zamanAsimi: true, stdout: ';; connection timed out; no servers could be reached\n' };
  return { stdout: ham ?? ';; ->>HEADER<<- opcode: QUERY, status: NXDOMAIN, id: 1\n' };
};

test('K24 DNS güvenliği — DNSSEC · CAA · SOA · HTTPS kaydı ham dig çıktısından', async () => {
  const a = await dnsGuvenlik('example.com', 'www.example.com', { calistir: sahteCalistir(), yedek: 'yok' });
  assert.equal(a.dnssec.durum, 'var');
  assert.match(a.dnssec.kanit, /DS: 2371 13 2/);
  assert.equal(a.caa.durum, 'var');
  assert.deepEqual(a.caa.issue, ['pki.goog']);
  assert.ok(!JSON.stringify(a).includes('guvenlik@example.com'), 'CAA iodef e-posta adresi çıktıya girdi');
  assert.equal(a.soa.durum, 'var');
  assert.equal(a.soa.birincil, 'ns1.example.net');
  assert.match(a.soa.deger, /yönetici adresi tanımlı/);
  assert.ok(!JSON.stringify(a.soa).includes('hostmaster'), 'SOA yönetici adresi çıktıya girdi');
  // RFC 3597 ham biçim (makinedeki dig 9.10.6)
  assert.equal(a.https.durum, 'var');
  assert.deepEqual(a.https.alpn, ['h3', 'h2']);

  // okunur biçim (yeni dig) — aynı alpn
  const n = await dnsGuvenlik('example.net', 'www.example.net', { calistir: sahteCalistir(), yedek: 'yok' });
  assert.deepEqual(n.https.alpn, ['h3', 'h2']);
  assert.match(n.https.deger, /ECH/);

  // DS yok · CAA yok · SOA SERVFAIL · HTTPS sorgusu A kaydı döndürdü
  const o = await dnsGuvenlik('example.org', 'www.example.org', { calistir: sahteCalistir(), yedek: 'yok' });
  assert.equal(o.dnssec.durum, 'yok');
  assert.equal(o.caa.durum, 'yok');
  assert.equal(o.soa.durum, 'olcmedi', 'SERVFAIL ölçülemedi olmalı, yok değil');
  assert.match(o.soa.deger, /SERVFAIL/);
  assert.equal(o.https.durum, 'olcmedi', 'A kaydı biçimli cevap HTTPS kaydı sayılmamalı');

  // zaman aşımı: yedek kapalıysa ölçülemedi; açıksa yedek çözümleyiciye bir kez gider ve kanıtta yazar
  const z = await dnsGuvenlik('example.edu', 'www.example.edu', { calistir: sahteCalistir(), yedek: 'yok' });
  assert.equal(z.https.durum, 'olcmedi');
  const cagrilar = [];
  F['TYPE65 www.example.edu @1.1.1.1'] = F['TYPE65 www.example.net'].replaceAll('example.net', 'example.edu');
  const y = await dnsGuvenlik('example.edu', 'www.example.edu', { calistir: sahteCalistir(cagrilar), yedek: '1.1.1.1' });
  assert.equal(y.https.durum, 'var');
  assert.match(y.https.kanit, /1\.1\.1\.1/);
  assert.ok(cagrilar.includes('TYPE65 www.example.edu @1.1.1.1'));
});

test('K24 ad süzgeci — seçenek ya da makro taşıyan ad dig\'e gitmez', () => {
  assert.equal(guvenliAd('_dmarc.example.com'), true);
  assert.equal(guvenliAd('AS13335.asn.cymru.com'), true);
  for (const k of ['-f/etc/passwd', '+tcp', '%{i}.example.com', 'a b.com', 'x'.repeat(254)]) assert.equal(guvenliAd(k), false, k);
});

test('K34 sunucu ülkesi + yeşil enerji — kaynak cevabından; hata ve 429 ölçülemedi', async () => {
  const getir = (cevaplar) => async (url) => {
    const c = cevaplar(url);
    if (c instanceof Error) return { durum: `ölçülemedi (${c.message})` };
    if (typeof c === 'number') return { durum: `HTTP ${c}`, kod: c };
    return { durum: 'tamam', kod: 200, govde: JSON.stringify(c) };
  };
  const tamam = await sunucuBilgisi('www.example.com', '192.0.2.10', {
    getir: getir((u) => (/ripe/.test(u) ? F['ripestat-ulke'] : F['greenweb-yesil'])),
  });
  assert.equal(tamam.ulke.durum, 'var');
  assert.equal(tamam.ulke.kod, 'CZ');
  assert.equal(tamam.yesil.durum, 'var');
  assert.match(tamam.yesil.deger, /Cloudflare/);

  const belirsiz = await sunucuBilgisi('www.example.org', '192.0.2.20', {
    getir: getir((u) => (/ripe/.test(u) ? F['ripestat-anycast'] : F['greenweb-kayitsiz'])),
  });
  assert.equal(belirsiz.ulke.durum, 'yok');
  assert.match(belirsiz.ulke.deger, /belirsiz/);
  assert.equal(belirsiz.yesil.durum, 'yok', 'kayıtsız site "yeşil değil" değil, kaydı yok');

  const hata = await sunucuBilgisi('www.example.org', '192.0.2.20', { getir: getir((u) => (/ripe/.test(u) ? 429 : new Error('ECONNRESET'))) });
  assert.equal(hata.ulke.durum, 'olcmedi');
  assert.match(hata.ulke.deger, /hız sınırı/);
  assert.equal(hata.yesil.durum, 'olcmedi');

  const ipsiz = await sunucuBilgisi('www.example.org', null, { getir: getir(() => F['greenweb-yesil']) });
  assert.equal(ipsiz.ulke.durum, 'olcmedi');
});
