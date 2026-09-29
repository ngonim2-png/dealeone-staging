import { Building2, Landmark, MapPin, MessageSquareText, ShieldCheck, ShoppingBasket, X } from 'lucide-react'

// Safe-meetup help inside a chat: the rules that prevent almost every bad in-person deal,
// public places roughly halfway between the two of you (opens the phone's maps app), and a
// one-tap message proposing a public meeting spot — so suggesting safety isn't awkward.
const TIPS = [
  'Meet in a busy public place in daylight — a supermarket, bank, petrol station or police station.',
  'Check the item fully before you pay: switch phones on, test appliances, see the papers for cars and property.',
  'Pay only when the item is in your hands. Never send Orange Money / Afrimoney in advance or share a PIN or code.',
  'For big deals, bring a friend and tell someone where you are going.',
]

const PLACES = [
  { label: 'Supermarkets', q: 'supermarket', icon: ShoppingBasket },
  { label: 'Banks', q: 'bank', icon: Landmark },
  { label: 'Police stations', q: 'police station', icon: Building2 },
]

export default function MeetSafelySheet({
  open,
  onClose,
  from,
  to,
  role,
  onSuggest,
}: {
  open: boolean
  onClose: () => void
  from: { lat: number; lng: number }
  to?: { lat: number; lng: number }
  role: 'buyer' | 'seller'
  onSuggest: (text: string) => void
}) {
  if (!open) return null
  const mid = to ? { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 } : from
  const suggestion =
    role === 'buyer'
      ? "Can we meet somewhere busy and public — a supermarket, bank or petrol station? I'll check the item there and pay you on the spot. What time works for you?"
      : "Let's meet somewhere busy and public — a supermarket, bank or petrol station — so you can check the item before paying. What time works for you?"

  return (
    <div
      className="scrim-enter fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="meet-safely-title"
        className="sheet-elevated sheet-enter max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-border bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)_+_1.25rem)]"
      >
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-good/12 text-good">
            <ShieldCheck size={18} />
          </span>
          <h2 id="meet-safely-title" className="flex-1 text-base font-semibold text-ink">
            Meet safely
          </h2>
          <button onClick={onClose} aria-label="Close" className="icon-btn h-10 w-10 bg-surface-2 text-ink">
            <X size={16} />
          </button>
        </div>
        <ul className="space-y-2.5">
          {TIPS.map((tip, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm leading-snug text-ink/90">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-good/12 text-[11px] font-bold text-good">
                {i + 1}
              </span>
              {tip}
            </li>
          ))}
        </ul>

        <p className="mb-2 mt-5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
          <MapPin size={12} /> Public places {to ? 'halfway between you' : 'near you'}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {PLACES.map((p) => (
            <a
              key={p.q}
              href={`https://www.google.com/maps/search/${encodeURIComponent(p.q)}/@${mid.lat.toFixed(5)},${mid.lng.toFixed(5)},15z`}
              target="_blank"
              rel="noreferrer"
              className="tap-flash flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl bg-surface-2 px-1 text-center text-[11px] font-medium text-ink transition active:scale-95"
            >
              <p.icon size={17} className="text-accent" />
              {p.label}
            </a>
          ))}
        </div>

        <button
          onClick={() => {
            onSuggest(suggestion)
            onClose()
          }}
          className="btn-primary mt-5 min-h-12 w-full text-sm"
        >
          <MessageSquareText size={16} /> Suggest a public meeting place
        </button>
      </div>
    </div>
  )
}
