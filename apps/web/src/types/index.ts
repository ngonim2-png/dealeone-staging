// Core DEALEONE data model — mirrors spec §43 (DATA STRUCTURE)

export type Category =
  | 'electronics'
  | 'cars'
  | 'property'
  | 'food'
  | 'groceries'
  | 'fashion'
  | 'services'
  | 'furniture'
  | 'agriculture'
  | 'computers'
  | 'shops'
  // Added in the categories-expansion round: the original 11 were broad strokes (fashion,
  // electronics, shops...) with nowhere for common resale items — phones, jewelry, shoes,
  // tools/hardware, auto parts, pets — to live except a generic bucket. See
  // apps/api/src/db/schema.ts's categoryEnum for the matching DB migration and
  // lib/categoryIcons.ts for each one's map-pin glyph.
  | 'phones'
  | 'appliances'
  | 'home_living'
  | 'beauty_health'
  | 'baby_kids'
  | 'jewelry_watches'
  | 'bags_luggage'
  | 'shoes'
  | 'sports_outdoors'
  | 'toys_games'
  | 'office_school'
  | 'tools_hardware'
  | 'auto_parts'
  | 'pets'
  | 'hobbies_music'

export const CATEGORY_META: Record<
  Category,
  { label: string; emoji: string }
> = {
  electronics: { label: 'Electronics', emoji: '📺' },
  cars: { label: 'Cars', emoji: '🚗' },
  property: { label: 'Property', emoji: '🏠' },
  food: { label: 'Food', emoji: '🍔' },
  groceries: { label: 'Groceries', emoji: '🛒' },
  fashion: { label: 'Fashion', emoji: '👗' },
  services: { label: 'Services', emoji: '🔧' },
  furniture: { label: 'Furniture', emoji: '🪑' },
  agriculture: { label: 'Agriculture', emoji: '🌾' },
  computers: { label: 'Computers', emoji: '💻' },
  shops: { label: 'Shops', emoji: '🏪' },
  phones: { label: 'Phones & Accessories', emoji: '📱' },
  appliances: { label: 'Appliances', emoji: '🔌' },
  home_living: { label: 'Home & Living', emoji: '🏺' },
  beauty_health: { label: 'Beauty & Health', emoji: '💄' },
  baby_kids: { label: 'Baby & Kids', emoji: '🍼' },
  jewelry_watches: { label: 'Jewelry & Watches', emoji: '💎' },
  bags_luggage: { label: 'Bags & Luggage', emoji: '👜' },
  shoes: { label: 'Shoes', emoji: '👟' },
  sports_outdoors: { label: 'Sports & Outdoors', emoji: '⚽' },
  toys_games: { label: 'Toys & Games', emoji: '🧸' },
  office_school: { label: 'Office & School', emoji: '✏️' },
  tools_hardware: { label: 'Tools & Hardware', emoji: '🛠️' },
  auto_parts: { label: 'Auto Parts', emoji: '⚙️' },
  pets: { label: 'Pet Supplies', emoji: '🐾' },
  hobbies_music: { label: 'Hobbies & Music', emoji: '🎸' },
}

export type Condition = 'new' | 'used' | 'refurbished'
export type ListingType = 'standard' | 'deal' | 'auction' | 'wanted' | 'service'
export type ListingStatus =
  | 'draft'
  | 'pending_payment'
  | 'active'
  | 'reserved'
  | 'sold'
  | 'expired'
  | 'removed'

export type VerificationLevel = 0 | 1 | 2 | 3 | 4
export const VERIFICATION_LABELS: Record<VerificationLevel, string> = {
  0: 'Unverified',
  1: 'Phone Verified',
  2: 'Identity Verified',
  3: 'Verified Seller',
  4: 'Verified Business',
}

export interface Seller {
  id: string
  name: string
  isBusiness: boolean
  avatar: string // emoji or initials fallback
  location: string
  verificationLevel: VerificationLevel
  rating: number
  ratingCount: number
}

export interface Listing {
  id: string
  sellerId: string
  category: Category
  title: string
  price: number
  negotiable: boolean
  condition: Condition
  quantity: number
  description: string
  lat: number
  lng: number
  // Seller-controlled privacy toggle (Sell flow's Location step). true = buyers who aren't
  // the seller get a fuzzed pin/area from the API and no exact street address; the server
  // (apps/api/src/lib/geo.ts's presentListing) is what actually enforces this — this field
  // is just along for the ride so the frontend knows which map/address treatment to show.
  approxLocation: boolean
  status: ListingStatus
  type: ListingType
  createdAt: string
  expiresAt: string
  // Recurring monthly listing fee (NLe 30/mo — see Sell.tsx and AppContext.tsx's
  // renewListing). Once this passes without a renewal, the API's lazy billing sweep flips
  // `status` to 'expired' and the listing drops out of public search/map results.
  feePaidUntil: string
  sponsored: boolean
  sponsoredUntil?: string // paid-through date for the current Boost, if any (NLe 100/wk)
  featured: boolean
  featuredUntil?: string // paid-through date for the current Featured badge, if any (NLe 100/wk)
  // "Top Search Placement" (NLe 100/wk) — pins above others within its own category.
  categoryPinned: boolean
  categoryPinnedUntil?: string
  // Explore homepage banner ad (NLe 100/wk, business accounts only).
  banner: boolean
  bannerUntil?: string
  images: string[] // emoji placeholders standing in for photos
  dealOriginalPrice?: number
  dealValidUntil?: string
}

// Events — a dedicated section (Events.tsx/EventDetail.tsx/CreateEvent.tsx), not another
// listing category: a live show/concert/sports match/etc. has a start time, a named venue,
// and (optionally) ticket price tiers instead of a single item price/condition/quantity.
// See apps/api/src/db/schema.ts's eventCategoryEnum for the matching DB enum.
export type EventCategory =
  | 'live_show'
  | 'nightlife'
  | 'sports'
  | 'community'
  | 'business'
  | 'arts_culture'
  | 'food_drink'
  | 'religious'
  | 'other'

export const EVENT_CATEGORY_META: Record<EventCategory, { label: string; emoji: string }> = {
  live_show: { label: 'Live Shows', emoji: '🎤' },
  nightlife: { label: 'Nightlife', emoji: '🪩' },
  sports: { label: 'Sports', emoji: '⚽' },
  community: { label: 'Community', emoji: '🤝' },
  business: { label: 'Business', emoji: '💼' },
  arts_culture: { label: 'Arts & Culture', emoji: '🎭' },
  food_drink: { label: 'Food & Drink', emoji: '🍲' },
  religious: { label: 'Religious', emoji: '🙏' },
  other: { label: 'Other', emoji: '📅' },
}

export type EventStatus = 'active' | 'cancelled'

// A single ticket price tier (e.g. "General" NLe 50, "VIP" NLe 150) — an empty tiers array
// means a free event. See events.ticketTiers in schema.ts.
export interface TicketTier {
  name: string
  price: number
}

export interface DealeoneEvent {
  id: string
  organizerId: string
  category: EventCategory
  title: string
  description: string
  venueName: string
  lat: number
  lng: number
  startsAt: string
  endsAt?: string
  ticketTiers: TicketTier[]
  images: string[]
  status: EventStatus
  createdAt: string
  // Derived, not stored on the row itself — computed server-side from eventInterests (see
  // routes/events.ts's withInterestData). Defaults to 0/false wherever the API response
  // doesn't include them (e.g. the plain row returned by POST /:id/status).
  interestedCount: number
  isInterested: boolean
}

export interface Offer {
  id: string
  listingId: string
  buyerId: string
  amount: number
  message?: string
  status: 'pending' | 'accepted' | 'rejected' | 'countered'
  counterAmount?: number
  createdAt: string
}

export type MessageType = 'text' | 'offer' | 'counter_offer' | 'system' | 'voice'

export interface ChatMessage {
  id: string
  conversationId: string
  senderId: string // 'me' or sellerId
  type: MessageType
  text: string
  amount?: number
  // Voice notes (accessibility: sending/receiving a recorded clip instead of typing) —
  // only set when type === 'voice'.
  audioUrl?: string
  audioDurationSec?: number
  createdAt: string
  read: boolean
}

export interface Conversation {
  id: string
  // Exactly one of listingId/eventId is set — a conversation is either about a listing
  // ("Message Seller") or an event ("Message organizer"), see the conversations table's
  // polymorphic listingId/eventId columns in apps/api/src/db/schema.ts.
  listingId?: string
  eventId?: string
  sellerId: string
  lastMessageAt: string
  unreadCount: number
  messages: ChatMessage[]
}

export interface WishlistEntry {
  listingId: string
  savedAt: string
  alert?: string
}

export interface BuyerRequest {
  id: string
  product: string
  maxOffer: number
  radiusKm: number
  condition: 'new' | 'used' | 'either'
  expiresAt: string
  status: 'open' | 'matched' | 'expired'
  responses: number
}

export interface CurrentUser {
  id: string
  name: string
  initials: string
  location: string
  isBuyerAndSeller: boolean
  // Real business-account fields (see account/Settings.tsx) — before this round `isBusiness`
  // existed in the DB/API but a real user could never actually set it; it was seed-data
  // only. Gates the Explore banner ad and buyer-request priority-access purchases.
  isBusiness: boolean
  businessName?: string
  verificationLevel: VerificationLevel
  rating: number
  ratingCount: number
  // "Verified-seller fast-track" / "Buyer-Request priority access" (both NLe 100/wk) —
  // paid-through dates, undefined if never purchased. See account/Verification.tsx and
  // account/BuyerRequestsFeed.tsx.
  verificationPriorityUntil?: string
  buyerRequestPriorityUntil?: string
  role: 'user' | 'admin'
}

// Trust & safety — scam/fraud reporting and dispute resolution (see AppContext's
// submitReport/submitDispute, ListingDetail's Report button, and ChatThread's report/dispute
// actions). Both are intentionally simple: a report targets a listing or a user directly; a
// dispute is tied to a conversation, since there's no payments/accepted-offer record yet for
// it to attach to (see apps/api/src/db/schema.ts's comment on the disputes table).
export type ReportReason = 'scam' | 'counterfeit' | 'inappropriate' | 'spam' | 'other'
export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed'

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  scam: 'Scam or fraud',
  counterfeit: 'Counterfeit or fake item',
  inappropriate: 'Inappropriate content',
  spam: 'Spam',
  other: 'Other',
}

export interface Report {
  id: string
  targetType: 'listing' | 'user' | 'event' | 'status'
  targetId: string
  reason: ReportReason
  details: string
  status: ReportStatus
  createdAt: string
}

// Statuses — WhatsApp/Instagram-Story-style ephemeral photo updates, gated to business
// accounts with an active paid promotion (see apps/api/src/lib/statusEligibility.ts) as a
// perk for existing Boost/Featured/Top-Placement/Banner/Verified-priority/Buyer-Request-
// priority purchasers rather than a new paid thing of its own. See StatusRow/StatusViewer/
// StatusComposer and AppContext's refreshStatuses/postStatus/deleteStatus/viewStatus.
export interface StatusItem {
  id: string
  userId: string
  imageUrl: string
  caption: string
  createdAt: string
  expiresAt: string
  viewedByMe: boolean
}

export interface StatusGroup {
  userId: string
  allViewed: boolean
  statuses: StatusItem[]
}

export type DisputeReason =
  | 'item_not_as_described'
  | 'no_show_seller'
  | 'no_show_buyer'
  | 'payment_issue'
  | 'other'
export type DisputeStatus =
  | 'open'
  | 'in_review'
  | 'resolved_buyer'
  | 'resolved_seller'
  | 'resolved_other'
  | 'dismissed'

export const DISPUTE_REASON_LABELS: Record<DisputeReason, string> = {
  item_not_as_described: 'Item not as described',
  no_show_seller: 'Seller did not show up',
  no_show_buyer: 'Buyer did not show up',
  payment_issue: 'Payment issue',
  other: 'Other',
}

export interface Dispute {
  id: string
  conversationId: string
  reason: DisputeReason
  details: string
  status: DisputeStatus
  createdAt: string
}
