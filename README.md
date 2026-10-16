# techlookup

**Bir web sitesinin kimliğini ve teknolojisini tek tabloda çıkarır.** Site kimin, kaç yaşında, kim yapmış,
bu tasarım ne zamandan beri yayında; neyle kurulmuş, nerede barınıyor, pazarlamada hangi araçları kullanıyor.

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

**Claude Code'da:** yeni oturum aç ve yaz:

```
/techlookup www.ornek.com.tr
```

Claude tabloyu olduğu gibi gösterir ve altına en fazla 3 satır sade Türkçe yorum yazar.

## Ne çıkar

Örnek çıktı (temsilî site, kısaltılmış):

```
### 🪪 Site kimliği
| ✅ | Alan adı sahibi           | Örnek Kurum A.Ş.                   | TRABİS kaydı |
| ✅ | Kayıt tarihi              | 05.03.2012 · 14 yıl                |              |
| ➖ | Siteyi yapan ajans        | imza bulunamadı                    |              |
| ➖ | Önceki siteyi yapan ajans | imza bulunamadı                    | archive.org · Şubat 2023 kaydı |
| ✅ | Bu şablonla yayında       | başlangıç: Mart 2023 (3 yıl 7 ay) · önceki şablon en son Şubat 2023'te görüldü |

### 🧩 Teknolojiler
|    | Grup        | Teknoloji | Sürüm (yıl)  | Güncel sürüm |
| ✅ | 🎨 Frontend | Bootstrap | 4.5.2 (2020) | 5.3.8 (2025) |
|    |             | jQuery    | 3.5.1 (2020) | 4.0.0 (2026) |
| ✅ | ⚙️ Backend  | IIS       | 10.0         | ➖ kaynakta yok |
| ➖ | 📝 CMS      | bulunamadı |             |              |
| ✅ | 📊 Analytics | Google Analytics | GA4  |              |
| ✅ | ✉️ E-posta altyapısı | Microsoft 365 |  |              |

### 🔒 SSL ve güvenlik başlıkları
| ✅ | Sertifika | Let's Encrypt · bitiş 14.01.2027 · TLSv1.3 · zincir geçerli |
| ❌ | CSP       | yok |
```

**Üç bölüm:**

1. **Site kimliği** — alan adı sahibi · kayıt tarihi ve yaşı · bitiş tarihi · kayıt firması ·
   siteyi yapan ajans · önceki siteyi yapan ajans · bu şablonun yayına girdiği ay.
2. **Teknolojiler** — 15 sabit grup: frontend · backend · CMS · e-ticaret · barındırma · CDN ve güvenlik ·
   analytics · etiket yöneticisi · reklam pikselleri · canlı destek/CRM · çerez onayı · hata izleme ·
   e-posta altyapısı · doğrulama kayıtları · diğer. Her bulgunun **kanıtı** yanında yazar.
   Bulunan sürümün **çıkış yılı** ve bugünkü **güncel sürüm** yalnız olgu olarak verilir; "eski" ya da
   "riskli" gibi bir hüküm verilmez.
3. **SSL ve güvenlik başlıkları** — sertifika ve altı güvenlik başlığı.

**İkonlar** — her satır her taramada aynı yerde durur, durumu ikonla yazılır:

| İkon | Anlamı |
|:-:|---|
| ✅ | bulundu |
| ➖ | bakıldı, bulunamadı |
| ⚠️ | **ölçülemedi** — nedeni yanında yazar (ör. "tarayıcı çalışmadı", "archive.org zaman aşımı") |
| ❌ | eksik (güvenlik başlığı) |

⚠️ ile ➖ aynı şey değildir: "ölçülemedi" hiçbir zaman "yok" diye yazılmaz.

## Nasıl çalışır

**Ölçümün tamamını betik yapar; yapay zekâ çağrısı yoktur.** Claude Code'da kullanıldığında yapay zekâ
yalnız tabloyu gösterir ve 3 satırlık yorumu yazar (Haiku modeliyle, tarama başına yaklaşık 0,01 $).

| Bilgi | Kaynak |
|---|---|
| Teknolojiler | sayfa kodu + gizli Chrome (sonradan yüklenen araçlar) + HTTP başlıkları + çerez adları · parmak izleri: [enthec/webappanalyzer](https://github.com/enthec/webappanalyzer) |
| E-posta, doğrulama, barındırma | DNS kayıtları (`dig`) |
| Sertifika | sitenin 443 kapısı |
| Alan adı sahibi ve yaşı | `.tr` → TRABİS (`whois`) · diğerleri → RDAP |
| Ajans | sayfanın alt kısmındaki imza, "Tasarım: X", kod içi not, meta etiketi |
| Önceki ajans · şablon tarihi | [archive.org](https://web.archive.org) kayıtları |
| Sürüm yılı · güncel sürüm | npm kayıt defteri · [endoflife.date](https://endoflife.date) |

**Şablon tarihi nasıl bulunur:** archive.org'daki aylık kayıtlar ikiye bölünerek taranır (yaklaşık 9 istek).
İçerik karşılaştırılmaz; yüklenen stil ve kod dosyaları ile tasarım sınıfları karşılaştırılır. Yani haberler,
yazılar değişse de şablon aynıysa "aynı" sayılır. Derleyicinin her yayında değiştirdiği dosya adları ve
bot doğrulama sayfaları ayıklanır. Arşivde boşluk varsa tarih aralık olarak yazılır.

## Gereksinimler ve sınırlar

- **Node.js ≥ 22** zorunlu (tarayıcı katmanı Node'un yerleşik WebSocket'ini kullanır). `dig`, `whois` ve Chrome/Chromium isteğe bağlı: yoksa ilgili satırlar
  ⚠️ ölçülemedi olur. macOS ve Linux'ta hazır gelir; Windows'ta DNS ve alan adı satırları çoğunlukla
  ölçülemez. Chrome başka bir yerdeyse: `TECHLOOKUP_CHROME=/yol/chrome`.
- Sunucu tarafı yazılımlar çoğu sitede gizlidir; görünmüyorsa "bulunamadı" doğrudur.
- "CDN arkasında" yazıyorsa asıl sunucu firması görünmez.
- `.com` gibi adreslerde alan adı sahibi neredeyse hep gizlidir (🔒); `.tr` adreslerinde çoğunlukla açıktır.
- Ajans yalnız sitede bir imza varsa bulunur; imza yoksa tahmin edilmez.
- Önbellek: parmak izi verisi ve sürüm bilgileri 7 gün `veri/` altında tutulur.

## Gizlilik

Tarama yalnız herkese açık bilgiyi okur: sayfanın kendisi, DNS, sertifika, kamu kayıtları ve arşiv.
Çerezlerin yalnız **adı** yazılır, değeri hiçbir yere yazılmaz. Araç hiçbir yere veri göndermez.

## Geliştirme

```bash
git clone https://github.com/inanc76/techlookup && cd techlookup
npm test   # 24 ölçüt
```

## Lisans

[MIT](LICENSE). Parmak izi verisi [enthec/webappanalyzer](https://github.com/enthec/webappanalyzer)
(GPL-3.0) bu pakete gömülü değildir; ilk çalıştırmada indirilir ve yerel önbellekte tutulur.

---

## English summary

**techlookup** profiles a website in one table: **who owns the domain and how old it is, which agency
built the site (and the previous one), since when the current template has been live** (via the Wayback
Machine, comparing template fingerprints rather than content), and **its technology stack** in 15 fixed
groups (frontend, backend, CMS, hosting, CDN, analytics, tag manager, ad pixels, CRM, consent, error
tracking, email, DNS verifications) with evidence, release year and latest version for each detected version.
Every row is always present and marked ✅ found · ➖ not found · ⚠️ could not be measured (with reason) · ❌ missing.

All measurement is done by the script — no AI calls. Output is in Turkish.

```bash
npx github:inanc76/techlookup example.com        # scan in the terminal
npx github:inanc76/techlookup kur                # install the /techlookup skill for Claude Code
```

Requires Node.js ≥ 22; `dig`, `whois` and Chrome are optional. MIT licensed.
