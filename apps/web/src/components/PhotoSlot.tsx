import { useRef, useState, type ChangeEvent } from 'react'
import { Camera, Images, X, Plus } from 'lucide-react'
import { mediaSrc } from '../lib/media'

// A single photo slot in the Sell flow's grid. Empty: tapping opens a small action sheet
// with "Take Photo" (opens the device camera directly via the `capture` attribute on
// mobile) and "Choose from Gallery" (a plain file picker) — both are real hidden
// <input type="file"> elements; the visible buttons are just styled triggers for them.
// Filled: shows the compressed photo with a remove button; tapping the photo itself
// re-opens the action sheet to replace it.
export default function PhotoSlot({
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
          <img src={photo.startsWith('data:') ? photo : mediaSrc(photo, 'thumb')} alt="Listing photo" className="h-full w-full object-cover" />
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
            className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-bg/80 text-ink backdrop-blur transition-transform active:scale-90"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="Add a photo"
          aria-expanded={open}
          className="tap-flash flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-surface-2 text-muted transition-transform active:scale-[0.97]"
        >
          <Plus size={18} />
        </button>
      )}

      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 w-44 space-y-1 rounded-xl border border-border bg-surface p-2 shadow-xl">
          <button
            onClick={() => cameraInputRef.current?.click()}
            className="tap-flash flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink transition-colors active:bg-surface-2"
          >
            <Camera size={15} className="text-accent" /> Take Photo
          </button>
          <button
            onClick={() => galleryInputRef.current?.click()}
            className="tap-flash flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink transition-colors active:bg-surface-2"
          >
            <Images size={15} className="text-accent" /> Choose from Gallery
          </button>
        </div>
      )}
    </div>
  )
}

