#!/usr/bin/env node
// techlookup — bir web sitesinin kimliğini ve teknolojisini çıkarır; Claude Code skill'ini kurar.
//   techlookup <adres> [--statik] [--json]   doğrudan tarama (Claude gerekmez)
//   techlookup kur [--proje]                 /techlookup skill'ini ~/.claude/skills/ (veya ./.claude/skills/) altına kurar
//   techlookup kaldir [--proje]              yalnız kendi kurduğu dosyaları siler
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, rmdirSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = dirname(dirname(fileURLToPath(import.meta.url)));
const SURUM = JSON.parse(readFileSync(join(KOK, 'package.json'), 'utf8')).version;
const MANIFESTO = '.techlookup-kurulum.json';
const GLOBAL_YOL = '~/.claude/skills/techlookup/';
const PROJE_YOL = '.claude/skills/techlookup/';

const YARDIM = `techlookup ${SURUM} — web sitesi kimliği ve teknoloji taraması

Kullanım:
  techlookup <adres> [--statik] [--json]   Siteyi tarar, tabloyu terminale basar
  techlookup kur [--proje]                 /techlookup komutunu Claude Code'a kurar
                                           (varsayılan ~/.claude/skills/, --proje ile ./.claude/skills/)
  techlookup kaldir [--proje]              Kurulan dosyaları kaldırır
  techlookup --yardim                      Bu metin

Örnek:
  npx github:inanc76/techlookup ytb.gov.tr
  npx github:inanc76/techlookup kur

Seçenekler:
  --statik   Chrome katmanını atla (daha hızlı; sonradan yüklenen araçlar görünmez)
  --json     Makine okunur çıktı
Çıkış kodu: 0 sonuç var · 2 site hiç ölçülemedi`;

const urunDosyalari = () => ['SKILL.md', ...readdirSync(join(KOK, 'scripts')).filter((f) => f.endsWith('.mjs')).map((f) => `scripts/${f}`)];
const hedefYolu = (proje) => (proje ? resolve(process.cwd(), '.claude', 'skills', 'techlookup') : join(homedir(), '.claude', 'skills', 'techlookup'));
const goster = (yol) => yol.replace(homedir(), '~');

function kur(proje) {
  const hedef = hedefYolu(proje);
  const dosyalar = urunDosyalari();
  for (const f of dosyalar) {
    mkdirSync(dirname(join(hedef, f)), { recursive: true });
    if (f === 'SKILL.md') {
      let metin = readFileSync(join(KOK, f), 'utf8');
      if (proje) metin = metin.split(GLOBAL_YOL).join(PROJE_YOL);
      writeFileSync(join(hedef, f), metin);
    } else copyFileSync(join(KOK, f), join(hedef, f));
  }
  writeFileSync(join(hedef, MANIFESTO), JSON.stringify({ surum: SURUM, dosyalar }, null, 1));
  console.log(`✅ techlookup ${SURUM} kuruldu → ${goster(hedef)}`);
  console.log(`   ${dosyalar.length} dosya · önbellek (veri/) ve senin eklediğin dosyalar korundu`);
  console.log(`   Claude Code'da yeni oturum aç ve yaz: /techlookup www.ornek.com.tr`);
}

function kaldir(proje) {
  const hedef = hedefYolu(proje);
  const m = join(hedef, MANIFESTO);
  if (!existsSync(m)) {
    console.log(`➖ ${goster(hedef)} altında techlookup kurulumu yok — yapılacak bir şey yok`);
    return;
  }
  const { dosyalar } = JSON.parse(readFileSync(m, 'utf8'));
  for (const f of dosyalar) rmSync(join(hedef, f), { force: true });
  rmSync(join(hedef, 'veri'), { recursive: true, force: true });
  rmSync(m, { force: true });
  for (const d of [join(hedef, 'scripts'), hedef]) {
    try { if (!readdirSync(d).length) rmdirSync(d); } catch { /* yok ya da boş değil — bırak */ }
  }
  const kalan = existsSync(hedef) ? readdirSync(hedef) : [];
  console.log(`✅ techlookup kaldırıldı → ${goster(hedef)}${kalan.length ? ` (senin dosyaların kaldı: ${kalan.join(', ')})` : ''}`);
}

async function tara(adres, arg) {
  const { calistir } = await import(join(KOK, 'scripts', 'techlookup.mjs'));
  const r = await calistir(adres, { statik: arg.includes('--statik') });
  if (arg.includes('--json')) {
    const { grupSirasi, olculemeyenGruplar, ...cikti } = r;
    process.stdout.write(JSON.stringify(cikti));
  } else process.stdout.write(r.markdown + '\n');
  return r.cikis;
}

const arg = process.argv.slice(2);
const komut = arg.find((a) => !a.startsWith('-'));
if (!komut || arg.includes('--yardim') || arg.includes('--help') || arg.includes('-h')) {
  console.log(YARDIM);
  process.exit(0);
}
if (komut === 'kur' || komut === 'install') kur(arg.includes('--proje'));
else if (komut === 'kaldir' || komut === 'uninstall') kaldir(arg.includes('--proje'));
else process.exit(await tara(komut, arg));
