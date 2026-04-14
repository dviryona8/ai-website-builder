import { useState, useRef } from 'react'
import Groq from 'groq-sdk'

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

⚠️ MANDATORY REAL DATA — USE EXACTLY AS-IS, NO SUBSTITUTIONS:
  PHONE: ${phoneVal}  ← display this exact number everywhere, <a href="tel:${phoneVal}">
  EMAIL: ${emailVal || '(none)'}  ← display this exact email everywhere${emailVal ? `, <a href="mailto:${emailVal}">` : ', omit if none'}
  ADDRESS: ${addressVal || '(none)'}  ← display this exact address, omit if none
  WHATSAPP: https://wa.me/${waNum}  ← use this exact URL
  BUSINESS NAME: ${form.businessName}  ← never translate or alter

BUSINESS: ${form.businessName} | ${businessTypeLabel} | ${form.description || ''}
COLOR: ${c} | LANG: ${isHe ? 'Hebrew, dir="rtl" on <html>' : 'English LTR'} | TONE: ${tone}
HOURS: ${hoursText.replace(/\n/g, ' | ')}
${sourcesSection}
LOGO: ${form.logo ? 'Use base64 URI below as <img src> in nav+hero' : 'Text logo with gradient'}
IMAGES: ${form.images.length > 0 ? `Use ${form.images.length} base64 URIs below as <img src> in gallery` : 'CSS gradient placeholders'}
${logoDataSection}
${imagesDataSection}

DESIGN SYSTEM (:root CSS vars):
--primary:${c}; --bg:#080810; --surface:#0f0f1a; --card:rgba(255,255,255,0.04); --border:rgba(255,255,255,0.08); --text:#f2f2f8; --muted:#7a7a9a;
Font: ${isHe ? 'Heebo' : 'Inter'} from Google Fonts (400,600,700,800,900). Icons: Font Awesome 6 CDN.

REQUIRED EFFECTS:
- Hero: 3 animated gradient blobs (@keyframes, radial-gradient, filter:blur) + dot-grid overlay (radial-gradient 1px dots, 32px grid)
- Gradient headline: linear-gradient(135deg,${c},#a78bfa) background-clip:text
- Cards: backdrop-filter:blur(20px), var(--card) bg, 1px var(--border), border-radius:20px, hover→scale(1.03)+glow
- Scroll reveal: IntersectionObserver → opacity:0 translateY(40px) → opacity:1 translateY(0), staggered delays
- Count-up: JS IntersectionObserver triggers number animation
- Nav: backdrop-filter:blur after 80px scroll (JS), mobile hamburger drawer

SECTIONS (each section MUST have the exact id shown):
1. <nav id="navbar"> — sticky, blur-on-scroll, ${form.logo ? 'logo img' : 'gradient text logo with business name'}, links href="#services" href="#${form.images.length > 0 ? 'gallery' : 'about'}" href="#contact", CTA btn, mobile hamburger toggle
2. <section id="hero"> — 100vh, blobs bg, clamp(3rem,8vw,6rem) weight:900 gradient headline IN HEBREW (5-7 words, based on business description and tone), subtitle, 2 btns (href="#contact" + href="#services"), bounce scroll arrow
3. <section id="stats"> — dark band, 4 count-up numbers, metrics relevant to ${businessTypeLabel}
4. <section id="services"> — 6+ glassmorphism cards (FA icon, title, desc); ${form.sources.length > 0 ? 'use real services from sources' : `${businessTypeLabel}-specific`}
5. <section id="${form.images.length > 0 ? 'gallery' : 'about'}"> — ${form.images.length > 0 ? 'css grid gallery, provided images, hover zoom overlay' : `split layout, gradient decoration, story, checkmark list`}
6. <section id="cta-band"> — full-width primary gradient, bold headline, white button href="#contact"
⚠️ DO NOT add a testimonials section — no fake reviews allowed under any circumstances.
8. <section id="contact"> — 2col:
  LEFT: contact form — use EXACTLY this HTML+JS structure:
  <form id="contactForm">
    <input type="text" id="cf-name" placeholder="${isHe ? 'שם מלא' : 'Full Name'}" required>
    <input type="email" id="cf-email" placeholder="${isHe ? 'אימייל' : 'Email'}" required>
    <input type="tel" id="cf-phone" placeholder="${isHe ? 'טלפון' : 'Phone'}">
    <textarea id="cf-message" placeholder="${isHe ? 'הודעה' : 'Message'}" required></textarea>
    <button type="submit">${isHe ? 'שלח הודעה' : 'Send Message'}</button>
  </form>
  <div id="cf-success" style="display:none">${isHe ? '✅ ההודעה נשלחה בהצלחה!' : '✅ Message sent successfully!'}</div>
  JS onsubmit: e.preventDefault(); collect fields; ${form.email ? `window.location.href = 'mailto:${form.email}?subject=${encodeURIComponent('פנייה חדשה מהאתר - ' + form.businessName)}&body='+encodeURIComponent('שם: '+name+'\\nאימייל: '+email+'\\nטלפון: '+phone+'\\nהודעה: '+message);` : ''} show #cf-success, hide form.
  Style all inputs with the design system.
  RIGHT: contact info cards (phone as <a href="tel:${form.phone}">, email as <a href="mailto:${form.email}">, address) + hours table + map placeholder
9. <footer id="footer"> — logo, nav links, FA social icons, copyright

FLOATING: WhatsApp <a href="https://wa.me/${waNum}" target="_blank"> green circle, pulse animation; scroll-to-top btn (onclick window.scrollTo top)

CRITICAL — FORBIDDEN TO INVENT CONTACT DATA:
• PHONE in HTML must be EXACTLY: ${phoneVal} — hard-code this string, never a different number
• EMAIL in HTML must be EXACTLY: ${emailVal || '(omit)'} — hard-code this string, never a different email
• ADDRESS in HTML must be EXACTLY: ${addressVal || '(omit)'} — never invent a location
• WhatsApp href must be EXACTLY: https://wa.me/${waNum}
• Stats: use ONLY generic plausible numbers (e.g. "500+ לקוחות", "10+ שנות ניסיון") — NO fake awards, certifications, or specific claims not provided
• Testimonials: use ONLY first names (e.g. "דני", "רחל") — NO last names, NO fake job titles, NO invented companies
• DO NOT invent: years established, specific achievements, awards, media appearances, or any facts not given in the description

RULES: All CSS in <style>, JS in <script>. Google Fonts + FA6 CDN only. Responsive mobile-first. ${isHe ? `ALL text Hebrew — EXCEPT the business name "${form.businessName}" which must stay exactly as written.` : 'ALL text English.'} ${form.sources.length > 0 ? 'Use real content from sources — no generic placeholders.' : ''}

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

  const groqKey = import.meta.env.VITE_GROQ_API_KEY
  const openrouterKey = import.meta.env.VITE_OPENROUTER_API_KEY

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

    const messages = [
      {
        role: 'system' as const,
        content: 'You are an elite front-end developer. Output only raw HTML/CSS/JS — no markdown, no explanations.',
      },
      {
        role: 'user' as const,
        content: buildPrompt(form),
      },
    ]

    try {
      let html = ''

      // Try Groq first (faster, better quality)
      if (groqKey) {
        try {
          const groq = new Groq({ apiKey: groqKey, dangerouslyAllowBrowser: true })
          const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            max_tokens: 4000,
            messages,
          })
          html = completion.choices[0]?.message?.content?.trim() ?? ''
        } catch {
          // Any Groq error → fall through to OpenRouter
        }
      }

      // Fallback: OpenRouter — try multiple free models in sequence
      if (!html && openrouterKey) {
        const freeModels = [
          'meta-llama/llama-3.3-8b-instruct:free',
          'meta-llama/llama-3.1-8b-instruct:free',
          'qwen/qwen-2.5-72b-instruct:free',
          'deepseek/deepseek-r1:free',
          'mistralai/mistral-7b-instruct:free',
          'google/gemma-3-27b-it:free',
          'openrouter/free',
        ]

        let lastError = ''
        for (const model of freeModels) {
          if (html) break
          try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 60000)

            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              signal: controller.signal,
              headers: {
                'Authorization': `Bearer ${openrouterKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.origin,
                'X-Title': 'AI Website Builder',
              },
              body: JSON.stringify({ model, max_tokens: 5000, messages }),
            })

            clearTimeout(timeoutId)

            if (!res.ok) {
              const err = await res.json().catch(() => ({}))
              lastError = `${model} → ${res.status}: ${err?.error?.message || ''}`
              continue
            }

            const data = await res.json()
            const content = data.choices?.[0]?.message?.content?.trim() ?? ''
            if (content && content.length > 200) {
              html = content
            } else {
              lastError = `${model} → תגובה ריקה`
            }
          } catch {
            lastError = `${model} → timeout`
          }
        }

        if (!html) throw new Error(`כל המודלים נכשלו — ${lastError}`)
      }

      if (!html) throw new Error('כל ספקי ה-AI מוגבלים כרגע — נסה שוב מאוחר יותר')

      // Strip markdown code fences if present
      html = html.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim()

      // Inject real base64 data in place of placeholders
      if (form.logo) {
        html = html.replaceAll('__LOGO__', form.logo)
      }
      form.images.forEach((src, i) => {
        html = html.replaceAll(`__IMG_${i + 1}__`, src)
      })

      // Remove fake testimonials and fix contact form
      html = removeTestimonials(html)
      html = fixContactForm(html, form.email, form.businessName)

      setGeneratedHtml(html)
    } catch (err) {
      const msg = err instanceof Error
        ? (err.name === 'AbortError' ? 'הבקשה לקחה יותר מ-90 שניות — נסה שוב' : err.message)
        : String(err)
      setError(`שגיאה ביצירת האתר: ${msg}`)
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

    // Compress HTML: strip blank lines + excess whitespace to reduce tokens
    const compressedHtml = generatedHtml
      .replace(/\n\s*\n/g, '\n')
      .replace(/  +/g, ' ')
      .trim()

    // If still very large, truncate — keep head + first 6000 chars + closing tags
    const MAX_HTML_CHARS = 8000
    const htmlForPrompt = compressedHtml.length > MAX_HTML_CHARS
      ? compressedHtml.slice(0, MAX_HTML_CHARS) + '\n...[truncated]...\n</body></html>'
      : compressedHtml

    const refinePrompt = `Modify the HTML website below based on the instruction. Return the COMPLETE improved HTML — ONLY raw HTML, no markdown, no explanation.

INSTRUCTION: ${refinementInput}

HTML:
${htmlForPrompt}`

    const messages = [
      { role: 'system' as const, content: 'Elite front-end developer. Return only complete raw HTML with the requested changes applied. Never return empty.' },
      { role: 'user' as const, content: refinePrompt },
    ]

    try {
      let html = ''
      let lastError = ''

      if (groqKey) {
        try {
          const groq = new Groq({ apiKey: groqKey, dangerouslyAllowBrowser: true })
          const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            max_tokens: 5000,
            messages,
          })
          html = completion.choices[0]?.message?.content?.trim() ?? ''
        } catch (e) {
          lastError = e instanceof Error ? e.message : 'Groq error'
        }
      }

      if (!html && openrouterKey) {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 90000)
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Authorization': `Bearer ${openrouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.origin,
            'X-Title': 'AI Website Builder',
          },
          body: JSON.stringify({
            model: 'openrouter/free',
            max_tokens: 5000,
            messages,
          }),
        })
        clearTimeout(timeoutId)
        if (res.ok) {
          const data = await res.json()
          html = data.choices?.[0]?.message?.content?.trim() ?? ''
          if (!html) lastError = `המודל (${data.model || '?'}) החזיר תגובה ריקה`
        } else {
          const err = await res.json().catch(() => ({}))
          lastError = `OpenRouter ${res.status}: ${err?.error?.message || ''}`
        }
      }

      if (!html) throw new Error(lastError || 'לא התקבלה תגובה — נסה שוב')

      html = html.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim()

      // Re-inject images after refinement
      if (form.logo) html = html.replaceAll('__LOGO__', form.logo)
      form.images.forEach((src, i) => { html = html.replaceAll(`__IMG_${i + 1}__`, src) })

      // Remove fake testimonials and fix contact form after refinement too
      html = removeTestimonials(html)
      html = fixContactForm(html, form.email, form.businessName)

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
