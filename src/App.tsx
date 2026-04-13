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

  return `Build a premium dark-theme single-page website. Output ONLY raw HTML (no markdown).

BUSINESS: ${form.businessName} | ${businessTypeLabel} | ${form.description || ''}
CONTACT: ${form.phone || '050-0000000'} | ${form.address || ''}
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
1. <nav id="navbar"> — sticky, blur-on-scroll, ${form.logo ? 'logo img' : 'gradient text logo with business name'}, links href="#services" href="#${form.images.length > 0 ? 'gallery' : 'about'}" href="#testimonials" href="#contact", CTA btn, mobile hamburger toggle
2. <section id="hero"> — 100vh, blobs bg, clamp(3rem,8vw,6rem) weight:900 gradient headline IN HEBREW (5-7 words, based on business description and tone), subtitle, 2 btns (href="#contact" + href="#services"), social-proof pill, bounce scroll arrow
3. <section id="stats"> — dark band, 4 count-up numbers, metrics relevant to ${businessTypeLabel}
4. <section id="services"> — 6+ glassmorphism cards (FA icon, title, desc); ${form.sources.length > 0 ? 'use real services from sources' : `${businessTypeLabel}-specific`}
5. <section id="${form.images.length > 0 ? 'gallery' : 'about'}"> — ${form.images.length > 0 ? 'css grid gallery, provided images, hover zoom overlay' : `split layout, gradient decoration, story, checkmark list`}
6. <section id="testimonials"> — 3 cards (★★★★★, quote, gradient avatar, first name only)
7. <section id="cta-band"> — full-width primary gradient, bold headline, white button href="#contact"
8. <section id="contact"> — 2col: form (name/email/phone/message, focus glow, onsubmit show success msg) | info + hours table + map placeholder
9. <footer id="footer"> — logo, nav links, FA social icons, copyright

FLOATING: WhatsApp <a href="https://wa.me/${(form.phone || '0500000000').replace(/\D/g, '')}" target="_blank"> green circle, pulse animation; scroll-to-top btn (onclick window.scrollTo top)

CRITICAL — DO NOT INVENT DATA:
• Phone: display ONLY "${form.phone || 'לא סופק'}" — never write a different number
• Address: display ONLY "${form.address || 'לא סופקה'}" — never invent a street/city
• Business name: "${form.businessName}" — keep exactly as written, never translate
• WhatsApp link: https://wa.me/${(form.phone || '0500000000').replace(/\D/g, '')} — use this exact number
• Stats/numbers: make them generic and plausible — do NOT invent specific fake awards or certifications
• Testimonials: clearly fictional (first names only, no fake last names or companies unless from sources)

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

  const groqKey = import.meta.env.VITE_GROQ_API_KEY
  const openrouterKey = import.meta.env.VITE_OPENROUTER_API_KEY
  const apiKey = groqKey || openrouterKey

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const base64 = await fileToBase64(file)
    setForm(f => ({ ...f, logo: base64 }))
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

      // Fallback: OpenRouter
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
            models: [
              'google/gemma-4-31b-it:free',
              'google/gemma-4-26b-a4b-it:free',
              'minimax/minimax-m2.5:free',
            ],
            route: 'fallback',
            max_tokens: 5000,
            messages,
          }),
        })

        clearTimeout(timeoutId)

        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          const msg = err?.error?.message || err?.message || JSON.stringify(err)
          throw new Error(`OpenRouter ${res.status}: ${msg}`)
        }

        const data = await res.json()
        html = data.choices?.[0]?.message?.content?.trim() ?? ''
        if (!html) throw new Error(`המודל (${data.model || 'unknown'}) החזיר תגובה ריקה — נסה שוב`)
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

    const refinePrompt = `You are given an HTML website. Apply the following improvement and return the COMPLETE improved HTML file — nothing else, no explanations, no markdown.

IMPROVEMENT REQUEST: ${refinementInput}

CURRENT HTML:
${generatedHtml}`

    const messages = [
      { role: 'system' as const, content: 'You are an elite front-end developer. Apply the requested changes to the HTML and return only the full improved HTML file.' },
      { role: 'user' as const, content: refinePrompt },
    ]

    try {
      let html = ''

      if (groqKey) {
        try {
          const groq = new Groq({ apiKey: groqKey, dangerouslyAllowBrowser: true })
          const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            max_tokens: 4000,
            messages,
          })
          html = completion.choices[0]?.message?.content?.trim() ?? ''
        } catch { /* fall through */ }
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
            models: ['google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free', 'minimax/minimax-m2.5:free'],
            route: 'fallback',
            max_tokens: 4000,
            messages,
          }),
        })
        clearTimeout(timeoutId)
        if (res.ok) {
          const data = await res.json()
          html = data.choices?.[0]?.message?.content?.trim() ?? ''
        }
      }

      if (!html) throw new Error('לא התקבלה תגובה — נסה שוב')

      html = html.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim()

      // Re-inject images after refinement
      if (form.logo) html = html.replaceAll('__LOGO__', form.logo)
      form.images.forEach((src, i) => { html = html.replaceAll(`__IMG_${i + 1}__`, src) })

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
                  <label className="block text-sm font-medium text-slate-300 mb-2">כתובת</label>
                  <input
                    type="text"
                    placeholder="רחוב, עיר"
                    value={form.address}
                    onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    className="field-input w-full rounded-xl px-4 py-3 text-sm"
                  />
                </div>
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
                    <img
                      src={form.logo}
                      alt="לוגו"
                      className="w-16 h-16 object-contain rounded-xl glass border border-white/10"
                    />
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="glass px-3 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white transition-colors border border-white/10"
                      >
                        החלף לוגו
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
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="w-full glass border border-dashed border-white/20 rounded-xl py-6 flex flex-col items-center gap-2 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all cursor-pointer"
                  >
                    <span className="text-2xl">🖼️</span>
                    <span className="text-sm text-slate-400">לחץ להעלאת לוגו</span>
                    <span className="text-xs text-slate-600">PNG, JPG, SVG — עד 5MB</span>
                  </button>
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
