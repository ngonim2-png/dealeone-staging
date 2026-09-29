import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader2, TrendingDown } from 'lucide-react'
import BackHeader from '../../components/BackHeader'
import Field from '../../components/Field'
import PhotoSlot from '../../components/PhotoSlot'
import LoadError from '../../components/LoadError'
import { CategoryHint, DescriptionPrompts, PriceGuideCard } from '../../components/ListingHelp'
import { VoiceNoteRecorder } from '../../components/VoiceNote'
import { useToast } from '../../components/Toast'
import { useApp, type EditListingInput } from '../../context/AppContext'
import { api, errorMessage } from '../../lib/api'
import { compressImageFile, isImageUrl } from '../../lib/media'
import { mapListing } from '../../lib/mappers'
import { formatPrice } from '../../lib/format'
import { useT } from '../../lib/i18n'
import { CATEGORY_META, type Category, type Condition, type Listing } from '../../types'

const MAX_PHOTOS = 5
const inputCls =
  'w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(36,91,50,0.15)]'

// Edit a published listing — fix a typo, add photos, change the price. Lowering the price
// of an active listing sends a "price drop" alert to everyone who saved it (the API does
// that; see apps/api/src/lib/alerts.ts), which is the single best way to revive interest.
export default function EditListing() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const t = useT()
  const { editListing, currentUser } = useApp()

  const [original, setOriginal] = useState<Listing | null>(null)
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)

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

  const load = () => {
    if (!id) return
    setFailed(false)
    api
      .get<{ listing: unknown }>(`/api/listings/${id}`)
      .then((res) => {
        const l = mapListing(res.listing)
        setOriginal(l)
        const real = l.images.filter((x) => isImageUrl(x))
        setPhotos(Array.from({ length: MAX_PHOTOS }, (_, i) => real[i] ?? null))
        setTitle(l.title)
        setCategory(l.category)
        setDescription(l.description)
        setPrice(String(l.price))
        setNegotiable(l.negotiable)
        setCondition(l.condition)
        setQuantity(String(l.quantity))
        setVoiceNote(l.voiceNoteUrl ?? null)
      })
      .catch(() => setFailed(true))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [id])

  const filledPhotos = photos.filter((p): p is string => !!p)

  // Only send what actually changed — re-sending unchanged photos would be a wasted upload
  // on a slow connection.
  const changes = useMemo((): EditListingInput => {
    if (!original) return {}
    const c: EditListingInput = {}
    if (title.trim() !== original.title) c.title = title.trim()
    if (category !== original.category) c.category = category
    if (description !== original.description) c.description = description
    const p = Math.max(0, Math.round(Number(price) || 0))
    if (p !== original.price) c.price = p
    if (negotiable !== original.negotiable) c.negotiable = negotiable
    if (condition !== original.condition) c.condition = condition
    const q = Math.max(1, Math.round(Number(quantity) || 1))
    if (q !== original.quantity) c.quantity = q
    const origReal = original.images.filter((x) => isImageUrl(x))
    if (JSON.stringify(filledPhotos) !== JSON.stringify(origReal)) {
      c.images = filledPhotos.length ? filledPhotos : [CATEGORY_META[category].emoji]
    }
    if ((voiceNote ?? null) !== (original.voiceNoteUrl ?? null)) c.voiceNote = voiceNote
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [original, title, category, description, price, negotiable, condition, quantity, voiceNote, photos])

  const dirty = Object.keys(changes).length > 0
  const priceDrop = original && changes.price != null && changes.price < original.price && original.status === 'active'

  const save = async () => {
    if (!id || !dirty || saving) return
    if (!title.trim()) {
      toast.error('Add a title.')
      return
    }
    setSaving(true)
    try {
      await editListing(id, changes)
      toast.success(priceDrop ? 'Saved — people who saved this item will hear about the new price.' : 'Listing updated.')
      navigate(`/listing/${id}`, { replace: true })
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save your changes — try again."))
    } finally {
      setSaving(false)
    }
  }

  if (failed) {
    return (
      <div className="flex min-h-dvh flex-col">
        <BackHeader title={t('listing.edit')} />
        <LoadError onRetry={load} />
      </div>
    )
  }
  if (!original) {
    return (
      <div className="flex min-h-dvh flex-col">
        <BackHeader title={t('listing.edit')} />
        <div className="flex flex-1 items-center justify-center text-sm text-muted">
          <Loader2 size={16} className="mr-2 animate-spin text-accent" /> Loading…
        </div>
      </div>
    )
  }
  if (original.sellerId !== currentUser?.id) {
    return (
      <div className="flex min-h-dvh flex-col">
        <BackHeader title={t('listing.edit')} />
        <p className="p-6 text-center text-sm text-muted">You can only edit your own listings.</p>
      </div>
    )
  }
  if (original.status === 'sold' || original.status === 'removed') {
    return (
      <div className="flex min-h-dvh flex-col">
        <BackHeader title={t('listing.edit')} />
        <p className="p-6 text-center text-sm text-muted">A {original.status} listing can't be edited.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title={t('listing.edit')} />
      <div className="mx-auto w-full max-w-2xl flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div>
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">Photos</span>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {photos.map((p, i) => (
              <PhotoSlot
                key={i}
                photo={p}
                onPick={async (file) => {
                  setPhotoError(null)
                  try {
                    const dataUrl = await compressImageFile(file)
                    setPhotos((prev) => prev.map((x, idx) => (idx === i ? dataUrl : x)))
                  } catch {
                    setPhotoError("Couldn't use that photo — try a different one.")
                  }
                }}
                onRemove={() => setPhotos((prev) => prev.map((x, idx) => (idx === i ? null : x)))}
              />
            ))}
          </div>
          {photoError && <p className="mt-1 text-xs text-bad">{photoError}</p>}
        </div>

        <Field label={t('sell.title')}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={inputCls} />
        </Field>
        <Field label={t('sell.category')}>
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className={inputCls}>
            {(Object.keys(CATEGORY_META) as Category[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_META[c].emoji} {CATEGORY_META[c].label}
              </option>
            ))}
          </select>
          <CategoryHint title={title} category={category} onPick={setCategory} />
        </Field>
        <div>
          <Field label={t('sell.description')}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={4000}
              className={`${inputCls} resize-none`}
            />
          </Field>
          <DescriptionPrompts
            category={category}
            description={description}
            onAdd={(line) => setDescription((d) => (d.trim() ? `${d.trimEnd()}\n${line} ` : `${line} `))}
          />
        </div>
        <VoiceNoteRecorder value={voiceNote} onChange={setVoiceNote} label={t('sell.voice')} />

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('sell.price')}>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))}
              className={inputCls}
            />
          </Field>
          <Field label={t('sell.quantity')}>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, ''))}
              className={inputCls}
            />
          </Field>
        </div>
        {priceDrop && (
          <p className="flex items-center gap-1.5 rounded-xl bg-good/10 px-3 py-2 text-xs text-good">
            <TrendingDown size={13} className="shrink-0" />
            Price drop from {formatPrice(original.price)} — everyone who saved this item gets an alert.
          </p>
        )}
        <PriceGuideCard category={category} title={title} price={price} excludeId={original.id} onUse={(p) => setPrice(String(p))} />

        <Field label={t('sell.condition')} group>
          <div className="flex gap-2">
            {(['new', 'used', 'refurbished'] as Condition[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCondition(c)}
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
      </div>

      <div className="sticky bottom-0 border-t border-border bg-bg/95 px-4 pb-[calc(env(safe-area-inset-bottom)_+_0.75rem)] pt-3 backdrop-blur">
        <button onClick={save} disabled={!dirty || saving || !title.trim()} className="btn-primary mx-auto min-h-12 w-full max-w-2xl text-sm">
          {saving && <Loader2 size={15} className="animate-spin" />}
          {saving ? 'Saving…' : dirty ? 'Save changes' : 'No changes yet'}
        </button>
      </div>
    </div>
  )
}
