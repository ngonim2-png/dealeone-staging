import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { Camera, Images, CheckCircle2, Loader2, Plus, Trash2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import TopBar from '../components/TopBar'
import { useApp } from '../context/AppContext'
import { EVENT_CATEGORY_META, type EventCategory, type TicketTier } from '../types'
import { compressImageFile } from '../lib/media'

const STEPS = ['Photos', 'Details', 'Tickets & Time', 'Publish']
const MAX_PHOTOS = 3

// Rounds "now" up to the next 15-minute mark so the datetime-local input doesn't default to
// a moment that's already slipped into the past by the time the organizer picks a date.
function defaultStartLocal(): string {
  const d = new Date(Date.now() + 60 * 60000)
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function CreateEvent() {
  const navigate = useNavigate()
  const { publishEvent, userLocation } = useApp()
  const [step, setStep] = useState(0)
  const [photos, setPhotos] = useState<(string | null)[]>(() => Array(MAX_PHOTOS).fill(null))
  const [photoError, setPhotoError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<EventCategory>('live_show')
  const [description, setDescription] = useState('')
  const [venueName, setVenueName] = useState('')

  const [startsAt, setStartsAt] = useState(defaultStartLocal())
  const [endsAt, setEndsAt] = useState('')
  const [free, setFree] = useState(true)
  const [tiers, setTiers] = useState<TicketTier[]>([{ name: 'General', price: 0 }])

  const [publishing, setPublishing] = useState(false)
  const [publishedId, setPublishedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filledPhotos = photos.filter((p): p is string => !!p)

  const updateTier = (i: number, patch: Partial<TicketTier>) =>
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)))
  const addTier = () => setTiers((prev) => [...prev, { name: '', price: 0 }])
  const removeTier = (i: number) => setTiers((prev) => prev.filter((_, idx) => idx !== i))

  const publish = async () => {
    setPublishing(true)
    setError(null)
    try {
      const start = new Date(startsAt)
      if (Number.isNaN(start.getTime())) throw new Error('Pick a valid date/time')
      await new Promise((r) => setTimeout(r, 500))
      const created = await publishEvent({
        category,
        title: title || 'Untitled event',
        description,
        venueName: venueName || userLocation.label,
        lat: userLocation.lat + (userLocation.status === 'live' ? 0 : (Math.random() - 0.5) * 0.01),
        lng: userLocation.lng + (userLocation.status === 'live' ? 0 : (Math.random() - 0.5) * 0.01),
        startsAt: start.toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
        ticketTiers: free ? [] : tiers.filter((t) => t.name.trim()).map((t) => ({ name: t.name.trim(), price: t.price })),
        images: filledPhotos.length > 0 ? filledPhotos : [EVENT_CATEGORY_META[category].emoji],
      })
      setPublishedId(created.id)
      setStep(3)
    } catch (err) {
      console.error('publish event failed', err)
      setError('Could not publish this event — check the API server is running and try again.')
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
    setVenueName('')
    setTiers([{ name: 'General', price: 0 }])
    setFree(true)
    setStartsAt(defaultStartLocal())
    setEndsAt('')
    setPublishedId(null)
    setError(null)
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <div className="px-4 pb-3 pt-1">
        <h1 className="text-xl font-display font-bold tracking-tight text-ink">Host an event</h1>
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
              becomes the cover image people see first.
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
            <button onClick={() => setStep(1)} className="btn-primary mt-4 w-full text-sm">
              Continue
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <Field label="Category">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as EventCategory)}
                className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
              >
                {(Object.keys(EVENT_CATEGORY_META) as EventCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {EVENT_CATEGORY_META[c].emoji} {EVENT_CATEGORY_META[c].label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Title">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Afrobeats Live: Freetown Sessions"
                className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
              />
            </Field>
            <Field label="Venue name">
              <input
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                placeholder="e.g. National Stadium Grounds"
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
            <button
              onClick={() => setStep(2)}
              disabled={!title || !venueName}
              className="btn-primary mt-2 w-full text-sm"
            >
              Continue
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <Field label="Starts">
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
              />
            </Field>
            <Field label="Ends (optional)">
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]"
              />
            </Field>

            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={free}
                onChange={(e) => setFree(e.target.checked)}
                className="h-4 w-4 accent-[#245b32]"
              />
              This is a free event
            </label>

            {!free && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Ticket tiers</p>
                {tiers.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={t.name}
                      onChange={(e) => updateTier(i, { name: e.target.value })}
                      placeholder="Tier name (e.g. General)"
                      className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
                    />
                    <input
                      type="number"
                      value={t.price}
                      onChange={(e) => updateTier(i, { price: Number(e.target.value) || 0 })}
                      placeholder="Price"
                      className="w-24 shrink-0 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
                    />
                    {tiers.length > 1 && (
                      <button
                        onClick={() => removeTier(i)}
                        aria-label="Remove tier"
                        className="tap-flash flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-bad transition active:scale-90"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={addTier}
                  className="tap-flash flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5 text-xs text-ink transition active:scale-95"
                >
                  <Plus size={12} /> Add another tier
                </button>
              </div>
            )}

            <div className="card-elevated rounded-xl bg-surface p-3">
              <p className="text-xs text-muted">
                {userLocation.status === 'live' ? 'GPS location captured' : 'Using default location — GPS not available'}
              </p>
              <p className="text-sm text-ink">Venue pin: {userLocation.label}</p>
              <p className="mt-1 text-xs text-muted">
                Unlike listings, event venues are always shown at their exact location —
                people need to be able to find and attend.
              </p>
            </div>

            {error && <p className="text-xs text-bad">{error}</p>}
            <button onClick={publish} disabled={publishing} className="btn-primary w-full text-sm">
              {publishing ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Publishing…
                </>
              ) : (
                'Publish event'
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
            <h2 className="mb-1 text-base font-semibold text-ink">Event is live!</h2>
            <p className="mb-6 max-w-xs text-sm text-muted">
              {title} is now visible to nearby buyers in Events.
            </p>
            <div className="flex w-full max-w-xs flex-col gap-2">
              <button onClick={() => navigate(`/events/${publishedId}`)} className="btn-primary w-full text-sm">
                View event
              </button>
              <button onClick={reset} className="btn-secondary w-full text-sm">
                Host another event
              </button>
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  )
}

// Same photo-slot pattern as Sell.tsx's PhotoSlot — duplicated locally rather than shared,
// matching how this codebase keeps each flow's step components self-contained.
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
    e.target.value = ''
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
          <img src={photo} alt="Event photo" className="h-full w-full object-cover" />
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
