import { useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import PhotoSlot from '../components/PhotoSlot'
import Field from '../components/Field'
import { useNavigate } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import TopBar from '../components/TopBar'
import { useApp } from '../context/AppContext'
import { CATEGORY_META, type Category, type Condition } from '../types'
import { compressImageFile } from '../lib/media'
import { formatPrice } from '../lib/format'
import { useToast } from '../components/Toast'
import { errorMessage } from '../lib/api'
import { useT } from '../lib/i18n'
import { CategoryHint, DescriptionPrompts, PhotoAssist, PriceGuideCard } from '../components/ListingHelp'
import { VoiceNoteRecorder } from '../components/VoiceNote'

const STEPS = ['Photos', 'Details', 'Location', 'Publish']
const MAX_PHOTOS = 3
// Recurring monthly fee, not a one-time payment — "Pay & Publish" only ever charges the
// first month; every month after that has to be renewed from My Listings (see
// account/MyListings.tsx) or the listing is hidden from buyers until it is. See
// apps/api/src/lib/billing.ts for the matching backend constant.
const LISTING_FEE_PER_MONTH = 30

export default function Sell() {
  const toast = useToast()
  const navigate = useNavigate()
  const { publishListing, userLocation } = useApp()
  const [step, setStep] = useState(0)
  const [photos, setPhotos] = useState<(string | null)[]>(() => Array(MAX_PHOTOS).fill(null))
  const [photoError, setPhotoError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<Category>('electronics')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [negotiable, setNegotiable] = useState(true)
  const [condition, setCondition] = useState<Condition>('used')
  const [quantity, setQuantity] = useState('1')
  const [voiceNote, setVoiceNote] = useState<string | null>(null)
  const t = useT()

  const [approxLocation, setApproxLocation] = useState(true)
  const [duration, setDuration] = useState(3)
  const [publishing, setPublishing] = useState(false)
  const [publishedId, setPublishedId] = useState<string | null>(null)

  const filledPhotos = photos.filter((p): p is string => !!p)

  const goDetails = () => setStep(1)
  const goLocation = () => setStep(2)

  const publish = async () => {
    setPublishing(true)
    try {
      // brief pause so the "Processing…" state reads as a real payment/publish step
      await new Promise((r) => setTimeout(r, 700))
      const created = await publishListing({
        category,
        title: title.trim() || 'Untitled listing',
        description,
        price: Math.max(0, Math.round(Number(price) || 0)),
        negotiable,
        condition,
        quantity: Math.max(1, Math.round(Number(quantity) || 1)),
        // Real device location when GPS has resolved; only jittered around the Lumley
        // default as a placeholder while it hasn't (or on a browser/device with no GPS) —
        // see lib/useLiveLocation.ts.
        lat: userLocation.lat + (userLocation.status === 'live' ? 0 : (Math.random() - 0.5) * 0.01),
        lng: userLocation.lng + (userLocation.status === 'live' ? 0 : (Math.random() - 0.5) * 0.01),
        approxLocation,
        durationMonths: duration,
        images: filledPhotos.length > 0 ? filledPhotos : [CATEGORY_META[category].emoji],
        ...(voiceNote ? { voiceNote } : {}),
      })
      setPublishedId(created.id)
      setStep(3)
    } catch (err) {
      console.error('publish failed', err)
      toast.error(errorMessage(err, 'Could not publish your listing — please try again.'))
    } finally {
      setPublishing(false)
    }
  }

  const reset = () => {
    setStep(0)
    setPhotos(Array(MAX_PHOTOS).fill(null))
    setPhotoError(null)
    setTitle('')
    setDescription('')
    setPrice('')
    setVoiceNote(null)
    setPublishedId(null)
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <div className="px-4 pb-3 pt-1">
        <h1 className="text-xl font-display font-bold tracking-tight text-ink">{t('sell.heading')}</h1>
        <div className="mt-3 flex items-center gap-1">
          {STEPS.map((s, i) => (
            <div key={s} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div
                className={`h-1 w-full rounded-full transition ${i <= step ? 'bg-accent shadow-[0_0_6px_rgba(36,91,50,0.7)]' : 'bg-border'}`}
              />
              <span className={`max-w-full truncate text-[9px] ${i === step ? 'text-accent' : 'text-muted'}`}>
                {s}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {step === 0 && (
          <div>
            <p className="mb-3 text-sm text-muted">
              Take a photo with your camera, or upload one from your gallery. The first photo
              becomes the cover image buyers see first.
            </p>
            <div className="grid grid-cols-3 gap-3">
              {photos.map((p, i) => (
                <PhotoSlot
                  key={i}
                  photo={p}
                  onPick={async (file) => {
                    setPhotoError(null)
                    try {
                      const dataUrl = await compressImageFile(file)
                      setPhotos((prev) => prev.map((x, idx) => (idx === i ? dataUrl : x)))
                    } catch (err) {
                      console.error('photo processing failed', err)
                      setPhotoError("Couldn't use that photo — try a different one.")
                    }
                  }}
                  onRemove={() => setPhotos((prev) => prev.map((x, idx) => (idx === i ? null : x)))}
                />
              ))}
            </div>
            {photoError && <p className="mt-2 text-xs text-bad">{photoError}</p>}
            <button
              onClick={goDetails}
              disabled={filledPhotos.length === 0}
              className="btn-primary mt-4 min-h-12 w-full text-sm"
            >
              {t('sell.continue')}
            </button>
            {filledPhotos.length === 0 && (
              <p className="mt-2 text-center text-xs text-muted">Add at least one photo to continue.</p>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <PhotoAssist
              photo={filledPhotos[0]}
              onSuggest={(sug) => {
                if (sug.title) setTitle(sug.title)
                if (sug.category) setCategory(sug.category)
                if (sug.condition) setCondition(sug.condition)
                if (sug.description) setDescription(sug.description)
              }}
            />
            <Field label={t('sell.title')}>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder="e.g. Samsung Galaxy A14, 64GB"
                autoCapitalize="sentences"
                className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
              />
            </Field>
            <Field label={t('sell.category')}>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
              >
                {(Object.keys(CATEGORY_META) as Category[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_META[c].emoji} {CATEGORY_META[c].label}
                  </option>
                ))}
              </select>
              <CategoryHint title={title} category={category} onPick={setCategory} />
            </Field>
            <Field label={t('sell.description')}>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={4000}
                placeholder="Condition, what's included, where to collect…"
                className="w-full resize-none rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
              />
            </Field>
            <DescriptionPrompts
              category={category}
              description={description}
              onAdd={(line) => setDescription((d) => (d.trim() ? `${d.trimEnd()}\n${line} ` : `${line} `))}
            />
            <VoiceNoteRecorder value={voiceNote} onChange={setVoiceNote} label={t('sell.voice')} />
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('sell.price')}>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  placeholder="0"
                  value={price}
                  // Whole leones only — decimals were rejected by the API with no explanation.
                  onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))}
                  className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
                />
              </Field>
              <Field label={t('sell.quantity')}>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, ''))}
                  className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
                />
              </Field>
            </div>
            <PriceGuideCard category={category} title={title} price={price} onUse={(p) => setPrice(String(p))} />
            <Field label={t('sell.condition')} group>
              <div className="flex gap-2">
                {(['new', 'used', 'refurbished'] as Condition[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCondition(c)}
                    type="button"
                    aria-pressed={condition === c}
                    className={`tap-flash min-h-10 rounded-full px-4 text-sm capitalize transition active:scale-95 ${
                      condition === c ? 'glow-accent-ring bg-accent/15 text-accent' : 'bg-surface-2 text-muted'
                    }`}
                  >
                    {t(`cond.${c}`)}
                  </button>
                ))}
              </div>
            </Field>
            <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
              <input
                type="checkbox"
                checked={negotiable}
                onChange={(e) => setNegotiable(e.target.checked)}
                className="h-5 w-5 accent-[#245b32]"
              />
              {t('sell.negotiable')}
            </label>
            <button
              onClick={goLocation}
              disabled={!title.trim() || price === ''}
              className="btn-primary mt-2 min-h-12 w-full text-sm"
            >
              {t('sell.continue')}
            </button>
            {(!title.trim() || price === '') && (
              <p className="text-center text-xs text-muted">Add a title and a price to continue.</p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="card-elevated rounded-xl bg-surface p-3">
              <p className="text-xs text-muted">
                {userLocation.status === 'live' ? 'GPS location captured' : 'Using default location — GPS not available'}
              </p>
              <p className="text-sm text-ink">{userLocation.label}</p>
              <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={approxLocation}
                  onChange={(e) => setApproxLocation(e.target.checked)}
                  className="h-4 w-4 accent-[#245b32]"
                />
                Show approximate location to buyers (recommended for private sellers)
              </label>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                Listing duration (max time it can run)
              </p>
              <div className="flex gap-2">
                {[1, 3, 6].map((m) => (
                  <button
                    key={m}
                    onClick={() => setDuration(m)}
                    className={`tap-flash flex-1 rounded-xl py-2 text-xs font-medium transition active:scale-95 ${
                      duration === m ? 'glow-accent-ring bg-accent/15 text-accent' : 'bg-surface-2 text-muted'
                    }`}
                  >
                    {m} {m === 1 ? 'month' : 'months'}
                  </button>
                ))}
              </div>
            </div>

            <div className="card-elevated rounded-xl bg-surface p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted">Listing fee</span>
                <span className="font-semibold text-ink">{formatPrice(LISTING_FEE_PER_MONTH)}/month</span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Charged monthly to keep your listing visible to buyers. Today's payment covers your
                first month — renew from My Listings each month after that (up to {duration}{' '}
                {duration === 1 ? 'month' : 'months'} total). Boost and Featured upgrades are
                available from My Listings after publishing.
              </p>
            </div>

            <button
              onClick={publish}
              disabled={publishing}
              className="btn-primary w-full text-sm"
            >
              {publishing ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Processing…
                </>
              ) : (
                `Pay ${formatPrice(LISTING_FEE_PER_MONTH)} & Publish`
              )}
            </button>
          </div>
        )}

        {step === 3 && publishedId && (
          <div className="flex flex-col items-center pt-10 text-center">
            <div className="relative mb-4 flex h-16 w-16 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-good/15 blur-md" />
              <CheckCircle2 size={48} className="relative text-good" />
            </div>
            <h2 className="mb-1 text-base font-semibold text-ink">Listing is live!</h2>
            <p className="mb-6 max-w-xs text-sm text-muted">
              {title} is now visible on the map to nearby buyers.
            </p>
            <div className="flex w-full max-w-xs flex-col gap-2">
              <button
                onClick={() => navigate(`/listing/${publishedId}`)}
                className="btn-primary w-full text-sm"
              >
                View listing
              </button>
              <button onClick={reset} className="btn-secondary w-full text-sm"
              >
                List another product
              </button>
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
