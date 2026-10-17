// Ortak yardımcılar: sürüm · tablo satırı · siteden gelen metnin süzgeci · boyut ve süre sınırlı getirme.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = dirname(dirname(fileURLToPath(import.meta.url)));

// depoda package.json, kurulu kopyada (~/.claude/skills/techlookup) kurulum manifestosu
function surumOku() {
  for (const [dosya, alan] of [['package.json', 'version'], ['.techlookup-kurulum.json', 'surum']]) {
    try { return JSON.parse(readFileSync(join(KOK, dosya), 'utf8'))[alan] ?? null; } catch {}
  }
  return null;
}
export const SURUM = surumOku();
// üçüncü taraf servislere kim olduğumuzu söyleriz; taranan siteye tarayıcı kimliğiyle gideriz (bot duvarı)
export const UA_ARAC = `techlookup/${SURUM ?? '?'} (+github.com/inanc76/techlookup)`;
export const UA_TARAYICI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

/** Yeni bölümlerin tablo satırı. durum: var · yok · olcmedi · eksik */
export const satir = (durum, deger, kanit = '', ek = {}) => ({ durum, deger, kanit, ...ek });

/** Siteden gelen kısa metin VERİDİR: tek satır, yorum/ters tırnak etkisiz, en çok n karakter. */
export function guvenliMetin(s, n = 80) {
  let t = String(s ?? '')
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ')
    .replace(/<!--|-->/g, ' ')
    .replace(/`/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length > n) t = `${t.slice(0, n - 1)}…`;
  return t;
}

/**
 * Gövdeyi akışla okuyup `bayt`ta keser; `sure` tüm isteği (gövde dahil) sınırlar.
 * @returns {{durum: string, kod: number|null, tur?: string, govde?: string, kesildi?: boolean, url?: string, basliklar?: Headers}}
 */
export async function sinirliGetir(url, { bayt = 256 * 1024, sure = 8000, ua = UA_ARAC, yonlendirme = 'follow', basliklar = {} } = {}) {
  try {
    const c = await fetch(url, { redirect: yonlendirme, headers: { 'user-agent': ua, ...basliklar }, signal: AbortSignal.timeout(sure) });
    let govde = '';
    let kesildi = false;
    if (c.body) {
      const okuyucu = c.body.getReader();
      const parcalar = [];
      let n = 0;
      for (;;) {
        const { done, value } = await okuyucu.read();
        if (done) break;
        n += value.length;
        if (n > bayt) {
          parcalar.push(value.subarray(0, value.length - (n - bayt)));
          kesildi = true;
          await okuyucu.cancel().catch(() => {});
          break;
        }
        parcalar.push(value);
      }
      govde = Buffer.concat(parcalar).toString('utf8');
    }
    const durum = c.status === 429 ? 'hız sınırı (HTTP 429)' : c.ok ? 'tamam' : `HTTP ${c.status}`;
    return { durum, kod: c.status, tur: c.headers.get('content-type') ?? '', govde, kesildi, url: c.url, basliklar: c.headers };
  } catch (e) {
    const neden = e.name === 'TimeoutError' ? 'zaman aşımı' : e.cause?.code ?? e.message;
    return { durum: `ölçülemedi (${neden})`, kod: null };
  }
}

/** Üçüncü taraf JSON ucu: 429 → hız sınırı, diğer hata → nedeniyle ölçülemedi. */
export function jsonCoz(r) {
  if (r.kod === 429) return { hata: 'hız sınırı (HTTP 429)' };
  if (r.durum !== 'tamam') return { hata: r.durum.replace(/^ölçülemedi \((.*)\)$/, '$1') };
  try { return { veri: JSON.parse(r.govde) }; } catch { return { hata: 'cevap çözülemedi' }; }
}
