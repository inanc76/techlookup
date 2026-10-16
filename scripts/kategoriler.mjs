// webappanalyzer kategori numarası (src/categories.json) → /techlookup grubu.
// Kullanıcı kararı (2026-10-16): ödeme, ısı haritası/kayıt, yazı tipi/harita/video, eski sürüm uyarısı YOK.

export const GRUPLAR = [
  'Frontend',
  'Backend',
  'CMS',
  'E-ticaret',
  'PaaS / Barındırma',
  'CDN ve güvenlik',
  'Analytics',
  'Etiket yöneticisi',
  'Reklam pikselleri',
  'Canlı destek / CRM',
  'Çerez onayı',
  'Hata izleme',
  'E-posta altyapısı',
  'Doğrulama kayıtları',
  'Diğer',
];

const KATEGORI_GRUP = {
  12: 'Frontend', 59: 'Frontend', 66: 'Frontend', 57: 'Frontend', 108: 'Frontend', 26: 'Frontend', 25: 'Frontend',
  18: 'Backend', 27: 'Backend', 22: 'Backend', 34: 'Backend', 28: 'Backend', 33: 'Backend', 64: 'Backend',
  1: 'CMS', 11: 'CMS', 51: 'CMS', 80: 'CMS', 82: 'CMS', 87: 'CMS', 8: 'CMS', 50: 'CMS',
  6: 'E-ticaret', 81: 'E-ticaret', 100: 'E-ticaret', 98: 'E-ticaret',
  62: 'PaaS / Barındırma', 63: 'PaaS / Barındırma', 88: 'PaaS / Barındırma', 9: 'PaaS / Barındırma', 60: 'PaaS / Barındırma',
  31: 'CDN ve güvenlik', 16: 'CDN ve güvenlik', 23: 'CDN ve güvenlik', 65: 'CDN ve güvenlik', 70: 'CDN ve güvenlik',
  10: 'Analytics', 97: 'Analytics', 86: 'Analytics', 74: 'Analytics',
  42: 'Etiket yöneticisi',
  36: 'Reklam pikselleri', 77: 'Reklam pikselleri', 71: 'Reklam pikselleri',
  52: 'Canlı destek / CRM', 53: 'Canlı destek / CRM', 32: 'Canlı destek / CRM',
  30: 'E-posta altyapısı', 75: 'E-posta altyapısı',
  67: 'Çerez onayı',
  78: 'Hata izleme',
};

// Bu kategorilerden biri varsa teknoloji hiç basılmaz.
export const DISLANAN_KATEGORILER = new Set([41, 91, 17, 35, 14, 103]);

// Kategorisi başka ama kullanıcının dışladığı türden olanlar (ısı haritası / oturum kaydı).
export const DISLANAN_ADLAR = new Set([
  'Hotjar', 'Microsoft Clarity', 'FullStory', 'Mouseflow', 'Smartlook', 'Crazy Egg',
  'Lucky Orange', 'Inspectlet', 'Yandex.Metrika Webvisor', 'Contentsquare', 'Clicktale',
]);

// Veritabanında yanlış/uygunsuz gruba düşenler — adıyla doğru gruba çekilir.
const AD_GRUP = {
  'Facebook Pixel': 'Reklam pikselleri',
  'Meta Pixel': 'Reklam pikselleri',
  'TikTok Pixel': 'Reklam pikselleri',
  'LinkedIn Insight Tag': 'Reklam pikselleri',
  'Twitter Ads': 'Reklam pikselleri',
  'Pinterest Conversion Tag': 'Reklam pikselleri',
  'Snap Pixel': 'Reklam pikselleri',
  'Google Ads Conversion Tracking': 'Reklam pikselleri',
  'Google Ads': 'Reklam pikselleri',
  'Microsoft Advertising': 'Reklam pikselleri',
  'Criteo': 'Reklam pikselleri',
  'Sentry': 'Hata izleme',
  'Bugsnag': 'Hata izleme',
  'Rollbar': 'Hata izleme',
  'TrackJs': 'Hata izleme',
  'New Relic': 'Hata izleme',
  'Datadog': 'Hata izleme',
  'Elastic APM': 'Hata izleme',
  'HubSpot': 'Canlı destek / CRM',
};

export function dislanirMi(ad, kategoriler) {
  return DISLANAN_ADLAR.has(ad) || kategoriler.some((k) => DISLANAN_KATEGORILER.has(k));
}

export function grupBul(ad, kategoriler) {
  if (AD_GRUP[ad]) return AD_GRUP[ad];
  for (const k of kategoriler) if (KATEGORI_GRUP[k]) return KATEGORI_GRUP[k];
  return 'Diğer';
}

// bulgular: [{ad, kategoriler, surum, kanit, guven}] → { gruplar: { grup: [...] }, dislanan: [ad] }
export function grupla(bulgular) {
  const sonuc = {};
  const dislanan = [];
  for (const b of bulgular) {
    if (dislanirMi(b.ad, b.kategoriler)) { dislanan.push(b.ad); continue; }
    const g = grupBul(b.ad, b.kategoriler);
    (sonuc[g] ??= []).push(b);
  }
  for (const g of Object.keys(sonuc)) sonuc[g].sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  return { gruplar: sonuc, dislanan: dislanan.sort() };
}
