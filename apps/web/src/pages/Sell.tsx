import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { Camera, Images, CheckCircle2, Loader2, X, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import TopBar from '../components/TopBar'
import { useApp } from '../context/AppContext'
import { CATEGORY_META, type Category, type Condition } from '../types'
import { compressImageFile } from '../lib/media'
import { formatPrice } from '../lib/format'

const STEPS = ['Photos', 'Details', 'Location', 'Publish']
const MAX_PHOTOS = 3
// Recurring monthly fee, not a one-time payment — "Pay & Publish" only ever charges the
// first month; every month after that has to be renewed from My Listings (see
// account/MyListings.tsx) or the listing is hidden from buyers until it is. See
// apps/api/src/lib/billing.ts for the matching backend constant.
const LISTING_FEE_PER_MONTH = 30

export default function Sell() {
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
        title: title || 'Untitled listing',
        description,
        price: Number(price) || 0,
        negotiable,
        condition,
        quantity: Number(quantity) || 1,
        // Real device location when GPS has resolved; only jittered around the Lumley
        // default as a placeholder while it hasn't (or on a browser/device with no GPS) —
        // see lib/useLiveLocation.ts.
        lat: userLocation.lat + (userLocation.status === 'live' ? 0 : (Math.random() - 0.5) * 0.01),
        lng: userLocation.lng + (userLocation.status === 'live' ? 0 : (Math.random() - 0.5) * 0.01),
        approxLocation,
        durationMonths: duration,
        images: filledPhotos.length > 0 ? filledPhotos : [CATEGORY_META[category].emoji],
      })
      setPublishedId(created.id)
      setStep(3)
    } catch (err) {
      console.error('publish failed', err)
      alert('Could not publish the listing — check the API server is running and try again.')
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
    setPublishedId(null)
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <div className="px-4 pb-3 pt-1">
        <h1 className="text-xl font-display font-bold tracking-tight text-ink">List a product</h1>
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
              className="btn-primary mt-4 w-full text-sm"
            >
              Continue
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <Field label="Category">
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
            </Field>
            <Field label="Title">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
              />
            </Field>
            <Field label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price (NLe)">
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
                />
              </Field>
              <Field label="Quantity">
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
                />
              </Field>
            </div>
            <Field label="Condition">
              <div className="flex gap-2">
                {(['new', 'used', 'refurbished'] as Condition[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCondition(c)}
                    className={`tap-flash rounded-full px-3 py-1.5 text-xs capitalize transition active:scale-95 ${
                      condition === c ? 'glow-accent-ring bg-accent/15 text-accent' : 'bg-surface-2 text-muted'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </Field>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={negotiable}
                onChange={(e) => setNegotiable(e.target.checked)}
                className="h-4 w-4 accent-[#245b32]"
              />
              Price is negotiable
            </label>
            <button
              onClick={goLocation}
              disabled={!title || !price}
              className="btn-primary mt-2 w-full text-sm"
            >
              Continue
            </button>
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

// A single photo slot in the Sell flow's grid. Empty: tapping opens a small action sheet
// with "Take Photo" (opens the device camera directly via the `capture` attribute on
// mobile) and "Choose from Gallery" (a plain file picker) — both are real hidden
// <input type="file"> elements; the visible buttons are just styled triggers for them.
// Filled: shows the compressed photo with a remove button; tapping the photo itself
// re-opens the action sheet to replace it.
function PhotoSlot({
  photo,
  onPick,
  onRemove,
}: {
  photo: string | null
  onPick: (file: File) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file next time
    setOpen(false)
    if (file) onPick(file)
  }

  return (
    <div className="relative">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
      <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

      {photo ? (
        <div className="group relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-surface-2">
          <img src={photo} alt="Listing photo" className="h-full w-full object-cover" />
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Replace photo"
            className="tap-flash absolute inset-0 flex items-center justify-center bg-bg/0 transition-colors active:bg-bg/30"
          />
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            aria-label="Remove photo"
            className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-bg/70 text-ink backdrop-blur transition-transform active:scale-90"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen((o) => !o)}
          className="tap-flash flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-surface-2 text-muted transition-transform active:scale-[0.97]"
        >
          <Plus size={18} />
        </button>
      )}

      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 w-44 space-y-1 rounded-xl border border-border bg-surface p-2 shadow-xl">
          <button
            onClick={() => cameraInputRef.current?.click()}
            className="tap-flash flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-ink transition-colors active:bg-surface-2"
          >
            <Camera size={15} className="text-accent" /> Take Photo
          </button>
          <button
            onClick={() => galleryInputRef.current?.click()}
            className="tap-flash flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-ink transition-colors active:bg-surface-2"
          >
            <Images size={15} className="text-accent" /> Choose from Gallery
          </button>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">{label}</label>
      {children}
    </div>
  )
}
