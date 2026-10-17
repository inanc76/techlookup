// E-posta güvenliği ölçütleri — `node --test tests/eposta.test.mjs`
// K22 SPF · DMARC · MTA-STS · TLS-RPT · BIMI · K23 DKIM
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { epostaGuvenligi, DKIM_ADLARI } from '../scripts/eposta.mjs';

// dig +noall +comments +answer biçimi (gerçek yoklamayla aynı: 2026-10-17 _dmarc/_mta-sts/_smtp._tls/default._bimi)
const cevap = (ad, kayitlar) => `;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 1\n;; flags: qr rd ra; QUERY: 1, ANSWER: ${kayitlar.length}\n\n;; ANSWER SECTION:\n${kayitlar.map((k) => `${ad}.\t300\tIN\tTXT\t${k}`).join('\n')}\n`;
const NX = ';; ->>HEADER<<- opcode: QUERY, status: NXDOMAIN, id: 1\n';

function sahteDns(tablo, cagrilar = []) {
  return async (tur, ad) => {
    cagrilar.push(ad);
    const k = tablo[ad];
    if (k === 'ZAMAN') return { zamanAsimi: true };
    if (k === 'DIGYOK') return { digYok: true };
    return { stdout: k ? cevap(ad, [].concat(k)) : NX };
  };
}
const politikaYok = async () => ({ durum: 'HTTP 404', kod: 404 });
const durumlar = (s) => Object.values(s).map((x) => x.durum);

test('K22 e-posta kayıtları — SPF ağacı sayılır, DMARC/MTA-STS/TLS-RPT/BIMI ayrışır, adres basılmaz', async () => {
  const tablo = {
    'example.com': ['"v=spf1 include:_spf.example.net include:mail.example.org mx ~all"', '"google-site-verification=abc"'],
    '_spf.example.net': '"v=spf1 include:_spf2.example.net ip4:192.0.2.1 -all"',
    '_spf2.example.net': '"v=spf1 a ptr -all"',
    'mail.example.org': '"v=spf1 redirect=_spf.example.net"',
    '_dmarc.example.com': '"v=DMARC1; p=reject; sp=quarantine; pct=100; rua=mailto:dmarc-rapor@example.com"',
    '_mta-sts.example.com': '"v=STSv1; id=20210803T010101;"',
    '_smtp._tls.example.com': '"v=TLSRPTv1;rua=mailto:tls-rapor@example.com"',
    'default._bimi.example.com': '"v=BIMI1; l=https://logo.example.com/marka.svg; a=https://logo.example.com/vmc.pem"',
  };
  const politika = async (url) => (url === 'https://mta-sts.example.com/.well-known/mta-sts.txt'
    ? { durum: 'tamam', kod: 200, tur: 'text/plain', govde: 'version: STSv1\nmode: enforce\nmx: *.example.com\nmax_age: 86400\n' }
    : { durum: 'HTTP 404', kod: 404 });
  const e = await epostaGuvenligi('example.com', { calistir: sahteDns(tablo), yedek: 'yok', getir: politika });
  // include(1) → include(1) → a,ptr(2) · include(1) → redirect(1) → include(1) → a,ptr(2) · mx(1) = 10
  assert.equal(e.spf.durum, 'var');
  assert.equal(e.spf.sorgu, 10);
  assert.match(e.spf.deger, /10/);
  assert.match(e.spf.deger, /~all/);
  assert.equal(e.dmarc.durum, 'var');
  assert.equal(e.dmarc.p, 'reject');
  assert.equal(e.mtaSts.durum, 'var');
  assert.match(e.mtaSts.deger, /enforce/);
  assert.equal(e.tlsRpt.durum, 'var');
  assert.equal(e.bimi.durum, 'var');
  assert.match(e.bimi.deger, /VMC/);
  const metin = JSON.stringify(e);
  for (const adres of ['dmarc-rapor@', 'tls-rapor@', 'mailto:']) assert.ok(!metin.includes(adres), `${adres} çıktıya girdi`);

  // çözülemeyen include → sayı "en az", düz sayı basılmaz
  const yarim = await epostaGuvenligi('example.net', {
    calistir: sahteDns({ 'example.net': '"v=spf1 include:bozuk.example.net mx -all"', 'bozuk.example.net': 'ZAMAN' }), yedek: 'yok', getir: politikaYok,
  });
  assert.equal(yarim.spf.durum, 'olcmedi');
  assert.match(yarim.spf.deger, /en az 2 .*1 include çözülemedi/);
  assert.equal(yarim.spf.sorgu, undefined, 'eksik sayım tam sayı gibi verilmemeli');

  // seçenek / makro taşıyan ad dig'e hiç gitmez; sayılır ama "en az" olur
  const cagrilar = [];
  const zararli = await epostaGuvenligi('example.org', {
    calistir: sahteDns({ 'example.org': '"v=spf1 include:-f/etc/passwd include:+tcp exists:%{i}.example.org -all"' }, cagrilar), yedek: 'yok', getir: politikaYok,
  });
  for (const k of ['-f/etc/passwd', '+tcp', '%{i}.example.org']) assert.ok(!cagrilar.includes(k), `dig ${k} ile çağrıldı`);
  assert.equal(zararli.spf.durum, 'olcmedi');
  assert.match(zararli.spf.deger, /en az 3/);

  // MTA-STS kaydı var ama politika sertifikası geçersiz → ölçülemedi, var değil
  const sertifika = await epostaGuvenligi('example.edu', {
    calistir: sahteDns({ '_mta-sts.example.edu': '"v=STSv1; id=1;"' }), yedek: 'yok',
    getir: async () => ({ durum: 'ölçülemedi (CERT_HAS_EXPIRED)', kod: null }),
  });
  assert.equal(sertifika.mtaSts.durum, 'olcmedi');
  assert.match(sertifika.mtaSts.deger, /sertifika/);

  // hiçbir kayıt yok → hepsi bulunamadı (➖), hiçbiri ❌ değil
  const bos = await epostaGuvenligi('example.info', { calistir: sahteDns({}), yedek: 'yok', getir: politikaYok });
  for (const k of ['spf', 'dmarc', 'mtaSts', 'tlsRpt', 'bimi']) assert.equal(bos[k].durum, 'yok', k);
});

test('K23 DKIM — yaygın adlar denenir; bulunamadı ➖, kısmi ve dig yok ⚠️, asla ❌', async () => {
  const N = DKIM_ADLARI.length;
  assert.ok(N >= 25, `yaygın ad listesi çok kısa (${N})`);
  assert.ok(DKIM_ADLARI.includes('selector1') && DKIM_ADLARI.includes('google'), 'temel adlar listede yok');

  const bulundu = await epostaGuvenligi('example.com', {
    calistir: sahteDns({ 'selector1._domainkey.example.com': '"v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA"' }), yedek: 'yok', getir: politikaYok,
  });
  assert.equal(bulundu.dkim.durum, 'var');
  assert.match(bulundu.dkim.deger, /selector1/);

  const yok = await epostaGuvenligi('example.org', { calistir: sahteDns({}), yedek: 'yok', getir: politikaYok });
  assert.equal(yok.dkim.durum, 'yok');
  assert.match(yok.dkim.deger, new RegExp(`${N} yaygın ad`));

  const kisitli = Object.fromEntries(DKIM_ADLARI.slice(0, 3).map((s) => [`${s}._domainkey.example.net`, 'ZAMAN']));
  const kismi = await epostaGuvenligi('example.net', { calistir: sahteDns(kisitli), yedek: 'yok', getir: politikaYok });
  assert.equal(kismi.dkim.durum, 'olcmedi', 'bazı adlar sorgulanamadıysa "bulunamadı" denemez');
  assert.match(kismi.dkim.deger, new RegExp(`${N - 3}/${N}`));

  const digsiz = await epostaGuvenligi('example.edu', { calistir: async () => ({ digYok: true }), yedek: 'yok', getir: politikaYok });
  assert.equal(digsiz.dkim.durum, 'olcmedi');
  assert.equal(digsiz.spf.durum, 'olcmedi');

  for (const s of [bulundu, yok, kismi, digsiz]) assert.ok(!durumlar(s).includes('eksik'), `❌ basıldı: ${JSON.stringify(durumlar(s))}`);
});
