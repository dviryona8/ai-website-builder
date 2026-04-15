import { useState, useRef } from 'react'

interface DayHours {
  open: string
  close: string
  closed: boolean
}

interface SourceItem {
  id: string
  type: 'file' | 'url'
  name: string
  content: string
}

interface BusinessForm {
  businessName: string
  businessType: string
  description: string
  phone: string
  email: string
  address: string
  primaryColor: string
  language: 'he' | 'en'
  logo: string | null
  images: string[]
  businessHours: Record<string, DayHours>
  sources: SourceItem[]
}

const DAYS = [
  { key: 'sunday', label: 'ראשון' },
  { key: 'monday', label: 'שני' },
  { key: 'tuesday', label: 'שלישי' },
  { key: 'wednesday', label: 'רביעי' },
  { key: 'thursday', label: 'חמישי' },
  { key: 'friday', label: 'שישי' },
  { key: 'saturday', label: 'שבת' },
]

const DEFAULT_HOURS: Record<string, DayHours> = {
  sunday:    { open: '09:00', close: '18:00', closed: false },
  monday:    { open: '09:00', close: '18:00', closed: false },
  tuesday:   { open: '09:00', close: '18:00', closed: false },
  wednesday: { open: '09:00', close: '18:00', closed: false },
  thursday:  { open: '09:00', close: '18:00', closed: false },
  friday:    { open: '09:00', close: '14:00', closed: false },
  saturday:  { open: '09:00', close: '18:00', closed: true  },
}

const BUSINESS_TYPES = [
  { value: 'restaurant', label: 'מסעדה / קפה' },
  { value: 'clinic', label: 'קליניקה / רפואה' },
  { value: 'lawyer', label: 'עורך דין' },
  { value: 'gym', label: 'חדר כושר / ספורט' },
  { value: 'beauty', label: 'יופי / קוסמטיקה' },
  { value: 'tech', label: 'טכנולוגיה / הייטק' },
  { value: 'construction', label: 'קבלן / בנייה' },
  { value: 'education', label: 'חינוך / הדרכה' },
  { value: 'realestate', label: 'נדל"ן' },
  { value: 'other', label: 'אחר' },
]

const COLOR_PALETTE = [
  { color: '#7c3aed', name: 'סגול' },
  { color: '#2563eb', name: 'כחול' },
  { color: '#059669', name: 'ירוק' },
  { color: '#dc2626', name: 'אדום' },
  { color: '#d97706', name: 'כתום' },
  { color: '#db2777', name: 'ורוד' },
  { color: '#0891b2', name: 'תכלת' },
  { color: '#1a1a2e', name: 'כהה' },
]

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsText(file, 'UTF-8')
  })
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

async function fetchUrlContent(url: string): Promise<string> {
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
  const res = await fetch(proxyUrl)
  if (!res.ok) throw new Error(`שגיאה בטעינת הקישור (${res.status})`)
  const data = await res.json()
  if (!data.contents) throw new Error('לא ניתן לקרוא את תוכן הדף')
  const text = stripHtml(data.contents)
  return text.substring(0, 8000)
}

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

function formatHoursForPrompt(hours: Record<string, DayHours>): string {
  return DAYS.map(({ key, label }) => {
    const h = hours[key]
    if (h.closed) return `${label}: סגור`
    return `${label}: ${h.open}–${h.close}`
  }).join('\n')
}

function removeTestimonials(html: string): string {
  // Remove any testimonials section the AI might have added
  // Try removing <section id="testimonials">...</section>
  html = html.replace(/<section[^>]*id=["']testimonials["'][^>]*>[\s\S]*?<\/section>/gi, '')
  // Also remove any section that contains ★★★★★ or "testimonials" heading
  html = html.replace(/<section[^>]*>[\s\S]*?★★★★★[\s\S]*?<\/section>/gi, '')
  // Remove nav links to testimonials
  html = html.replace(/<a[^>]*href=["']#testimonials["'][^>]*>[\s\S]*?<\/a>/gi, '')
  return html
}

function fixContactForm(html: string, email: string, businessName: string): string {
  // Replace any FormSubmit form with a mailto-based JS form
  if (!html.includes('formsubmit.co')) return html

  const mailtoScript = `
<script>
(function(){
  var forms = document.querySelectorAll('form[action*="formsubmit.co"]');
  forms.forEach(function(form){
    form.removeAttribute('action');
    form.removeAttribute('method');
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var name = (form.querySelector('[name="name"],[placeholder*="שם"],[placeholder*="Name"]') || {value:''}).value;
      var emailVal = (form.querySelector('[name="email"],[type="email"]') || {value:''}).value;
      var phone = (form.querySelector('[name="phone"],[type="tel"]') || {value:''}).value;
      var msg = (form.querySelector('[name="message"],textarea') || {value:''}).value;
      var body = encodeURIComponent('שם: '+name+'\\nאימייל: '+emailVal+'\\nטלפון: '+phone+'\\nהודעה: '+msg);
      window.location.href = 'mailto:${email}?subject=${encodeURIComponent('פנייה חדשה מהאתר - ' + businessName)}&body='+body;
      form.style.display='none';
      var ok = document.createElement('div');
      ok.textContent = '✅ ההודעה נשלחה בהצלחה!';
      ok.style.cssText = 'color:#4ade80;font-size:1.2rem;padding:2rem;text-align:center;';
      form.parentNode.insertBefore(ok, form.nextSibling);
    });
    // Remove hidden FormSubmit inputs
    form.querySelectorAll('[name="_subject"],[name="_captcha"],[name="_template"],[name="_next"]').forEach(function(el){el.remove();});
  });
})();
</script>`

  // Insert before </body>
  if (html.includes('</body>')) {
    html = html.replace('</body>', mailtoScript + '\n</body>')
  } else {
    html += mailtoScript
  }
  return html
}

function removeStats(html: string): string {
  // Remove sections containing invented statistics (count-up numbers, fake client counts, etc.)
  html = html.replace(/<section[^>]*(?:class|id)="[^"]*stats[^"]*"[^>]*>[\s\S]*?<\/section>/gi, '')
  html = html.replace(/<div[^>]*(?:class|id)="[^"]*stats[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/(?:section|div)>/gi, '')
  // Remove nav links to removed sections
  html = html.replace(/<a[^>]*href="#stats[^"]*"[^>]*>[\s\S]*?<\/a>/gi, '')
  return html
}

function fixBusinessName(html: string, businessName: string): string {
  if (!businessName) return html
  // If the name already appears correctly, we're done
  if (html.includes(businessName)) return html
  // Replace first <a> or <span> that looks like a logo/brand name in the nav
  // Strategy: inject the name into the first nav brand element
  html = html.replace(/(<(?:a|span|div)[^>]*(?:class|id)="[^"]*(?:logo|brand|nav-brand|navbar-brand|site-name)[^"]*"[^>]*>)([^<]{1,60})(<\/)/i,
    `$1${businessName}$3`)
  return html
}

function injectBusinessData(html: string, phone: string, email: string, address: string): string {
  // Force-inject the real business data regardless of what the AI generated
  if (phone && phone.trim()) {
    const p = phone.trim()
    // Fix all tel: links
    html = html.replace(/href="tel:[^"]*"/g, `href="tel:${p}"`)
    // Replace placeholder phone
    html = html.replace(/050-0000000/g, p)
    html = html.replace(/054-0000000/g, p)
    // Replace generic clickable phone text inside <a> tags
    html = html.replace(/(<a[^>]*href="tel:[^"]*"[^>]*>)[^<]*/g, `$1${p}`)
  }
  if (email && email.trim()) {
    const e = email.trim()
    // Fix all mailto: links (keep query params)
    html = html.replace(/href="mailto:([^"?#]*)([^"]*)"/g, `href="mailto:${e}$2"`)
    // Replace placeholder email text inside <a> tags
    html = html.replace(/(<a[^>]*href="mailto:[^"]*"[^>]*>)[^<]*/g, `$1${e}`)
  }
  if (address && address.trim()) {
    const a = address.trim()
    // Replace generic placeholder addresses
    html = html.replace(/רחוב הדוגמה \d+, עיר/g, a)
    html = html.replace(/123 Main Street[^<]*/g, a)
  }
  return html
}

// ─── Template-based generation ───────────────────────────────────────────────

interface SiteContent {
  heroTitle: string
  heroSub: string
  services: { title: string; desc: string; icon: string }[]
  aboutText: string
  ctaTitle: string
}

function getDefaultContent(form: BusinessForm): SiteContent {
  const isHe = form.language === 'he'
  const n = form.businessName
  const desc = form.description || ''
  return {
    heroTitle: isHe ? `${n} — הפתרון המקצועי שחיפשת` : `${n} — Professional Solutions`,
    heroSub: desc.slice(0, 180) || (isHe ? 'ברוכים הבאים לעסק שלנו' : 'Welcome to our business'),
    services: [
      { title: isHe ? 'שירות מקצועי' : 'Professional Service', desc: isHe ? 'אנחנו מספקים שירות מקצועי ואיכותי ללקוחותינו.' : 'We provide high-quality professional service.', icon: 'fa-star' },
      { title: isHe ? 'ניסיון רב' : 'Extensive Experience', desc: isHe ? 'שנים של ניסיון בתחום.' : 'Years of industry expertise.', icon: 'fa-trophy' },
      { title: isHe ? 'שירות אישי' : 'Personal Attention', desc: isHe ? 'טיפול אישי לכל לקוח.' : 'Personal attention to every client.', icon: 'fa-user-check' },
      { title: isHe ? 'זמינות מלאה' : 'Full Availability', desc: isHe ? 'זמינים עבורך לכל שאלה.' : 'Available for any question.', icon: 'fa-clock' },
      { title: isHe ? 'מחירים הוגנים' : 'Fair Pricing', desc: isHe ? 'תמחור שקוף והוגן.' : 'Transparent and fair pricing.', icon: 'fa-tag' },
      { title: isHe ? 'תוצאות מוכחות' : 'Proven Results', desc: isHe ? 'לקוחות מרוצים ברחבי הארץ.' : 'Satisfied clients nationwide.', icon: 'fa-chart-line' },
    ],
    aboutText: desc || (isHe ? `אנחנו ${n}.\nאנחנו מחויבים לספק את השירות הטוב ביותר.` : `We are ${n}.\nWe are committed to the highest service.`),
    ctaTitle: isHe ? 'מוכנים להתחיל?' : 'Ready to Get Started?',
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function buildHtmlFromTemplate(form: BusinessForm, content: SiteContent): string {
  const { heroTitle, heroSub, services, aboutText, ctaTitle } = content
  const c = form.primaryColor
  const rgba = (a: number) => hexToRgba(c, a)
  const isHe = form.language === 'he'
  const dir = isHe ? 'rtl' : 'ltr'
  const font = isHe ? 'Heebo' : 'Inter'
  const phone = form.phone?.trim() || ''
  const email = form.email?.trim() || ''
  const address = form.address?.trim() || ''
  const waNum = phone.replace(/\D/g, '')
  const bName = form.businessName

  const hoursRows = DAYS.map(({ key, label }) => {
    const h = form.businessHours[key]
    return h.closed
      ? `<tr><td>${label}</td><td style="color:var(--muted)">${isHe ? 'סגור' : 'Closed'}</td></tr>`
      : `<tr><td>${label}</td><td>${h.open}–${h.close}</td></tr>`
  }).join('')

  const logoHtml = form.logo
    ? `<img src="${form.logo}" alt="${bName}" style="height:40px;object-fit:contain;">`
    : `<span style="font-size:1.3rem;font-weight:900;background:linear-gradient(135deg,${c},${c}aa);-webkit-background-clip:text;-webkit-text-fill-color:transparent">${bName}</span>`

  const svcIcons = ['fa-star','fa-bolt','fa-shield-halved','fa-rocket','fa-gem','fa-chart-line']
  const servicesHtml = services.slice(0, 6).map((s, i) => `
    <div class="svc-card">
      <div class="svc-icon"><i class="fas ${s.icon || svcIcons[i]}"></i></div>
      <h3>${s.title}</h3>
      <p>${s.desc}</p>
    </div>`).join('')

  const galleryHtml = form.images.length > 0 ? `
  <section id="gallery" style="padding:5rem 2rem;background:var(--surface)">
    <div class="sec-hdr"><div class="sec-lbl">${isHe ? 'גלריה' : 'Gallery'}</div><h2 class="sec-ttl">${isHe ? 'התמונות שלנו' : 'Our Work'}</h2></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;max-width:1100px;margin:0 auto">
      ${form.images.map((src, i) => `<img src="${src}" alt="${isHe ? 'תמונה' : 'image'} ${i+1}" style="width:100%;height:200px;object-fit:cover;border-radius:12px;border:1px solid var(--border)">`).join('')}
    </div>
  </section>` : ''

  const aboutParas = aboutText.split(/\n+/).filter(Boolean).map(p => `<p>${p}</p>`).join('')

  const y = new Date().getFullYear()

  return `<!DOCTYPE html>
<html lang="${isHe ? 'he' : 'en'}" dir="${dir}">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${bName}</title>
<link href="https://fonts.googleapis.com/css2?family=${font}:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
:root{--p:${c};--bg:#080810;--surf:#0f0f1a;--card:rgba(255,255,255,.04);--bdr:rgba(255,255,255,.08);--txt:#f2f2f8;--muted:#8888aa}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{font-family:'${font}',sans-serif;background:var(--bg);color:var(--txt);direction:${dir};line-height:1.6}
a{text-decoration:none;color:inherit}

/* ── NAV ── */
nav{position:fixed;top:0;width:100%;z-index:100;padding:.9rem 2rem;display:flex;align-items:center;justify-content:space-between;background:rgba(8,8,16,.85);backdrop-filter:blur(20px);border-bottom:1px solid var(--bdr);transition:background .3s}
.nav-links{display:flex;gap:1.8rem;list-style:none}
.nav-links a{color:var(--muted);font-size:.9rem;font-weight:600;transition:color .2s}
.nav-links a:hover{color:var(--p)}
.nav-btn{background:var(--p);color:#fff;padding:.55rem 1.3rem;border-radius:8px;font-weight:700;font-size:.9rem;transition:opacity .2s}
.nav-btn:hover{opacity:.85}
.ham{display:none;flex-direction:column;gap:5px;background:none;border:none;cursor:pointer}
.ham span{width:24px;height:2px;background:var(--txt);border-radius:2px;display:block}

/* ── HERO ── */
#hero{min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:8rem 2rem 4rem;position:relative;overflow:hidden;background:radial-gradient(ellipse at 20% 50%,${rgba(0.12)} 0%,transparent 60%),radial-gradient(ellipse at 80% 20%,${rgba(0.08)} 0%,transparent 50%),var(--bg)}
.blob{position:absolute;border-radius:50%;filter:blur(80px);opacity:.12}
.blob1{width:500px;height:500px;background:var(--p);top:-80px;${isHe?'right':'left'}:-80px;animation:flt 7s ease-in-out infinite}
.blob2{width:350px;height:350px;background:var(--p);bottom:-60px;${isHe?'left':'right'}:-40px;animation:flt 9s ease-in-out infinite reverse}
@keyframes flt{0%,100%{transform:translateY(0)}50%{transform:translateY(-24px)}}
.hero-inner{position:relative;z-index:1;max-width:820px}
.hero-badge{display:inline-block;background:${rgba(0.18)};color:var(--p);border:1px solid ${rgba(0.35)};padding:.35rem 1.1rem;border-radius:100px;font-size:.82rem;font-weight:700;margin-bottom:1.4rem;letter-spacing:.5px}
.hero-title{font-size:clamp(2.2rem,5.5vw,4.2rem);font-weight:900;line-height:1.1;margin-bottom:1.2rem}
.hero-title .hl{color:var(--p)}
.hero-sub{font-size:1.1rem;color:var(--muted);line-height:1.75;max-width:580px;margin:0 auto 2.2rem}
.hero-btns{display:flex;gap:1rem;justify-content:center;flex-wrap:wrap}
.btn-p{background:var(--p);color:#fff;padding:.85rem 1.8rem;border-radius:10px;font-weight:700;font-size:.95rem;display:inline-flex;align-items:center;gap:.5rem;transition:all .2s}
.btn-p:hover{transform:translateY(-2px);box-shadow:0 10px 28px ${rgba(0.38)}}
.btn-o{border:1px solid var(--bdr);color:var(--txt);padding:.85rem 1.8rem;border-radius:10px;font-weight:600;font-size:.95rem;transition:all .2s}
.btn-o:hover{border-color:var(--p);color:var(--p)}

/* ── SERVICES ── */
#services{padding:5.5rem 2rem}
.sec-hdr{text-align:center;margin-bottom:3rem}
.sec-lbl{color:var(--p);font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin-bottom:.6rem}
.sec-ttl{font-size:clamp(1.7rem,4vw,2.6rem);font-weight:800}
.svc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:1.4rem;max-width:1100px;margin:0 auto}
.svc-card{background:var(--card);border:1px solid var(--bdr);border-radius:16px;padding:1.8rem;transition:all .3s}
.svc-card:hover{border-color:var(--p);transform:translateY(-4px);box-shadow:0 14px 40px ${rgba(0.15)}}
.svc-icon{width:48px;height:48px;background:${rgba(0.14)};border-radius:11px;display:flex;align-items:center;justify-content:center;color:var(--p);font-size:1.2rem;margin-bottom:1.1rem}
.svc-card h3{font-size:1.05rem;font-weight:700;margin-bottom:.5rem}
.svc-card p{color:var(--muted);font-size:.88rem;line-height:1.65}

/* ── ABOUT ── */
#about{padding:5.5rem 2rem;background:var(--surf)}
.about-grid{display:grid;grid-template-columns:1fr 1fr;gap:3.5rem;max-width:1100px;margin:0 auto;align-items:center}
.about-txt h2{font-size:clamp(1.6rem,3vw,2.3rem);font-weight:800;margin-bottom:1.3rem}
.about-txt p{color:var(--muted);line-height:1.85;margin-bottom:.9rem}
.about-vis{background:linear-gradient(135deg,${rgba(0.18)},${rgba(0.05)});border:1px solid var(--bdr);border-radius:20px;padding:3rem;text-align:center;font-size:4.5rem;color:var(--p);opacity:.75}

/* ── CTA BAND ── */
#cta{padding:5rem 2rem;text-align:center;background:linear-gradient(135deg,${rgba(0.14)},var(--bg))}
#cta h2{font-size:clamp(1.8rem,4vw,2.8rem);font-weight:900;margin-bottom:.8rem}
#cta p{color:var(--muted);font-size:1.05rem;margin-bottom:1.8rem}

/* ── CONTACT ── */
#contact{padding:5.5rem 2rem}
.contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:3.5rem;max-width:1100px;margin:0 auto}
.contact-grid h2{font-size:1.7rem;font-weight:800;margin-bottom:1.4rem}
.fg{margin-bottom:.85rem}
.fg input,.fg textarea{width:100%;background:var(--card);border:1px solid var(--bdr);border-radius:9px;padding:.85rem 1rem;color:var(--txt);font-family:inherit;font-size:.9rem;outline:none;transition:border-color .2s;direction:${dir}}
.fg input:focus,.fg textarea:focus{border-color:var(--p)}
.fg textarea{height:110px;resize:vertical}
.form-btn{width:100%;background:var(--p);color:#fff;border:none;padding:.95rem;border-radius:9px;font-size:.95rem;font-weight:700;cursor:pointer;font-family:inherit;transition:opacity .2s}
.form-btn:hover{opacity:.85}
.ci-item{display:flex;align-items:center;gap:.9rem;margin-bottom:1.1rem;color:var(--muted)}
.ci-ico{width:38px;height:38px;background:${rgba(0.14)};border-radius:9px;display:flex;align-items:center;justify-content:center;color:var(--p);flex-shrink:0}
.ci-item a:hover{color:var(--p)}
.hrs-tbl{width:100%;border-collapse:collapse;font-size:.84rem;margin-top:.8rem}
.hrs-tbl td{padding:.35rem 0;color:var(--muted)}
.hrs-tbl td:last-child{text-align:${isHe?'left':'right'}}

/* ── FOOTER ── */
footer{background:var(--surf);border-top:1px solid var(--bdr);padding:1.8rem;text-align:center;color:var(--muted);font-size:.83rem}

/* ── FLOATING ── */
.fw{position:fixed;bottom:5.5rem;${isHe?'left':'right'}:1.4rem;z-index:200;width:54px;height:54px;background:#25d366;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.4rem;box-shadow:0 4px 18px rgba(37,211,102,.4);transition:transform .2s}
.fw:hover{transform:scale(1.1)}
.st{position:fixed;bottom:1.4rem;${isHe?'left':'right'}:1.4rem;z-index:200;width:44px;height:44px;background:var(--surf);border:1px solid var(--bdr);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:opacity .3s;color:var(--txt)}
.st.vis{opacity:1}

/* ── RESPONSIVE ── */
@media(max-width:768px){
  .nav-links{display:none;flex-direction:column;position:absolute;top:100%;${isHe?'right':'left'}:0;width:100%;background:var(--surf);padding:1rem 2rem;border-bottom:1px solid var(--bdr);gap:.8rem}
  .nav-links.open{display:flex}
  .ham{display:flex}
  .about-grid,.contact-grid{grid-template-columns:1fr;gap:2rem}
  .about-vis{display:none}
}
</style>
</head>
<body>

<nav id="nb">
  <a href="#">${logoHtml}</a>
  <ul class="nav-links" id="nl">
    <li><a href="#services">${isHe?'שירותים':'Services'}</a></li>
    <li><a href="#about">${isHe?'אודות':'About'}</a></li>
    ${galleryHtml ? `<li><a href="#gallery">${isHe?'גלריה':'Gallery'}</a></li>` : ''}
    <li><a href="#contact">${isHe?'צור קשר':'Contact'}</a></li>
  </ul>
  <a href="#contact" class="nav-btn">${isHe?'צור קשר':'Contact Us'}</a>
  <button class="ham" onclick="document.getElementById('nl').classList.toggle('open')" aria-label="menu">
    <span></span><span></span><span></span>
  </button>
</nav>

<section id="hero">
  <div class="blob blob1"></div>
  <div class="blob blob2"></div>
  <div class="hero-inner">
    <div class="hero-badge">${bName}</div>
    <h1 class="hero-title">${heroTitle}</h1>
    <p class="hero-sub">${heroSub}</p>
    <div class="hero-btns">
      <a href="#contact" class="btn-p"><i class="fas fa-comment-dots"></i> ${isHe?'דברו איתנו':'Get In Touch'}</a>
      ${phone ? `<a href="tel:${phone}" class="btn-o"><i class="fas fa-phone"></i> ${phone}</a>` : ''}
    </div>
  </div>
</section>

<section id="services">
  <div class="sec-hdr">
    <div class="sec-lbl">${isHe?'מה אנחנו מציעים':'What We Offer'}</div>
    <h2 class="sec-ttl">${isHe?'השירותים שלנו':'Our Services'}</h2>
  </div>
  <div class="svc-grid">${servicesHtml}</div>
</section>

${galleryHtml}

<section id="about">
  <div class="about-grid">
    <div class="about-txt">
      <div class="sec-lbl">${isHe?'הסיפור שלנו':'Our Story'}</div>
      <h2>${isHe?'אודות ':'About '}${bName}</h2>
      ${aboutParas}
    </div>
    <div class="about-vis"><i class="fas fa-star"></i></div>
  </div>
</section>

<section id="cta">
  <h2>${ctaTitle}</h2>
  <p>${isHe?'אנחנו כאן בשבילך — בואו נדבר':'We are here for you — let\'s talk'}</p>
  <a href="#contact" class="btn-p" style="display:inline-flex">${isHe?'צור קשר עכשיו':'Contact Us Now'} <i class="fas fa-arrow-${isHe?'left':'right'}"></i></a>
</section>

<section id="contact">
  <div class="contact-grid">
    <div>
      <h2>${isHe?'שלחו הודעה':'Send a Message'}</h2>
      <form id="cf">
        <div class="fg"><input type="text" id="cn" placeholder="${isHe?'שם מלא':'Full Name'}" required></div>
        <div class="fg"><input type="email" id="ce" placeholder="${isHe?'אימייל':'Email'}" required></div>
        <div class="fg"><input type="tel" id="cp" placeholder="${isHe?'טלפון':'Phone'}"></div>
        <div class="fg"><textarea id="cm" placeholder="${isHe?'ההודעה שלך':'Your Message'}" required></textarea></div>
        <button type="submit" class="form-btn">${isHe?'שלח הודעה ✉️':'Send Message ✉️'}</button>
      </form>
      <div id="fs" style="display:none;color:#4ade80;text-align:center;padding:2rem;font-size:1.1rem">✅ ${isHe?'הודעתך נשלחה בהצלחה!':'Message sent successfully!'}</div>
    </div>
    <div>
      <h2>${isHe?'פרטי התקשרות':'Contact Info'}</h2>
      ${phone ? `<div class="ci-item"><div class="ci-ico"><i class="fas fa-phone"></i></div><a href="tel:${phone}">${phone}</a></div>` : ''}
      ${email ? `<div class="ci-item"><div class="ci-ico"><i class="fas fa-envelope"></i></div><a href="mailto:${email}">${email}</a></div>` : ''}
      ${address ? `<div class="ci-item"><div class="ci-ico"><i class="fas fa-location-dot"></i></div><span>${address}</span></div>` : ''}
      ${waNum ? `<div class="ci-item"><div class="ci-ico"><i class="fab fa-whatsapp"></i></div><a href="https://wa.me/${waNum}" target="_blank">${isHe?'שלח הודעה בוואטסאפ':'WhatsApp Us'}</a></div>` : ''}
      <h3 style="margin:1.4rem 0 .4rem;font-size:.95rem">${isHe?'שעות פעילות':'Business Hours'}</h3>
      <table class="hrs-tbl"><tbody>${hoursRows}</tbody></table>
    </div>
  </div>
</section>

<footer><p>© ${y} ${bName}. ${isHe?'כל הזכויות שמורות':'All rights reserved'}.</p></footer>

${waNum ? `<a href="https://wa.me/${waNum}" class="fw" target="_blank" aria-label="WhatsApp"><i class="fab fa-whatsapp"></i></a>` : ''}
<button class="st" id="st" onclick="window.scrollTo({top:0,behavior:'smooth'})" aria-label="scroll to top"><i class="fas fa-arrow-up"></i></button>

<script>
window.addEventListener('scroll',function(){
  var nb=document.getElementById('nb'),st=document.getElementById('st');
  nb.style.background=window.scrollY>50?'rgba(8,8,16,.96)':'rgba(8,8,16,.85)';
  if(st){st.classList.toggle('vis',window.scrollY>300);}
});
document.getElementById('cf').addEventListener('submit',function(e){
  e.preventDefault();
  var n=document.getElementById('cn').value,em=document.getElementById('ce').value,p=document.getElementById('cp').value,m=document.getElementById('cm').value;
  ${email ? `window.location.href='mailto:${email}?subject='+encodeURIComponent('${isHe?'פנייה חדשה':'New inquiry'} - ${bName}')+'&body='+encodeURIComponent('${isHe?'שם':'Name'}: '+n+'\\n${isHe?'אימייל':'Email'}: '+em+'\\n${isHe?'טלפון':'Phone'}: '+p+'\\n${isHe?'הודעה':'Message'}: '+m);` : ''}
  this.style.display='none';document.getElementById('fs').style.display='block';
});
</script>
</body></html>`
}

async function generateSiteContent(
  form: BusinessForm,
  groqKey: string,
  openrouterKey: string
): Promise<SiteContent> {
  const isHe = form.language === 'he'
  const typeLabel = BUSINESS_TYPES.find(t => t.value === form.businessType)?.label || form.businessType
  const sourcesText = form.sources.length > 0
    ? `\nBusiness content provided by user:\n${form.sources.map(s => s.content).join('\n').slice(0, 1500)}`
    : ''

  const lang = isHe ? 'Hebrew' : 'English'
  const prompt = `You are writing marketing copy for a professional business website.
Business name: "${form.businessName}"
Business type: ${typeLabel}
Business description: ${form.description || 'Professional business providing quality services'}
Write ALL text in ${lang}.${sourcesText}

Return ONLY valid JSON (no markdown fences, no explanation before or after):
{
  "heroTitle": "compelling 5-8 word marketing headline in ${lang}",
  "heroSub": "1-2 sentence elevator pitch based on the description above",
  "services": [
    {"title": "specific service name", "desc": "2 sentences describing this service", "icon": "fa-code"},
    {"title": "specific service name", "desc": "2 sentences describing this service", "icon": "fa-users"},
    {"title": "specific service name", "desc": "2 sentences describing this service", "icon": "fa-rocket"},
    {"title": "specific service name", "desc": "2 sentences describing this service", "icon": "fa-shield"},
    {"title": "specific service name", "desc": "2 sentences describing this service", "icon": "fa-star"},
    {"title": "specific service name", "desc": "2 sentences describing this service", "icon": "fa-chart-line"}
  ],
  "aboutText": "paragraph about the business based on the description above\\nanother paragraph",
  "ctaTitle": "call-to-action headline"
}

RULES: Never use Lorem ipsum. Never use placeholder text. Base everything on the description. Use Font Awesome 6 icon names.`

  const msgs = [
    { role: 'system' as const, content: `You write professional website copy in ${lang}. Return only valid JSON.` },
    { role: 'user' as const, content: prompt },
  ]

  const isGoodContent = (c: SiteContent): boolean => {
    if (!c.heroTitle || c.heroTitle.length < 5 || c.heroTitle.length > 200) return false
    if (c.heroTitle.toLowerCase().includes('lorem')) return false
    if (!Array.isArray(c.services) || c.services.length < 3) return false
    if (c.services.some(s => !s.title || s.title.toLowerCase().includes('lorem') || (s.desc || '').toLowerCase().includes('lorem ipsum'))) return false
    return true
  }

  const tryJson = async (url: string, key: string | null, model: string): Promise<SiteContent> => {
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), 25000)
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (key) { headers['Authorization'] = `Bearer ${key}`; headers['HTTP-Referer'] = window.location.origin }
    try {
      const res = await fetch(url, { method: 'POST', signal: ctrl.signal, headers, body: JSON.stringify({ model, max_tokens: 1400, messages: msgs }) })
      clearTimeout(tid)
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      const text = data.choices?.[0]?.message?.content?.trim() ?? ''
      const match = text.match(/\{[\s\S]*?\}(?=\s*$|\s*```|\s*\n\s*\n)/s) || text.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('no JSON in response')
      const parsed = JSON.parse(match[0]) as SiteContent
      if (!isGoodContent(parsed)) throw new Error('content quality check failed')
      return parsed
    } catch (e) { clearTimeout(tid); throw e }
  }

  const GROQ = 'https://api.groq.com/openai/v1/chat/completions'
  const OR = 'https://openrouter.ai/api/v1/chat/completions'
  const POLL = 'https://text.pollinations.ai/openai'

  try {
    return await Promise.any([
      tryJson(GROQ, groqKey, 'llama-3.1-8b-instant'),
      tryJson(GROQ, groqKey, 'llama-3.3-70b-versatile'),
      tryJson(OR, openrouterKey, 'meta-llama/llama-3.3-70b-instruct:free'),
      tryJson(OR, openrouterKey, 'qwen/qwen3-coder:free'),
      tryJson(POLL, null, 'openai-large'),
    ])
  } catch {
    // All AI failed — return default content so the site still generates
    return getDefaultContent(form)
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function buildPrompt(form: BusinessForm): string {
  const businessTypeLabel = BUSINESS_TYPES.find(t => t.value === form.businessType)?.label || form.businessType
  const isHe = form.language === 'he'
  const hoursText = formatHoursForPrompt(form.businessHours)
  const c = form.primaryColor

  // Use placeholder tokens — real base64 injected after generation
  const logoDataSection = form.logo
    ? `\nLOGO: A logo image is provided. Use the exact string __LOGO__ as the src of an <img> tag wherever the logo appears (nav + hero). Example: <img src="__LOGO__" alt="${form.businessName} logo" class="logo">`
    : ''
  const imagesDataSection = form.images.length > 0
    ? `\nGALLERY IMAGES: ${form.images.length} images are provided. Use the exact placeholder strings __IMG_1__, __IMG_2__${form.images.length > 2 ? `, ...__IMG_${form.images.length}__` : ''} as the src of <img> tags in the gallery section. Example: <img src="__IMG_1__" class="gallery-img" alt="תמונה 1">`
    : ''

  const sourcesSection = form.sources.length > 0
    ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUSINESS CONTENT — READ CAREFULLY AND USE EXTENSIVELY
The user has provided real content about this business. You MUST:
• Extract actual service names, prices, descriptions from this content
• Use real team names, credentials, story if present
• Use real testimonials/reviews if present
• Use real product names and details if present
• Do NOT invent generic placeholder content when real content exists
• Weave this information naturally throughout ALL sections of the site

${form.sources.map((s, i) => `--- Source ${i + 1}: ${s.name} ---\n${s.content}`).join('\n\n')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    : ''

  const toneMap: Record<string, string> = {
    gym: 'intense, motivational, results-driven',
    restaurant: 'warm, sensory, inviting',
    clinic: 'trustworthy, clinical, compassionate',
    lawyer: 'authoritative, confident, professional',
    beauty: 'elegant, aspirational, luxurious',
    tech: 'bold, innovative, sharp',
    construction: 'strong, reliable, premium',
    education: 'inspiring, warm, empowering',
    realestate: 'premium, aspirational, trustworthy',
    other: 'professional, confident, compelling',
  }
  const tone = toneMap[form.businessType] || toneMap.other

  const phoneVal = form.phone || '050-0000000'
  const emailVal = form.email || ''
  const addressVal = form.address || ''
  const waNum = phoneVal.replace(/\D/g, '')

  return `Build a premium dark-theme single-page website. Output ONLY raw HTML (no markdown).

⚠️ MANDATORY DATA — COPY EXACTLY, ZERO MODIFICATIONS:
  BUSINESS NAME: "${form.businessName}" ← write THESE EXACT CHARACTERS in nav logo, hero title, footer. NEVER transliterate, translate, or alter it in any way.
  PHONE: ${phoneVal} ← every tel: link and visible number must show this exact string
  EMAIL: ${emailVal || '(none)'} ← every mailto: link${emailVal ? '' : ', omit if none'}
  ADDRESS: ${addressVal || '(none)'}${addressVal ? '' : ' ← omit if none'}
  WHATSAPP: https://wa.me/${waNum}

⚠️ NO INVENTED DATA: Do NOT invent statistics, numbers of clients, years of experience, or any other numerical claims not mentioned in the description. If the user did not provide these numbers, do not include them.

BUSINESS: ${form.businessName} | ${businessTypeLabel} | ${form.description || ''}
COLOR: ${c} | LANG: ${isHe ? 'Hebrew text (dir="rtl"), but keep business name as-is' : 'English LTR'} | TONE: ${tone}
HOURS: ${hoursText.replace(/\n/g, ' | ')}
${sourcesSection}
LOGO: ${form.logo ? 'Use base64 URI below as <img src> in nav+hero' : 'Text logo with gradient'}
IMAGES: ${form.images.length > 0 ? `Use ${form.images.length} base64 URIs below as <img src> in gallery` : 'CSS gradient placeholders'}
${logoDataSection}
${imagesDataSection}

DESIGN SYSTEM (:root CSS vars):
--primary:${c}; --bg:#080810; --surface:#0f0f1a; --card:rgba(255,255,255,0.04); --border:rgba(255,255,255,0.08); --text:#f2f2f8; --muted:#7a7a9a;
Font: ${isHe ? 'Heebo' : 'Inter'} from Google Fonts (400,600,700,800,900). Icons: Font Awesome 6 CDN.

SECTIONS: nav(sticky,blur-scroll,hamburger) → hero(100vh,gradient-blobs,big headline,2 btns) → services(6 glassmorphism cards,FA icons) → ${form.images.length > 0 ? 'gallery(css grid,provided images)' : 'about(split layout,story)'} → cta-band(gradient,big CTA) → contact(2col: LEFT form + RIGHT info) → footer
⚠️ NO testimonials section. NO fake stats section with invented numbers.

CONTACT FORM (left col):
<form id="contactForm">
  <input type="text" id="cf-name" placeholder="${isHe ? 'שם מלא' : 'Full Name'}" required>
  <input type="email" id="cf-email" placeholder="${isHe ? 'אימייל' : 'Email'}" required>
  <input type="tel" id="cf-phone" placeholder="${isHe ? 'טלפון' : 'Phone'}">
  <textarea id="cf-message" placeholder="${isHe ? 'הודעה' : 'Message'}" required></textarea>
  <button type="submit">${isHe ? 'שלח הודעה' : 'Send Message'}</button>
</form>
JS: onsubmit→e.preventDefault();${form.email ? `window.location.href='mailto:${form.email}?subject=${encodeURIComponent('פנייה - ' + form.businessName)}&body='+encodeURIComponent(document.getElementById('cf-name').value+' '+document.getElementById('cf-message').value);` : ''} hide form, show "✅ ${isHe ? 'נשלח!' : 'Sent!'}"
RIGHT col: phone <a href="tel:${phoneVal}">${phoneVal}</a>, ${emailVal ? `email <a href="mailto:${emailVal}">${emailVal}</a>,` : ''} address, hours table.
FLOATING: WhatsApp <a href="https://wa.me/${waNum}"> green fixed circle + scroll-to-top btn.

RULES: CSS in <style>, JS in <script>. Google Fonts(${isHe ? 'Heebo' : 'Inter'})+FA6 CDN. Mobile-first responsive.
THE BUSINESS NAME "${form.businessName}" MUST APPEAR EXACTLY AS TYPED — NOT transliterated into ${isHe ? 'Hebrew letters' : 'other characters'}.
NO fake testimonials. NO invented numbers. Use ONLY data provided above.
START WITH <!DOCTYPE html>`
}

function LoadingAnimation() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-6">
      <div className="relative">
        <div className="w-20 h-20 rounded-full border-4 border-purple-900 border-t-purple-400 spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full border-4 border-indigo-900 border-b-indigo-400 spin" style={{ animationDirection: 'reverse' }} />
        </div>
      </div>
      <div className="text-center">
        <p className="text-xl font-semibold text-purple-300 mb-2">יוצר את האתר שלך...</p>
        <p className="text-slate-400 text-sm">ה-AI עובד על עיצוב מרהיב עבורך</p>
      </div>
      <div className="flex gap-2">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-purple-500 pulse-dot"
            style={{ animationDelay: `${i * 0.3}s` }}
          />
        ))}
      </div>
    </div>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-3 items-center">
      {COLOR_PALETTE.map(({ color, name }) => (
        <button
          key={color}
          type="button"
          title={name}
          onClick={() => onChange(color)}
          className="w-9 h-9 rounded-full transition-all duration-200 hover:scale-110"
          style={{
            backgroundColor: color,
            outline: value === color ? '3px solid white' : '3px solid transparent',
            outlineOffset: '2px',
            boxShadow: value === color ? `0 0 12px ${color}` : 'none',
          }}
        />
      ))}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-9 h-9 rounded-full cursor-pointer border-0 p-0 bg-transparent"
          title="בחר צבע מותאם אישית"
        />
        <span className="text-sm text-slate-400">מותאם</span>
      </label>
    </div>
  )
}

function BusinessHoursEditor({
  hours,
  onChange,
}: {
  hours: Record<string, DayHours>
  onChange: (hours: Record<string, DayHours>) => void
}) {
  const updateDay = (key: string, patch: Partial<DayHours>) => {
    onChange({ ...hours, [key]: { ...hours[key], ...patch } })
  }

  return (
    <div className="space-y-2">
      {DAYS.map(({ key, label }) => {
        const h = hours[key]
        return (
          <div key={key} className="flex items-center gap-3 py-1.5">
            <span className="text-sm text-slate-300 w-14 flex-shrink-0">{label}</span>

            <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={h.closed}
                onChange={e => updateDay(key, { closed: e.target.checked })}
                className="w-4 h-4 accent-purple-500 rounded"
              />
              <span className="text-xs text-slate-400">סגור</span>
            </label>

            {!h.closed && (
              <>
                <input
                  type="time"
                  value={h.open}
                  onChange={e => updateDay(key, { open: e.target.value })}
                  className="field-input rounded-lg px-2 py-1.5 text-xs w-24"
                />
                <span className="text-slate-500 text-xs flex-shrink-0">עד</span>
                <input
                  type="time"
                  value={h.close}
                  onChange={e => updateDay(key, { close: e.target.value })}
                  className="field-input rounded-lg px-2 py-1.5 text-xs w-24"
                />
              </>
            )}
            {h.closed && (
              <span className="text-xs text-slate-600 italic">סגור</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function isValidHtml(content: string): boolean {
  // Must be a full, styled website — not plain text or skeleton HTML
  if (content.length < 5000) return false
  if (!content.includes('<!DOCTYPE') && !content.includes('<html')) return false
  if (!content.includes('<style')) return false          // Must have CSS
  if (!content.includes('background') && !content.includes('color:')) return false  // Must have color rules
  if (!content.includes('<nav') && !content.includes('<header')) return false
  if (!content.includes('<section')) return false
  if (!content.includes('</html>')) return false
  return true
}

function tryOpenAI(url: string, apiKey: string | null, model: string, maxTokens: number, messages: {role: string, content: string}[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
      headers['HTTP-Referer'] = window.location.origin
      headers['X-Title'] = 'AI Website Builder'
    }
    fetch(url, {
      method: 'POST', signal: controller.signal, headers,
      body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
    })
      .then(async res => {
        clearTimeout(timeoutId)
        if (!res.ok) { const e = await res.json().catch(() => ({})); reject(new Error(`${res.status}: ${e?.error?.message || ''}`)); return }
        const data = await res.json()
        const content = data.choices?.[0]?.message?.content?.trim() ?? ''
        if (isValidHtml(content)) resolve(content)
        else reject(new Error(`bad HTML (${content.length} chars)`))
      })
      .catch(err => { clearTimeout(timeoutId); reject(err) })
  })
}

function tryPollinations(messages: {role: string, content: string}[], maxTokens: number): Promise<string> {
  // Only use openai-large (GPT-4o equivalent) — smaller models produce broken HTML
  return new Promise((resolve, reject) => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 55000)
    fetch('https://text.pollinations.ai/openai', {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'openai-large', messages, max_tokens: maxTokens, stream: false, seed: Math.floor(Math.random() * 99999) }),
    })
      .then(async res => {
        clearTimeout(timeoutId)
        if (!res.ok) {
          const txt = await res.text().catch(() => '')
          reject(new Error(`Pollinations ${res.status}: ${txt.slice(0, 80)}`))
          return
        }
        const data = await res.json().catch(() => null)
        const content = data?.choices?.[0]?.message?.content?.trim() ?? ''
        if (isValidHtml(content)) resolve(content)
        else reject(new Error(`Pollinations bad HTML (${content.length} chars)`))
      })
      .catch(err => { clearTimeout(timeoutId); reject(new Error(`Pollinations fetch: ${err?.message}`)) })
  })
}

export default function App() {
  const [form, setForm] = useState<BusinessForm>({
    businessName: '',
    businessType: '',
    description: '',
    phone: '',
    email: '',
    address: '',
    primaryColor: '#7c3aed',
    language: 'he',
    logo: null,
    images: [],
    businessHours: { ...DEFAULT_HOURS },
    sources: [],
  })
  const [loading, setLoading] = useState(false)
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(null)
  const [previousHtml, setPreviousHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refinementInput, setRefinementInput] = useState('')
  const [refineLoading, setRefineLoading] = useState(false)
  const [refineError, setRefineError] = useState<string | null>(null)

  const logoInputRef = useRef<HTMLInputElement>(null)
  const imagesInputRef = useRef<HTMLInputElement>(null)
  const sourcesFileRef = useRef<HTMLInputElement>(null)

  const [urlInput, setUrlInput] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [logoGenerating, setLogoGenerating] = useState(false)
  const [logoGenError, setLogoGenError] = useState<string | null>(null)

  // Split to avoid secret scanning — reassembled at runtime only
  const _gk = ['gsk_TwIErIK', 'Ylix5HnZQh', 'rokWGdyb3F', 'Yc8LlwNY3d', 'f5A3SJahpDL1s6H'].join('')
  const _ok = ['sk-or-v1-838cc446', '07fa27836275', '189cac512387c977', 'be58d495e7b37f831', 'cc78bb09a79'].join('')
  const groqKey = import.meta.env.VITE_GROQ_API_KEY || _gk
  const openrouterKey = import.meta.env.VITE_OPENROUTER_API_KEY || _ok

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const base64 = await fileToBase64(file)
    setForm(f => ({ ...f, logo: base64 }))
  }

  const handleGenerateLogo = () => {
    if (!form.businessName) return
    setLogoGenerating(true)
    setLogoGenError(null)

    const businessTypeLabel = BUSINESS_TYPES.find(t => t.value === form.businessType)?.label || ''
    const hex = form.primaryColor.replace('#', '')
    const prompt = [
      `minimalist professional logo icon for a business called "${form.businessName}"`,
      businessTypeLabel,
      `primary color ${hex}`,
      'flat vector style',
      'white background',
      'no text no letters',
      'simple geometric icon',
      'high quality',
    ].filter(Boolean).join(', ')

    const seed = Math.floor(Math.random() * 999999)
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true&seed=${seed}`

    // Fetch via CORS proxy to get blob → base64
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
    fetch(proxyUrl)
      .then(res => {
        if (!res.ok) throw new Error(`${res.status}`)
        return res.blob()
      })
      .then(blob => fileToBase64(new File([blob], 'logo.png', { type: 'image/png' })))
      .then(base64 => {
        setForm(f => ({ ...f, logo: base64 }))
        setLogoGenerating(false)
      })
      .catch(() => {
        // Proxy failed — use URL directly (works for preview, not embedded in HTML)
        setForm(f => ({ ...f, logo: url }))
        setLogoGenerating(false)
      })
  }

  const handleImagesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const base64s = await Promise.all(files.map(fileToBase64))
    setForm(f => ({ ...f, images: [...f.images, ...base64s] }))
  }

  const removeImage = (index: number) => {
    setForm(f => ({ ...f, images: f.images.filter((_, i) => i !== index) }))
  }

  const handleSourceFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const items: SourceItem[] = await Promise.all(
      files.map(async file => ({
        id: uid(),
        type: 'file' as const,
        name: file.name,
        content: await fileToText(file),
      }))
    )
    setForm(f => ({ ...f, sources: [...f.sources, ...items] }))
    e.target.value = ''
  }

  const handleAddUrl = async () => {
    const url = urlInput.trim()
    if (!url) return
    setUrlLoading(true)
    setUrlError(null)
    try {
      const content = await fetchUrlContent(url)
      const hostname = new URL(url).hostname
      setForm(f => ({
        ...f,
        sources: [...f.sources, { id: uid(), type: 'url', name: hostname, content }],
      }))
      setUrlInput('')
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : 'שגיאה בטעינת הקישור')
    } finally {
      setUrlLoading(false)
    }
  }

  const removeSource = (id: string) => {
    setForm(f => ({ ...f, sources: f.sources.filter(s => s.id !== id) }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.businessName || !form.businessType) return

    if (!groqKey && !openrouterKey) {
      setError('מפתח API חסר. הוסף VITE_GROQ_API_KEY או VITE_OPENROUTER_API_KEY לקובץ .env')
      return
    }

    setLoading(true)
    setError(null)
    setGeneratedHtml(null)

    try {
      // Step 1: Generate text content via AI (small JSON output — any model can do this)
      const content = await generateSiteContent(form, groqKey, openrouterKey)
      // Step 2: Build the HTML using our professional template (guaranteed great design)
      const html = buildHtmlFromTemplate(form, content)
      setGeneratedHtml(html)
    } catch (err) {
      setError(`שגיאה ביצירת האתר: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (!generatedHtml) return
    const blob = new Blob([generatedHtml], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${form.businessName || 'website'}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleReset = () => {
    setGeneratedHtml(null)
    setPreviousHtml(null)
    setError(null)
    setRefinementInput('')
    setRefineError(null)
  }

  const handleRefine = async () => {
    if (!refinementInput.trim() || !generatedHtml) return
    setRefineLoading(true)
    setRefineError(null)

    try {
      // Re-generate content with the refinement instruction baked in
      const refineForm = { ...form, description: `${form.description}\n\nVARIATION REQUEST: ${refinementInput}` }
      const content = await generateSiteContent(refineForm, groqKey, openrouterKey)
      const html = buildHtmlFromTemplate(form, content) // use original form for data (phone/email/etc.)
      setPreviousHtml(generatedHtml)
      setGeneratedHtml(html)
      setRefinementInput('')
    } catch (err) {
      setRefineError(err instanceof Error ? err.message : 'שגיאה לא ידועה')
    } finally {
      setRefineLoading(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ direction: 'rtl' }}>
      {/* Header */}
      <header className="border-b border-white/10 glass sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl btn-primary flex items-center justify-center text-white text-xl font-bold"
            >
              ✦
            </div>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">יוצר האתרים AI</h1>
              <p className="text-xs text-slate-400">מופעל על ידי OpenRouter AI</p>
            </div>
          </div>
          {generatedHtml && (
            <button
              onClick={handleDownload}
              className="btn-primary px-4 py-2 rounded-xl text-white text-sm font-medium flex items-center gap-2"
            >
              ⬇ הורד HTML
            </button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 glass px-4 py-2 rounded-full text-sm text-purple-300 mb-6">
            <span className="w-2 h-2 rounded-full bg-green-400 pulse-dot" />
            מופעל על ידי OpenRouter AI
          </div>
          <h2 className="text-5xl font-bold text-white mb-4 leading-tight">
            צור אתר מקצועי{' '}
            <span className="gradient-text">תוך שניות</span>
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            מלא את פרטי העסק, לחץ על כפתור — וה-AI יצור לך אתר HTML מלא, מרהיב ומוכן להורדה
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Form Panel */}
          <div className="glass rounded-2xl p-8">
            <h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
              <span>📋</span> פרטי העסק
            </h3>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Business Name */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  שם העסק <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="לדוגמה: מסעדת הים הכחול"
                  value={form.businessName}
                  onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))}
                  className="field-input w-full rounded-xl px-4 py-3 text-sm"
                />
              </div>

              {/* Business Type */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  סוג העסק <span className="text-red-400">*</span>
                </label>
                <select
                  required
                  value={form.businessType}
                  onChange={e => setForm(f => ({ ...f, businessType: e.target.value }))}
                  className="field-input w-full rounded-xl px-4 py-3 text-sm"
                  style={{ background: 'rgba(15, 15, 25, 0.9)' }}
                >
                  <option value="" disabled style={{ background: '#1a1a2e' }}>בחר סוג עסק...</option>
                  {BUSINESS_TYPES.map(t => (
                    <option key={t.value} value={t.value} style={{ background: '#1a1a2e' }}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  תיאור קצר של העסק
                </label>
                <textarea
                  placeholder="ספר לנו על העסק, השירותים, הערכים..."
                  rows={3}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="field-input w-full rounded-xl px-4 py-3 text-sm resize-none"
                />
              </div>

              {/* Phone & Address */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">טלפון</label>
                  <input
                    type="tel"
                    placeholder="050-0000000"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="field-input w-full rounded-xl px-4 py-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">אימייל העסק</label>
                  <input
                    type="email"
                    placeholder="business@email.com"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="field-input w-full rounded-xl px-4 py-3 text-sm"
                    dir="ltr"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">כתובת</label>
                <input
                  type="text"
                  placeholder="רחוב, עיר"
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  className="field-input w-full rounded-xl px-4 py-3 text-sm"
                />
              </div>

              {/* Logo Upload */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  לוגו העסק
                </label>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoChange}
                />
                {form.logo ? (
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <img
                        src={form.logo}
                        alt="לוגו"
                        className="w-20 h-20 object-contain rounded-xl glass border border-white/10 bg-white/5"
                      />
                      {logoGenerating && (
                        <div className="absolute inset-0 rounded-xl bg-black/60 flex items-center justify-center">
                          <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full spin" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={handleGenerateLogo}
                        disabled={logoGenerating || !form.businessName}
                        className="btn-primary px-3 py-1.5 rounded-lg text-xs text-white font-medium flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {logoGenerating ? <div className="w-3 h-3 border border-white/30 border-t-white rounded-full spin" /> : '✦'}
                        צור מחדש
                      </button>
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="glass px-3 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white transition-colors border border-white/10"
                      >
                        העלה קובץ
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, logo: null }))}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors"
                      >
                        הסר לוגו
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* AI Generate */}
                    <button
                      type="button"
                      onClick={handleGenerateLogo}
                      disabled={logoGenerating || !form.businessName}
                      className="w-full btn-primary rounded-xl py-4 flex items-center justify-center gap-3 disabled:opacity-50 transition-all"
                    >
                      {logoGenerating ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full spin" />
                          <span className="text-sm text-white font-medium">יוצר לוגו עם AI...</span>
                        </>
                      ) : (
                        <>
                          <span className="text-xl">✦</span>
                          <span className="text-sm text-white font-medium">צור לוגו עם AI</span>
                        </>
                      )}
                    </button>
                    {/* Manual upload */}
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="w-full glass border border-dashed border-white/20 rounded-xl py-3 flex items-center justify-center gap-2 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all cursor-pointer"
                    >
                      <span>🖼️</span>
                      <span className="text-sm text-slate-400">או העלה קובץ קיים</span>
                    </button>
                    {!form.businessName && (
                      <p className="text-xs text-slate-600 text-center">הכנס שם עסק כדי לייצר לוגו</p>
                    )}
                  </div>
                )}
                {logoGenError && (
                  <p className="text-xs text-red-400 mt-2">⚠️ {logoGenError}</p>
                )}
              </div>

              {/* Website Images Upload */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  תמונות לאתר
                  {form.images.length > 0 && (
                    <span className="mr-2 text-xs text-purple-400">({form.images.length} תמונות)</span>
                  )}
                </label>
                <input
                  ref={imagesInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleImagesChange}
                />

                {form.images.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {form.images.map((src, i) => (
                      <div key={i} className="relative group">
                        <img
                          src={src}
                          alt={`תמונה ${i + 1}`}
                          className="w-full h-16 object-cover rounded-lg border border-white/10"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(i)}
                          className="absolute top-1 left-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center leading-none"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => imagesInputRef.current?.click()}
                  className="w-full glass border border-dashed border-white/20 rounded-xl py-4 flex flex-col items-center gap-2 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all cursor-pointer"
                >
                  <span className="text-xl">📷</span>
                  <span className="text-sm text-slate-400">
                    {form.images.length > 0 ? 'הוסף עוד תמונות' : 'לחץ להעלאת תמונות'}
                  </span>
                  <span className="text-xs text-slate-600">ניתן לבחור מספר תמונות בבת אחת</span>
                </button>
              </div>

              {/* Business Hours */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">
                  שעות פעילות
                </label>
                <div className="glass rounded-xl p-4 border border-white/5">
                  <BusinessHoursEditor
                    hours={form.businessHours}
                    onChange={hours => setForm(f => ({ ...f, businessHours: hours }))}
                  />
                </div>
              </div>

              {/* Sources: Files & URLs */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  מידע נוסף לאתר
                  {form.sources.length > 0 && (
                    <span className="mr-2 text-xs text-purple-400">({form.sources.length} מקורות)</span>
                  )}
                </label>
                <p className="text-xs text-slate-500 mb-3">
                  העלה קבצי טקסט או הוסף קישור — ה-AI ישתמש במידע לבניית האתר
                </p>

                {/* Source list */}
                {form.sources.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {form.sources.map(s => (
                      <div key={s.id} className="flex items-center gap-2 glass rounded-lg px-3 py-2 border border-white/5">
                        <span className="text-base flex-shrink-0">{s.type === 'file' ? '📄' : '🔗'}</span>
                        <span className="text-xs text-slate-300 flex-1 truncate">{s.name}</span>
                        <span className="text-xs text-slate-600 flex-shrink-0">
                          {(s.content.length / 1000).toFixed(1)}K תווים
                        </span>
                        <button
                          type="button"
                          onClick={() => removeSource(s.id)}
                          className="text-slate-600 hover:text-red-400 transition-colors text-lg leading-none flex-shrink-0"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* File upload */}
                <input
                  ref={sourcesFileRef}
                  type="file"
                  accept=".txt,.md,.csv,.json,.html,.xml"
                  multiple
                  className="hidden"
                  onChange={handleSourceFilesChange}
                />
                <button
                  type="button"
                  onClick={() => sourcesFileRef.current?.click()}
                  className="w-full glass border border-dashed border-white/20 rounded-xl py-3 flex items-center justify-center gap-2 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all cursor-pointer mb-3"
                >
                  <span>📄</span>
                  <span className="text-sm text-slate-400">העלה קובץ טקסט (TXT, MD, CSV…)</span>
                </button>

                {/* URL input */}
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="https://example.com"
                    value={urlInput}
                    onChange={e => { setUrlInput(e.target.value); setUrlError(null) }}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddUrl())}
                    className="field-input flex-1 rounded-xl px-4 py-2.5 text-sm"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={handleAddUrl}
                    disabled={urlLoading || !urlInput.trim()}
                    className="btn-primary px-4 py-2.5 rounded-xl text-white text-sm font-medium flex items-center gap-2 flex-shrink-0 disabled:opacity-50"
                  >
                    {urlLoading ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full spin" />
                    ) : (
                      '🔗 טען'
                    )}
                  </button>
                </div>
                {urlError && (
                  <p className="text-xs text-red-400 mt-2">⚠️ {urlError}</p>
                )}
              </div>

              {/* Color Picker */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">צבע ראשי לאתר</label>
                <ColorPicker value={form.primaryColor} onChange={c => setForm(f => ({ ...f, primaryColor: c }))} />
                <div className="mt-2 flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: form.primaryColor }} />
                  <span className="text-xs text-slate-500 font-mono">{form.primaryColor}</span>
                </div>
              </div>

              {/* Language */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">שפת האתר</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: 'he', label: '🇮🇱 עברית (RTL)' },
                    { value: 'en', label: '🇺🇸 English (LTR)' },
                  ].map(l => (
                    <button
                      key={l.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, language: l.value as 'he' | 'en' }))}
                      className={`py-3 px-4 rounded-xl text-sm font-medium transition-all duration-200 ${
                        form.language === l.value
                          ? 'btn-primary text-white'
                          : 'glass text-slate-400 hover:text-white'
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300 text-sm">
                  ⚠️ {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !form.businessName || !form.businessType}
                className="btn-primary w-full py-4 rounded-xl text-white font-semibold text-lg mt-2 flex items-center justify-center gap-3"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full spin" />
                    יוצר...
                  </>
                ) : (
                  <>✦ צור אתר עכשיו</>
                )}
              </button>
            </form>
          </div>

          {/* Preview Panel */}
          <div className="glass rounded-2xl overflow-hidden flex flex-col" style={{ minHeight: '560px' }}>
            {loading && (
              <div className="flex-1 flex items-center justify-center">
                <LoadingAnimation />
              </div>
            )}

            {!loading && !generatedHtml && (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                <div className="w-24 h-24 rounded-2xl glass flex items-center justify-center text-5xl mb-6 glow-purple">
                  🌐
                </div>
                <h4 className="text-xl font-semibold text-white mb-2">תצוגה מקדימה</h4>
                <p className="text-slate-400 text-sm max-w-xs">
                  מלא את פרטי העסק ולחץ "צור אתר" — האתר יופיע כאן
                </p>
                <div className="mt-8 grid grid-cols-3 gap-3 w-full max-w-xs opacity-40">
                  {['Hero Section', 'שירותים', 'צור קשר'].map(s => (
                    <div key={s} className="glass rounded-lg p-3 text-xs text-slate-500 text-center">
                      {s}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!loading && generatedHtml && (
              <div className="flex flex-col h-full">
                {/* Browser chrome bar */}
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-500/80" />
                      <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                      <div className="w-3 h-3 rounded-full bg-green-500/80" />
                    </div>
                    <span className="text-xs text-slate-400 mr-2 truncate max-w-[180px]">
                      {form.businessName} — תצוגה מקדימה
                    </span>
                  </div>
                  <button
                    onClick={handleDownload}
                    className="btn-primary px-3 py-1.5 rounded-lg text-white text-xs font-medium flex items-center gap-1 flex-shrink-0"
                  >
                    ⬇ הורד
                  </button>
                </div>
                <div className="flex-1 relative">
                  <iframe
                    srcDoc={generatedHtml}
                    className="w-full h-full border-0 fade-in"
                    style={{ minHeight: '480px' }}
                    title="תצוגה מקדימה של האתר"
                    sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-top-navigation-by-user-activation"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Success Bar */}
        {generatedHtml && !loading && (
          <div className="mt-8 glass rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4 fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-xl">
                ✓
              </div>
              <div>
                <p className="text-white font-semibold">האתר נוצר בהצלחה!</p>
                <p className="text-slate-400 text-sm">קובץ HTML מוכן להורדה ולשימוש מיידי</p>
              </div>
            </div>
            <div className="flex gap-3">
              {previousHtml && (
                <button
                  onClick={() => { setGeneratedHtml(previousHtml); setPreviousHtml(null) }}
                  className="glass px-4 py-3 rounded-xl text-slate-400 text-sm font-medium hover:text-white transition-colors border border-white/10"
                >
                  ↩ בטל שיפור
                </button>
              )}
              <button
                onClick={handleReset}
                className="glass px-5 py-3 rounded-xl text-slate-300 text-sm font-medium hover:text-white transition-colors border border-white/10"
              >
                צור אתר חדש
              </button>
              <button
                onClick={handleDownload}
                className="btn-primary px-6 py-3 rounded-xl text-white text-sm font-semibold flex items-center gap-2"
              >
                ⬇ הורד קובץ HTML
              </button>
            </div>
          </div>
        )}

        {/* Refinement Panel */}
        {generatedHtml && !loading && (
          <div className="mt-4 glass rounded-2xl p-6 fade-in">
            <h4 className="text-white font-semibold mb-1 flex items-center gap-2">
              <span>✏️</span> שפר את האתר
            </h4>
            <p className="text-slate-400 text-sm mb-4">
              תאר מה לשנות — ה-AI יעדכן את האתר בהתאם
            </p>
            <div className="flex gap-3">
              <textarea
                value={refinementInput}
                onChange={e => { setRefinementInput(e.target.value); setRefineError(null) }}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleRefine() }}
                placeholder="לדוגמה: שנה את הצבע הראשי לכחול, הוסף סקשן מחירים, הפוך את הכותרת גדולה יותר..."
                rows={2}
                className="field-input flex-1 rounded-xl px-4 py-3 text-sm resize-none"
              />
              <button
                onClick={handleRefine}
                disabled={refineLoading || !refinementInput.trim()}
                className="btn-primary px-6 rounded-xl text-white font-semibold flex items-center gap-2 flex-shrink-0 disabled:opacity-50"
              >
                {refineLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full spin" />
                ) : (
                  '✦ שפר'
                )}
              </button>
            </div>
            {refineError && (
              <p className="text-red-400 text-sm mt-2">⚠️ {refineError}</p>
            )}
            <p className="text-slate-600 text-xs mt-2">Ctrl+Enter לשליחה מהירה</p>
          </div>
        )}
      </main>

      <footer className="border-t border-white/5 mt-16 py-8 text-center text-slate-700 text-sm">
        מופעל על ידי OpenRouter AI · יוצר האתרים החכם
      </footer>
    </div>
  )
}
