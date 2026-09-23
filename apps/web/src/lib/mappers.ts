import type {
  BuyerRequest,
  ChatMessage,
  CurrentUser,
  DealeoneEvent,
  Dispute,
  Listing,
  Offer,
  Report,
  Seller,
  StatusItem,
  TicketTier,
} from '../types'

// Converts the API's row shapes (see apps/api/src/db/schema.ts) into the frontend's
// existing types, so the rest of the app (built against mock data first) barely changes.

export function mapSeller(s: {
  id: string
  name: string
  avatarEmoji: string
  isBusiness: boolean
  verificationLevel: number
  rating: number
  ratingCount: number
  location: string
}): Seller {
  return {
    id: s.id,
    name: s.name,
    isBusiness: s.isBusiness,
    avatar: s.avatarEmoji,
    location: s.location,
    verificationLevel: s.verificationLevel as Seller['verificationLevel'],
    rating: s.rating,
    ratingCount: s.ratingCount,
  }
}

export function mapListing(l: any): Listing {
  return {
    id: l.id,
    sellerId: l.sellerId,
    category: l.category,
    title: l.title,
    price: l.price,
    negotiable: l.negotiable,
    condition: l.condition,
    quantity: l.quantity,
    description: l.description,
    lat: l.lat,
    lng: l.lng,
    approxLocation: l.approxLocation ?? true,
    status: l.status,
    type: l.type,
    createdAt: l.createdAt,
    expiresAt: l.expiresAt,
    feePaidUntil: l.feePaidUntil,
    sponsored: l.sponsored,
    sponsoredUntil: l.sponsoredUntil ?? undefined,
    featured: l.featured,
    featuredUntil: l.featuredUntil ?? undefined,
    categoryPinned: l.categoryPinned,
    categoryPinnedUntil: l.categoryPinnedUntil ?? undefined,
    banner: l.banner,
    bannerUntil: l.bannerUntil ?? undefined,
    images: l.images ?? [],
    dealOriginalPrice: l.dealOriginalPrice ?? undefined,
    dealValidUntil: l.dealValidUntil ?? undefined,
  }
}

export function mapEvent(e: any): DealeoneEvent {
  return {
    id: e.id,
    organizerId: e.organizerId,
    category: e.category,
    title: e.title,
    description: e.description,
    venueName: e.venueName,
    lat: e.lat,
    lng: e.lng,
    startsAt: e.startsAt,
    endsAt: e.endsAt ?? undefined,
    ticketTiers: (e.ticketTiers ?? []) as TicketTier[],
    images: e.images ?? [],
    status: e.status,
    createdAt: e.createdAt,
    interestedCount: e.interestedCount ?? 0,
    isInterested: e.isInterested ?? false,
  }
}

export function mapOffer(o: any): Offer {
  return {
    id: o.id,
    listingId: o.listingId,
    buyerId: o.buyerId,
    amount: o.amount,
    message: o.message ?? undefined,
    status: o.status,
    counterAmount: o.counterAmount ?? undefined,
    createdAt: o.createdAt,
  }
}

export function mapMessage(m: any): ChatMessage {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    type: m.type,
    text: m.text,
    amount: m.amount ?? undefined,
    audioUrl: m.audioUrl ?? undefined,
    audioDurationSec: m.audioDurationSec ?? undefined,
    createdAt: m.createdAt,
    read: m.read,
  }
}

export function mapBuyerRequest(r: any): BuyerRequest {
  return {
    id: r.id,
    product: r.product,
    maxOffer: r.maxOffer,
    radiusKm: r.radiusKm,
    condition: r.condition,
    expiresAt: r.expiresAt,
    status: r.status,
    responses: r.responses,
  }
}

export function mapCurrentUser(u: any): CurrentUser {
  return {
    id: u.id,
    name: u.name,
    initials: initialsOf(u.name),
    location: u.location,
    isBuyerAndSeller: true,
    isBusiness: u.isBusiness ?? false,
    businessName: u.businessName ?? undefined,
    verificationLevel: u.verificationLevel,
    rating: u.rating,
    ratingCount: u.ratingCount ?? 0,
    verificationPriorityUntil: u.verificationPriorityUntil ?? undefined,
    buyerRequestPriorityUntil: u.buyerRequestPriorityUntil ?? undefined,
    role: u.role ?? 'user',
  }
}

export function mapReport(r: any): Report {
  return {
    id: r.id,
    targetType: r.targetType,
    targetId: r.targetId,
    reason: r.reason,
    details: r.details,
    status: r.status,
    createdAt: r.createdAt,
  }
}

export function mapStatusItem(s: any): StatusItem {
  return {
    id: s.id,
    userId: s.userId,
    imageUrl: s.imageUrl,
    caption: s.caption ?? '',
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    viewedByMe: s.viewedByMe ?? false,
  }
}

export function mapDispute(d: any): Dispute {
  return {
    id: d.id,
    conversationId: d.conversationId,
    reason: d.reason,
    details: d.details,
    status: d.status,
    createdAt: d.createdAt,
  }
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}
