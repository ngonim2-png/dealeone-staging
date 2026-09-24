import { Heart } from 'lucide-react'
import BackHeader from '../../components/BackHeader'
import ListingCard from '../../components/ListingCard'
import EmptyState from '../../components/EmptyState'
import { useApp } from '../../context/AppContext'

export default function Wishlist() {
  const { listings, wishlist } = useApp()
  const saved = listings.filter((l) => wishlist.includes(l.id))

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title="My Wishlist" />
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {saved.length === 0 && (
          <EmptyState
            icon={Heart}
            title="Nothing saved yet"
            hint="Save products you like by tapping the heart icon on any listing."
          />
        )}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3 lg:grid-cols-3">
          {saved.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
        {saved.length > 0 && (
          <p className="pt-2 text-center text-[11px] text-muted">
            We'll notify you if a saved product drops in price, becomes available closer, or is
            relisted by a verified seller.
          </p>
        )}
      </div>
    </div>
  )
}
