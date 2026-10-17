# techlookup

**Bir web sitesinin kimliğini ve teknolojisini tek raporda çıkarır.** Site kimin, kaç yaşında, kim yapmış,
bu tasarım ne zamandan beri yayında; neyle kurulmuş, nerede barınıyor, pazarlamada hangi araçları kullanıyor;
e-posta ve DNS ayarları, sertifikası, kökteki dosyaları ve paylaşım etiketleri.

Terminalde tek başına çalışır, ya da [Claude Code](https://claude.com/claude-code) içinde `/techlookup` komutu olur.

```bash
npx github:inanc76/techlookup ornek.com.tr
```

> 🇬🇧 English summary at the [bottom](#english-summary).

---

## Kurulum

Node.js 22 ya da üstü yeterli; başka bağımlılık yok.

| Ne istiyorsun | Komut |
|---|---|
| Kurmadan bir kez tara | `npx github:inanc76/techlookup ornek.com.tr` |
| Claude Code'a `/techlookup` komutunu kur | `npx github:inanc76/techlookup kur` |
| pnpm ile | `pnpm dlx github:inanc76/techlookup kur` |
| Kalıcı komut olarak kur | `npm i -g github:inanc76/techlookup` → sonra `techlookup ornek.com.tr` |
| Yalnız bu projeye kur | `npx github:inanc76/techlookup kur --proje` |
| Kaldır | `npx github:inanc76/techlookup kaldir` |

`kur` komutu skill'i `~/.claude/skills/techlookup/` altına kopyalar (`--proje` ile `./.claude/skills/`).
Yeniden çalıştırınca betikleri tazeler; önbelleğe ve senin eklediğin dosyalara dokunmaz.
`kaldir` yalnız kendi kurduğu dosyaları siler.

## Kullanım

**Terminalde:**

```bash
techlookup www.ornek.com.tr            # tam tarama (Chrome varsa sonradan yüklenen araçlar da görünür)
techlookup www.ornek.com.tr --statik   # Chrome'suz, daha hızlı
techlookup www.ornek.com.tr --json     # makine okunur çıktı
```

**Toplu tarama** — bir listedeki siteleri sırayla tarar, her siteyi bir CSV dosyasına tek satır yazar:

```bash
techlookup --liste siteler.txt                      # → ./techlookup-toplu-YYYYMMDD.csv
techlookup --liste siteler.txt --cikti sonuc.csv    # dosya adını sen ver
```

- `siteler.txt`: her satırda bir adres; `#` ile başlayan ve boş satırlar atlanır.
- Sütunlar raporun 7 bölümüyle aynı sırada ve bölüm önekli (`kimlik_*`, `teknoloji_*`, `dns_*`, `eposta_*`,
  `ssl_*`, `dosya_*`, `paylasim_*`). Her hücre, tablodaki satırın ikonlu özetidir. Dosya Excel'de Türkçe
  karakterleri bozmadan açılır.
- **Yarıda kalırsa** (Ctrl+C, kapanan bilgisayar) aynı komutu yeniden çalıştır: "tamam" olan siteler atlanır,
  "ölçülemedi" olanlar yeniden denenir. Dosyaya yalnız sona ekleme yapılır.
- Başka bir sürümün ya da başka bir işin CSV'sini verirsen dosyaya dokunmaz, yeni ad ister.
- Siteler arasında 1 saniye beklenir; yüzlerce sitelik liste saatler sürebilir.
- Alan adı sahibi sütunu **yoktur** (kişi adı olabilir).

**Claude Code'da:** yeni oturum aç ve yaz:

```
/techlookup www.ornek.com.tr
```

Claude raporu olduğu gibi gösterir ve altına en fazla 3 satır sade Türkçe yorum yazar.

## Ne çıkar

Raporun başında bölümlerin listesi durur, sonra 7 bölüm bu sırayla gelir.
Örnek çıktı (temsilî site, kısaltılmış):

```
Bölümler: 🪪 Kimlik · 🧩 Teknoloji · 🌐 DNS ve sunucu · ✉️ E-posta güvenliği · 🔒 SSL ve güvenlik · 📄 Site dosyaları · 🔗 Paylaşım etiketleri

### 🪪 Site kimliği
| ✅ | Alan adı sahibi           | Örnek Kurum A.Ş.                       | TRABİS kaydı |
| ✅ | Kayıt tarihi              | 05.03.2012 · 14 yıl                    |              |
| ✅ | Siteyi yapan ajans        | Örnek Ajans · ornekajans.com.tr        | alt bilgi bağlantısı |
| ✅ | Arşivde ilk görülme       | Nisan 2012 (14 yıl 6 ay) · 160 ayda kayıt | archive.org |
| ✅ | Bu şablonla yayında       | başlangıç: Mart 2023 (3 yıl 7 ay)      | archive.org · 9 kayıt incelendi |

### 🧩 Teknolojiler
| ✅ | 📝 CMS      | WordPress                 | 6.4.3 (2024) | 6.8.2 (2026) | /feed/ generator |
|    |             | WordPress teması: ornek-tema |           |              | /wp-content/themes/ |
|    |             | WordPress eklentileri (2): contact-form-7, wordpress-seo | | | /wp-content/plugins/ |
| ✅ | 📊 Analytics | Google Analytics         | GA4          |              | script |
| ✅ | 🧩 Diğer    | Dış alan adları (3): facebook.net, googletagmanager.com, ornekcrm.io | | | tarayıcı istekleri |

### 🌐 DNS ve sunucu
| ➖ | DNSSEC (alan adı kayıtlarının imzası)       | kapalı (DS kaydı yok)                  | DNS |
| ✅ | CAA (hangi firma sertifika verebilir)       | sertifika verebilir: letsencrypt.org   | CAA: 1 kayıt |
| ✅ | Sunucu ülkesi                               | Türkiye (TR)                           | RIPEstat (MaxMind GeoLite) |
| ➖ | Yeşil enerji                                | kayıtta yeşil enerji beyanı yok        | Green Web Foundation |

### ✉️ E-posta güvenliği
| ✅ | SPF (kimler bu alan adıyla posta gönderebilir) | 4 sorgu (sınır 10) · ~all           | TXT |
| ✅ | DMARC (sahte postaya ne yapılır)            | politika: quarantine · rapor adresi tanımlı | _dmarc TXT |
| ✅ | DKIM (posta imzası)                         | selector1                              | 35 yaygın ad denendi |
| ➖ | MTA-STS (şifreli posta zorunluluğu)         | kayıt yok                              | DNS |

### 🔒 SSL ve güvenlik
| ✅ | Sertifika                 | Let's Encrypt · bitiş 14.01.2027 · TLSv1.3 · zincir geçerli |
| ❌ | CSP                       | yok                                    | yanıt başlığı |
| ✅ | Sertifika kapsamı         | ornek.com.tr, www.ornek.com.tr · 89 gün kaldı | SAN |
| ✅ | Yönlendirme zinciri       | 301 http://ornek.com.tr/ → 200 https://www.ornek.com.tr/ | 2 adım |
| ➖ | HSTS önyükleme koşulları  | koşullar eksik: max-age ≥ 1 yıl ✓ · includeSubDomains ✗ · preload ✗ | Strict-Transport-Security başlığı |
| ✅ | Çerez bayrakları          | 6 çerez · Secure 4/6 · HttpOnly 2/6 · SameSite 5/6 | tarayıcı |

### 📄 Site dosyaları
| ✅ | robots.txt   | 12 yönerge · 1 Sitemap satırı          | /robots.txt |
| ✅ | sitemap.xml  | 143 adres · en yeni değişiklik 2026-10-01 | robots.txt Sitemap satırı |
| ➖ | security.txt | yok                                    | HTTP 404 |

### 🔗 Paylaşım etiketleri
| ✅ | Open Graph      | 5 etiket · başlık “Örnek Kurum” · görsel ✓ | meta og:* |
| ✅ | JSON-LD türleri | Organization, WebSite                  | 2 blok |
| ➖ | hreflang dilleri | bulunamadı                            | link hreflang |
```

**Yedi bölüm:**

1. **🪪 Site kimliği** — alan adı sahibi · kayıt tarihi ve yaşı · bitiş tarihi · kayıt firması ·
   siteyi yapan ajans (sayfadaki imza; yoksa `humans.txt`) · arşivde ilk görülme · önceki siteyi yapan ajans ·
   bu şablonun yayına girdiği ay.
2. **🧩 Teknolojiler** — 15 sabit grup: frontend · backend · CMS · e-ticaret · barındırma · CDN ve güvenlik ·
   analytics · etiket yöneticisi · reklam pikselleri · canlı destek/CRM · çerez onayı · hata izleme ·
   e-posta altyapısı · doğrulama kayıtları · diğer. Her bulgunun **kanıtı** yanında yazar.
   Bulunan sürümün **çıkış yılı** ve bugünkü **güncel sürüm** yalnız olgu olarak verilir; "eski" ya da
   "riskli" gibi bir hüküm verilmez. CMS sürümü sayfada yoksa CMS'in kendi bilinen dosyasından okunur;
   WordPress sitelerde tema ve eklentiler; siteye yük getiren **dış alan adları** "Diğer" grubunda.
3. **🌐 DNS ve sunucu** — DNSSEC · CAA · SOA (birincil ad sunucusu) · HTTPS kaydı · sunucunun ülkesi ·
   yeşil enerji kaydı.
4. **✉️ E-posta güvenliği** — SPF (10 sorgu sınırının kaçı kullanılmış) · DMARC · DKIM · MTA-STS · TLS-RPT · BIMI.
5. **🔒 SSL ve güvenlik** — sertifika ve altı güvenlik başlığı · sertifikanın kapsadığı adlar ve kalan gün ·
   `http://` adresinden başlayan yönlendirme zinciri · HSTS önyükleme listesinin üç koşulu · çerezlerin
   Secure / HttpOnly / SameSite bayrakları.
6. **📄 Site dosyaları** — `robots.txt` · `sitemap.xml` · `security.txt` · `llms.txt` · `ads.txt` · `humans.txt`.
   Dosyaların içeriği basılmaz; yalnız var/yok ve yapısal olgu (satır, yönerge, adres sayısı, tarih).
7. **🔗 Paylaşım etiketleri** — Open Graph · Twitter Card · JSON-LD türleri · hreflang dilleri · uygulama manifesti.

**İkonlar** — her satır her taramada aynı yerde durur, durumu ikonla yazılır:

| İkon | Anlamı |
|:-:|---|
| ✅ | bulundu |
| ➖ | bakıldı, bulunamadı |
| ⚠️ | **ölçülemedi** — nedeni yanında yazar (ör. "tarayıcı çalışmadı", "archive.org zaman aşımı") |
| ❌ | eksik (güvenlik başlığı) |

⚠️ ile ➖ aynı şey değildir: "ölçülemedi" hiçbir zaman "yok" diye yazılmaz. Örneğin DKIM adları dışarıdan
listelenemez; 35 yaygın ad arasında bulunamazsa ➖, bazı adlar sorulamadıysa ⚠️ yazılır.

**Kapsam dışı:** ödeme altyapısı, ısı haritası/oturum kaydı, yazı tipi, harita ve video araçları bilerek
yazılmaz — teknoloji listesinde de, WordPress eklentilerinde de, dış alan adlarında da.

## Nasıl çalışır

**Ölçümün tamamını betik yapar; yapay zekâ çağrısı yoktur.** Claude Code'da kullanıldığında yapay zekâ
yalnız raporu gösterir ve 3 satırlık yorumu yazar (Haiku modeliyle, tarama başına yaklaşık 0,01 $).

| Bilgi | Kaynak |
|---|---|
| Teknolojiler | sayfa kodu + gizli Chrome (sonradan yüklenen araçlar) + HTTP başlıkları + çerez adları · parmak izleri: [enthec/webappanalyzer](https://github.com/enthec/webappanalyzer) |
| CMS sürümü | WordPress `/feed/` · Joomla `joomla.xml` · Drupal `CHANGELOG.txt` (yalnız o CMS bulunduysa) |
| E-posta, doğrulama, barındırma, DNS güvenliği | DNS kayıtları (`dig`) · MTA-STS politika dosyası |
| Sertifika, yönlendirme, çerezler | sitenin kendisi (443 kapısı, `http://` adresi, yanıt başlıkları) |
| Sunucu ülkesi | RIPEstat (MaxMind GeoLite verisi) |
| Yeşil enerji | Green Web Foundation |
| Alan adı sahibi ve yaşı | `.tr` → TRABİS (`whois`) · diğerleri → RDAP |
| Ajans | sayfanın alt kısmındaki imza, "Tasarım: X", kod içi not, meta etiketi; yoksa `humans.txt` |
| Önceki ajans · şablon tarihi · ilk görülme | [archive.org](https://web.archive.org) kayıtları |
| Sürüm yılı · güncel sürüm | npm kayıt defteri · [endoflife.date](https://endoflife.date) |

**Şablon tarihi nasıl bulunur:** archive.org'daki aylık kayıtlar ikiye bölünerek taranır (yaklaşık 9 istek).
İçerik karşılaştırılmaz; yüklenen stil ve kod dosyaları ile tasarım sınıfları karşılaştırılır. Yani haberler,
yazılar değişse de şablon aynıysa "aynı" sayılır. Derleyicinin her yayında değiştirdiği dosya adları ve
bot doğrulama sayfaları ayıklanır. Arşivde boşluk varsa tarih aralık olarak yazılır.

## Gereksinimler ve sınırlar

- **Node.js ≥ 22** zorunlu (tarayıcı katmanı Node'un yerleşik WebSocket'ini kullanır). `dig`, `whois` ve Chrome/Chromium isteğe bağlı: yoksa ilgili satırlar
  ⚠️ ölçülemedi olur. macOS ve Linux'ta hazır gelir; Windows'ta DNS ve alan adı satırları çoğunlukla
  ölçülemez. Chrome başka bir yerdeyse: `TECHLOOKUP_CHROME=/yol/chrome`.
- Bazı ev modemleri belirli DNS sorgularına (CAA, DS, HTTPS kaydı) hiç cevap vermez. O zaman sorgu bir kez
  `1.1.1.1`'e sorulur ve kanıt sütununda yazar. Kapatmak için `TECHLOOKUP_DNS_YEDEK=yok`; başka sunucu için
  `TECHLOOKUP_DNS_YEDEK=<ip>`.
- Sunucu tarafı yazılımlar çoğu sitede gizlidir; görünmüyorsa "bulunamadı" doğrudur.
- "CDN arkasında" yazıyorsa asıl sunucu firması görünmez; sunucu ülkesi de çoğunlukla "belirsiz" çıkar.
- `.com` gibi adreslerde alan adı sahibi neredeyse hep gizlidir (🔒); `.tr` adreslerinde çoğunlukla açıktır.
- Ajans yalnız sitede bir imza varsa bulunur; imza yoksa tahmin edilmez.
- Her toplayıcının bir süre sınırı vardır; dış kaynak cevap vermezse o satır ⚠️ olur, tarama sürer.
- Önbellek: parmak izi verisi ve sürüm bilgileri 7 gün `veri/` altında tutulur.

## Gizlilik

Tarama yalnız herkese açık bilgiyi okur: sayfanın kendisi, DNS, sertifika, kamu kayıtları ve arşiv.
Bunun için **taranan alan adı ya da sunucu IP adresi aşağıdaki servislere sorulur.** Toplu taramada listedeki
her site için aynısı olur.

| Servis | Ne sorulur | Ne için |
|---|---|---|
| `raw.githubusercontent.com` | hiçbir site bilgisi (yalnız dosya indirme) | parmak izi verisi, 7 günde bir |
| `data.iana.org` | alan adının uzantısı (ör. `com`) | hangi RDAP sunucusuna sorulacağı; liste önbelleğe alınır |
| RDAP sunucusu (uzantının kayıt kuruluşu) | alan adı | `.tr` dışındaki adreslerde sahip ve tarihler |
| `whois.trabis.gov.tr` | alan adı | `.tr` adreslerinde sahip ve tarihler |
| `web.archive.org` | alan adı | arşiv kayıtları: ilk görülme, şablon tarihi, önceki ajans |
| `registry.npmjs.org` | yalnız kütüphane adı | sürüm yılı ve güncel sürüm |
| `endoflife.date` | yalnız yazılım adı | sürüm yılı ve güncel sürüm |
| `asn.cymru.com` (DNS sorgusu) | sunucu IP adresi | sunucunun ağı (barındırma firması) |
| `stat.ripe.net` | sunucu IP adresi | sunucu ülkesi (MaxMind GeoLite verisi, RIPE NCC aracılığıyla) |
| `api.thegreenwebfoundation.org` | alan adı | yeşil enerji kaydı |
| `1.1.1.1` (DNS, yalnız yedek) | alan adı | yerel DNS cevap vermezse; `TECHLOOKUP_DNS_YEDEK=yok` kapatır |

Sitenin **kendisinden** sayfanın yanında şu yollar da istenir: `/robots.txt` · site haritası · `/.well-known/security.txt`
(yoksa `/security.txt`) · `/llms.txt` · `/ads.txt` · `/humans.txt` · `http://` adresi (yönlendirme zinciri) ·
CMS bulunduysa o CMS'in sürüm dosyası · MTA-STS kaydı varsa `mta-sts.<alan>` politika dosyası. Siteden gelen
adrese (site haritası, yönlendirme) yalnız aynı alan adındaysa gidilir.

**Yazılmayanlar:** çerezlerin değeri (yalnız adı ve bayrakları) · hiçbir e-posta adresi (DMARC/TLS-RPT rapor
adresi, SOA yöneticisi, security.txt iletişimi yalnız "tanımlı" diye geçer) · adreslerin sorgu dizesi ·
site dosyalarının içeriği. Toplu CSV'de alan adı sahibi sütunu yoktur.

## Geliştirme

```bash
git clone https://github.com/inanc76/techlookup && cd techlookup
npm test   # 52 ölçüt
```

## Lisans

[MIT](LICENSE). Parmak izi verisi [enthec/webappanalyzer](https://github.com/enthec/webappanalyzer)
(GPL-3.0) bu pakete gömülü değildir; ilk çalıştırmada indirilir ve yerel önbellekte tutulur.
Sunucu ülkesi MaxMind GeoLite verisine dayanır (RIPEstat üzerinden).

---

## English summary

**techlookup** profiles a website in one report with seven sections: **identity** (domain owner and age,
the agency that built the site and the previous one, first archive appearance, since when the current
template has been live — via the Wayback Machine, comparing template fingerprints rather than content),
**technology stack** in 15 fixed groups (with evidence, release year and latest version; CMS version from
known files, WordPress theme and plugins, third-party domains), **DNS and server** (DNSSEC, CAA, SOA, HTTPS
record, server country, green hosting), **email security** (SPF lookup count, DMARC, DKIM, MTA-STS, TLS-RPT,
BIMI), **SSL and security** (certificate, six security headers, SAN list and days left, redirect chain, HSTS
preload conditions, cookie flags), **site files** (robots.txt, sitemap.xml, security.txt, llms.txt, ads.txt,
humans.txt — structure only, never their content) and **sharing tags** (Open Graph, Twitter Card, JSON-LD
types, hreflang, web app manifest). Every row is always present and marked ✅ found · ➖ not found ·
⚠️ could not be measured (with reason) · ❌ missing.

All measurement is done by the script — no AI calls. Output is in Turkish.

```bash
npx github:inanc76/techlookup example.com                       # scan in the terminal
npx github:inanc76/techlookup --liste sites.txt --cikti out.csv  # batch scan to CSV, resumable
npx github:inanc76/techlookup kur                               # install the /techlookup skill for Claude Code
```

The domain or server IP is sent to the third-party services listed under "Gizlilik" (archive.org, RDAP/TRABİS,
RIPEstat, Green Web Foundation, Team Cymru DNS, and 1.1.1.1 as DNS fallback).
Requires Node.js ≥ 22; `dig`, `whois` and Chrome are optional. MIT licensed.
