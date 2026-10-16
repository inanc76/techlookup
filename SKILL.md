---
name: techlookup
description: Bir web sitesinin kimliğini (alan adı sahibi ve yaşı, siteyi yapan ajans, şablonun ne zamandan beri yayında olduğu) ve kullandığı teknolojileri Wappalyzer gibi çıkarır — frontend, backend, CMS, e-ticaret, barındırma, CDN, analytics, etiket yöneticisi, reklam pikselleri, canlı destek/CRM, çerez onayı, hata izleme, e-posta altyapısı, DNS doğrulama kayıtları, SSL ve güvenlik başlıkları. Her bulgunun kanıtını yazar. Kullanım "/techlookup www.ornek.com.tr".
argument-hint: <web adresi>
model: haiku
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

# /techlookup

Adres: `$ARGUMENTS`

## Ne yaparsın

1. Adres boşsa tek satır yaz: `Kullanım: /techlookup www.ornek.com.tr` — ve dur.
2. Şu komutu **tek kez** koş (zaman aşımı 180000 ms):

   ```
   node ~/.claude/skills/techlookup/scripts/techlookup.mjs "$ARGUMENTS"
   ```

3. Betiğin çıktısını **olduğu gibi** göster. Tabloyu yeniden yazma, satır silme, satır ekleme.
   Cevabın **ilk satırı** betiğin ilk satırıdır (`## 🔎 Teknoloji taraması — …`); tabloyu atlayıp
   yalnız yorum yazmak yasaktır — kullanıcı tabloyu görmek için bu komutu çağırır.
4. Altına **en fazla 3 satır** sade Türkçe yorum yaz: site kimin, kaç yaşında, kim yapmış ve
   bu tasarım ne zamandan beri yayında; neyle kurulmuş, nerede duruyor, pazarlama tarafında ne
   kullanıyor. Yalnız tablodaki bilgiye dayan.

## Yapmayacakların

- Tabloda olmayan bir teknolojiyi tahminle **ekleme** ("muhtemelen React'tır" yok).
- ⚠️ (ölçülemedi) yazan bir satırı "yok" ya da "bulunamadı" diye **yazma** — ölçülemedi ile yok aynı şey değildir.
- ➖ "imza bulunamadı" satırı için ajans **tahmin etme**; 🔒 gizli sahip için isim **uydurma**.
- Yorumda **sayı sayma** ("dört başlık eksik" gibi); eksikleri adıyla yaz ya da hiç yazma — sayım
  tablodan bakılır, yorumdaki sayı yanlış çıkabiliyor.
- Şablon satırı **aralık** veriyorsa ("X ile Y arasında") yorumda da aralığı yaz; tek tarihe indirme.
- Çıkış kodu `2` ise yalnız betiğin ÖLÇÜLEMEDİ mesajını göster ve nedenini tek cümleyle söyle; başka yoldan (WebFetch vb.) taramaya kalkma.
- Ödeme, ısı haritası/oturum kaydı, yazı tipi/harita/video araçları kullanıcı kararıyla kapsam dışıdır; betik bunları zaten basmaz, sen de ekleme.
- Sürüm sütunları yalnız OLGUdur (çıkış yılı · güncel sürüm). Yorumda "eski", "riskli", "güncellenmeli" gibi
  **hüküm verme** (tasarım kararı); istersen "jQuery 3.4.1 (2019), güncel 4.0.0" diye olguyu aktar.

## Bilinen sınırlar (kullanıcı sorarsa)

- Alan adı: `.tr` adresleri TRABİS'ten (sahip çoğunlukla açık), diğerleri RDAP'tan gelir; `.com` gibi
  adreslerde sahip neredeyse hep gizlidir.
- Ajans: yalnız sitede imza (alt bilgi bağlantısı, "Tasarım: X", kod içi not, meta etiketi) varsa bulunur.
  Önceki ajans, önceki şablonun archive.org'daki son kaydından aynı yöntemle okunur.
- Şablon tarihi: archive.org kayıtları ikiye bölünerek taranır; yalnız içerik değişimi sayılmaz, stil/kod
  dosyaları ve tasarım sınıfları değişince "şablon değişti" sayılır. Arşivde boşluk varsa tarih aralık
  olarak yazılır. archive.org yavaşsa ya da kapalıysa satır ⚠️ ölçülemedi olur.

- Sürüm yılı / güncel sürüm: ön yüz kütüphaneleri npm'den (sürüm başına gün), sunucu yazılımları
  endoflife.date'ten (çoğunlukla yalnız ailenin yılı → "aile: 2014"). Kaynakta olmayanlar "➖ kaynakta yok"
  (ör. IIS); kaynak cevap vermezse "⚠️ ölçülemedi". "11 (≥2021)" = yalnız ana sürüm biliniyor. 7 gün önbellek.
- Backend çoğu sitede gizlidir; görünmüyorsa "bulunamadı" doğrudur.
- "CDN arkasında" yazıyorsa asıl sunucu firması görünmez.
- Parmak izi verisi: github.com/enthec/webappanalyzer (Wappalyzer topluluk kopyası), 7 günde bir yenilenir, `veri/` altında önbellekte durur.
