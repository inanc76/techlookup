// DNS kayıtlarından e-posta altyapısı, doğrulama kayıtları ve DNS/barındırma sağlayıcısı çıkarır.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const koş = promisify(execFile);

const MX = [
  [/aspmx\.l\.google\.com|googlemail\.com|smtp\.google\.com/i, 'Google Workspace'],
  [/mail\.protection\.outlook\.com|outlook\.com/i, 'Microsoft 365'],
  [/mx\.yandex\.net|yandex\.ru/i, 'Yandex 360'],
  [/zoho\.(com|eu|in)/i, 'Zoho Mail'],
  [/icloud\.com/i, 'iCloud Mail'],
  [/mimecast\.com/i, 'Mimecast'],
  [/pphosted\.com/i, 'Proofpoint'],
  [/barracudanetworks\.com/i, 'Barracuda'],
  [/protonmail\.ch/i, 'Proton Mail'],
  [/secureserver\.net/i, 'GoDaddy Mail'],
  [/mailgun\.org/i, 'Mailgun'],
  [/yaani\.com|turkcell/i, 'Yaani Mail'],
  [/natrohost\.com|natro\.com/i, 'Natro Mail'],
  [/turhost\.com/i, 'Turhost Mail'],
];

// SPF include → toplu/işlem e-postası aracı
const SPF = [
  [/_spf\.google\.com/i, 'Google Workspace'],
  [/spf\.protection\.outlook\.com/i, 'Microsoft 365'],
  [/servers\.mcsv\.net|mailchimp/i, 'Mailchimp'],
  [/mandrillapp\.com/i, 'Mandrill (Mailchimp)'],
  [/sendgrid\.net/i, 'SendGrid'],
  [/amazonses\.com/i, 'Amazon SES'],
  [/mailgun\.org/i, 'Mailgun'],
  [/sendinblue\.com|brevo\.com/i, 'Brevo'],
  [/hubspotemail\.net|hubspot/i, 'HubSpot'],
  [/salesforce\.com|exacttarget\.com/i, 'Salesforce'],
  [/zendesk\.com/i, 'Zendesk'],
  [/freshdesk\.com/i, 'Freshdesk'],
  [/mailjet\.com/i, 'Mailjet'],
  [/sparkpostmail\.com/i, 'SparkPost'],
  [/postmarkapp\.com|mtasv\.net/i, 'Postmark'],
  [/zoho\.(com|eu)/i, 'Zoho'],
  [/_spf\.yandex\.net/i, 'Yandex 360'],
  [/euromsg|relateddigital/i, 'Euromsg (Related Digital)'],
  [/klaviyo/i, 'Klaviyo'],
  [/resend\.com|_spf\.resend/i, 'Resend'],
  [/helpscoutemail\.com/i, 'Help Scout'],
  [/intercom\.io/i, 'Intercom'],
  [/freshemail\.io|freshworks/i, 'Freshworks'],
  [/mailerlite\.com/i, 'MailerLite'],
  [/activecampaign|emsd1\.com/i, 'ActiveCampaign'],
  [/iletimerkezi|iletim/i, 'İleti Merkezi'],
];

// TXT doğrulama kayıtları → hangi servise bağlı
const DOGRULAMA = [
  [/^google-site-verification=/i, 'Google Search Console'],
  [/^facebook-domain-verification=/i, 'Facebook'],
  [/^MS=ms\d+/i, 'Microsoft 365'],
  [/^atlassian-domain-verification=/i, 'Atlassian'],
  [/^apple-domain-verification=/i, 'Apple'],
  [/^yandex-verification:/i, 'Yandex Webmaster'],
  [/^adobe-idp-site-verification=/i, 'Adobe'],
  [/^docusign=/i, 'DocuSign'],
  [/^zoom-domain-verification=/i, 'Zoom'],
  [/^stripe-verification=/i, 'Stripe'],
  [/^hubspot-developer-verification=|^hubspot-domain-verification/i, 'HubSpot'],
  [/^globalsign-domain-verification=/i, 'GlobalSign'],
  [/^_?github-(pages-)?challenge/i, 'GitHub'],
  [/^slack-domain-verification=/i, 'Slack'],
  [/^dropbox-domain-verification=/i, 'Dropbox'],
  [/^openai-domain-verification=/i, 'OpenAI'],
  [/^canva-site-verification=/i, 'Canva'],
  [/^miro-verification=/i, 'Miro'],
  [/^pinterest-site-verification=|^p:/i, 'Pinterest'],
  [/^ahrefs-site-verification_/i, 'Ahrefs'],
  [/^cisco-ci-domain-verification=/i, 'Cisco Webex'],
  [/^onetrust-domain-verification=/i, 'OneTrust'],
  [/^teamviewer-sso-verification=/i, 'TeamViewer'],
  [/^brevo-code:/i, 'Brevo'],
  [/^klaviyo-site-verification=/i, 'Klaviyo'],
];

const NS = [
  [/cloudflare\.com/i, 'Cloudflare'],
  [/awsdns/i, 'Amazon Route 53'],
  [/azure-dns/i, 'Azure DNS'],
  [/googledomains\.com|google\.com/i, 'Google Cloud DNS'],
  [/domaincontrol\.com/i, 'GoDaddy'],
  [/natrohost\.com|natro\.com/i, 'Natro'],
  [/turhost\.com/i, 'Turhost'],
  [/isimtescil\.net|isimtescil/i, 'İsimtescil'],
  [/radorehost|rdns\.com\.tr/i, 'Radore'],
  [/hostinger/i, 'Hostinger'],
  [/digitalocean\.com/i, 'DigitalOcean'],
  [/vercel-dns\.com/i, 'Vercel'],
  [/nsone\.net/i, 'NS1'],
  [/dnsmadeeasy/i, 'DNS Made Easy'],
  [/registrar-servers\.com/i, 'Namecheap'],
  [/hetzner/i, 'Hetzner'],
  [/ultradns/i, 'UltraDNS'],
  [/akam\.net/i, 'Akamai'],
  [/wixdns\.net/i, 'Wix'],
  [/squarespacedns/i, 'Squarespace'],
  [/shopify/i, 'Shopify'],
  [/ikas/i, 'ikas'],
  [/kurumsaldns|veridyen|guzel\.net\.tr/i, 'Güzel Hosting'],
];

function tablodan(tablo, kayitlar, alan, sonuc) {
  for (const k of kayitlar ?? []) {
    for (const [re, ad] of tablo) {
      if (re.test(k) && !sonuc.some((x) => x.ad === ad)) sonuc.push({ ad, kanit: `${alan}: ${k.slice(0, 80)}` });
    }
  }
}

export function dnsYorumla({ mx = [], txt = [], ns = [] }) {
  const eposta = [];
  const dogrulama = [];
  const barindirma = [];
  tablodan(MX, mx, 'MX', eposta);
  if (mx.length && !mx.some((k) => MX.some(([re]) => re.test(k)))) {
    const sunucu = mx[0].split(/\s+/).pop().replace(/\.$/, '');
    eposta.push({ ad: 'Tanınmayan / kendi sunucusu', kanit: `MX: ${sunucu}` });
  }
  const spf = txt.filter((t) => /^v=spf1/i.test(t));
  for (const s of spf) {
    const parcalar = s.split(/\s+/).filter((p) => /^(include|redirect|a|mx):|^redirect=/i.test(p));
    tablodan(SPF, parcalar, 'SPF', eposta);
  }
  tablodan(DOGRULAMA, txt.filter((t) => !/^v=spf1/i.test(t)), 'TXT', dogrulama);
  tablodan(NS, ns, 'NS', barindirma);
  return { eposta, dogrulama, barindirma };
}

async function dig(tur, ad) {
  const { stdout } = await koş('dig', ['+short', '+time=3', '+tries=1', tur, ad], { timeout: 10_000 });
  return stdout
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !s.startsWith(';;'));
}

// TXT kaydı tırnaklı ve parçalı gelir: "v=spf1 ..." "...devamı"
const txtBirlestir = (s) => s.replace(/"\s+"/g, '').replace(/^"|"$/g, '');

// alan adının kökü: www.ornek.com.tr → ornek.com.tr (basit kural; iki seviyeli TR uzantıları dahil)
export function kokAlan(host) {
  const p = host.replace(/^www\./i, '').split('.');
  const ikili = /^(com|net|org|gov|edu|bel|k12|av|dr|gen|web|biz|info|tv|co|ac)$/i;
  if (p.length > 2 && ikili.test(p[p.length - 2]) && p[p.length - 1].length === 2) return p.slice(-3).join('.');
  return p.slice(-2).join('.');
}

/** dig ile toplar. Hata → null (ölçülemedi). */
export async function dnsTopla(host) {
  const kok = kokAlan(host);
  try {
    const [mx, txtHam, ns, a, cname] = await Promise.all([
      dig('MX', kok), dig('TXT', kok), dig('NS', kok), dig('A', host), dig('CNAME', host),
    ]);
    const txt = txtHam.map(txtBirlestir);
    const ipler = a.filter((x) => /^\d+\.\d+\.\d+\.\d+$/.test(x));
    let asn = null;
    if (ipler[0]) {
      try {
        const ters = ipler[0].split('.').reverse().join('.');
        const [kayit] = await dig('TXT', `${ters}.origin.asn.cymru.com`);
        const no = kayit && txtBirlestir(kayit).split('|')[0].trim().split(' ')[0];
        if (no) {
          const [ad] = await dig('TXT', `AS${no}.asn.cymru.com`);
          asn = { no, ad: ad ? txtBirlestir(ad).split('|').pop().trim() : null, ip: ipler[0] };
        }
      } catch {
        asn = null;
      }
    }
    return { kok, mx, txt, ns, a: ipler, cname, asn };
  } catch {
    return null;
  }
}
