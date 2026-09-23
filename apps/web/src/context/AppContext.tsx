import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type {
  BuyerRequest,
  ChatMessage,
  Conversation,
  CurrentUser,
  DealeoneEvent,
  Dispute,
  DisputeReason,
  EventStatus,
  Listing,
  ListingStatus,
  Offer,
  Report,
  ReportReason,
  Seller,
  StatusGroup,
  TicketTier,
} from '../types'
import { api, clearSessionToken, getSessionToken, setSessionToken } from '../lib/api'
import {
  mapBuyerRequest,
  mapCurrentUser,
  mapDispute,
  mapEvent,
  mapListing,
  mapMessage,
  mapOffer,
  mapReport,
  mapSeller,
  mapStatusItem,
} from '../lib/mappers'
import { useLiveLocation, type LiveLocation } from '../lib/useLiveLocation'

export interface NewListingInput {
  category: Listing['category']
  title: string
  description: string
  price: number
  negotiable: boolean
  condition: Listing['condition']
  quantity: number
  lat: number
  lng: number
  approxLocation: boolean
  durationMonths: number
  images: string[]
}

export interface NewEventInput {
  category: DealeoneEvent['category']
  title: string
  description: string
  venueName: string
  lat: number
  lng: number
  startsAt: string
  endsAt?: string
  ticketTiers: TicketTier[]
  images: string[]
}

interface AppContextValue {
  ready: boolean
  authChecked: boolean
  error: string | null
  listings: Listing[]
  // Events — a dedicated section (Events.tsx/EventDetail.tsx/CreateEvent.tsx/MyEvents.tsx),
  // fetched at bootstrap the same way `listings` is (radiusKm=25000, filtered client-side).
  events: DealeoneEvent[]
  sellers: Seller[]
  buyerRequests: BuyerRequest[]
  currentUser: CurrentUser | null
  wishlist: string[]
  offers: Offer[]
  conversations: Conversation[]
  reports: Report[]
  disputes: Dispute[]
  // Listing ids the current user has already rated (as the buyer) — loaded once at
  // bootstrap from GET /api/ratings/mine. Lets ChatThread.tsx decide whether a sold
  // listing's "Rate your seller" prompt should still show.
  ratedListingIds: string[]
  // Statuses — the Chats.tsx "Status row" (see StatusRow.tsx). statusGroups is every
  // currently-active status grouped by poster (own group first, per routes/statuses.ts);
  // canPostStatus mirrors the server's isEligibleForStatus check for the current user, purely
  // to drive the "+" compose affordance — POST /api/statuses re-checks for real regardless.
  statusGroups: StatusGroup[]
  canPostStatus: boolean
  // Real device location (see lib/useLiveLocation.ts) — falls back to the fixed demo
  // coordinate until/unless GPS resolves. One instance shared app-wide via context rather
  // than each page starting its own watchPosition.
  userLocation: LiveLocation
  checkPhone: (phone: string) => Promise<{ exists: boolean }>
  signup: (phone: string, pin: string) => Promise<void>
  login: (phone: string, pin: string) => Promise<void>
  completeProfile: (name: string) => Promise<void>
  logout: () => void
  // Account deletion (account/Settings.tsx's "Delete account" flow) — reauthenticates with
  // the account's own PIN server-side (routes/users.ts's DELETE /me), then resets local
  // state via logout() exactly the same way signing out does, since the account is gone
  // either way. Throws (ApiError) on a wrong PIN so the caller can show that inline, same
  // pattern as Login.tsx's friendlyError.
  deleteAccount: (pin: string) => Promise<void>
  submitReport: (
    targetType: 'listing' | 'user' | 'event' | 'status',
    targetId: string,
    reason: ReportReason,
    details?: string,
  ) => Promise<void>
  submitDispute: (conversationId: string, reason: DisputeReason, details?: string) => Promise<void>
  toggleWishlist: (listingId: string) => void
  isWishlisted: (listingId: string) => boolean
  makeOffer: (listingId: string, amount: number, message?: string) => Promise<void>
  publishListing: (input: NewListingInput) => Promise<Listing>
  publishEvent: (input: NewEventInput) => Promise<DealeoneEvent>
  // Organizer-only cancel (or reactivate) — backs MyEvents.tsx's "Cancel event" action, same
  // "no dead ends" convention as updateListingStatus below.
  updateEventStatus: (eventId: string, status: EventStatus) => Promise<DealeoneEvent>
  // Toggles the current user's "interested/going" RSVP on an event — see EventDetail.tsx.
  toggleEventInterest: (eventId: string) => Promise<{ interested: boolean; interestedCount: number }>
  ensureEventConversation: (eventId: string) => Promise<string>
  // Monetization: renewListing pays the recurring monthly listing fee (NLe 30, keeps the
  // listing visible to buyers); boostListing/featureListing are the two weekly paid
  // promotions (NLe 100 each — "Boosted" map/sort priority vs. a "Featured" card badge).
  // All three are simulated charges (no real payment gateway yet) that always succeed —
  // see apps/api/src/lib/billing.ts.
  renewListing: (listingId: string) => Promise<Listing>
  boostListing: (listingId: string) => Promise<Listing>
  featureListing: (listingId: string) => Promise<Listing>
  // "Top Search Placement" (pin within category) and the Explore banner ad — the other two
  // NLe 100/wk promotions that were only ever a suggestion until this round. Same
  // simulated-charge/paid-through-date pattern as boost/feature above.
  pinListingCategory: (listingId: string) => Promise<Listing>
  bannerListing: (listingId: string) => Promise<Listing>
  // Wires up the previously-orphaned PATCH /api/listings/:id/status endpoint (it existed
  // with zero frontend callers) — backs MyListings.tsx's real "Mark as Sold"/"Remove
  // listing" actions.
  updateListingStatus: (listingId: string, status: ListingStatus) => Promise<Listing>
  // Post-transaction rating — only valid once a listing is 'sold' and the rater's offer on
  // it was accepted (enforced server-side, see routes/ratings.ts). Used by ChatThread.tsx's
  // "Rate your seller" prompt.
  submitRating: (listingId: string, stars: number, comment?: string) => Promise<void>
  // Real business-account toggle (account/Settings.tsx) — before this round isBusiness was
  // seed-data only. Gates the banner ad and buyer-request priority-access purchases below.
  updateBusinessProfile: (input: { isBusiness: boolean; businessName?: string }) => Promise<void>
  // "Verified-seller fast-track" and "Buyer-Request priority access" (both NLe 100/wk,
  // account-scoped rather than listing-scoped) — see account/Verification.tsx and
  // account/BuyerRequestsFeed.tsx.
  purchaseVerificationPriority: () => Promise<void>
  purchaseBuyerRequestPriority: () => Promise<void>
  sendMessage: (conversationId: string, text: string) => Promise<void>
  sendVoiceMessage: (conversationId: string, audioUrl: string, audioDurationSec: number) => Promise<void>
  appendSimulatedReply: (conversationId: string, senderId: string, text: string) => void
  markConversationRead: (conversationId: string) => void
  conversationForListing: (listingId: string) => Conversation | undefined
  ensureConversation: (listingId: string) => Promise<string>
  addBuyerRequest: (req: {
    product: string
    maxOffer: number
    radiusKm: number
    condition: 'new' | 'used' | 'either'
  }) => Promise<void>
  loadThread: (conversationId: string) => Promise<void>
  refreshListings: () => Promise<void>
  refreshEvents: () => Promise<void>
  refreshStatuses: () => Promise<void>
  // Real server-side eligibility enforcement (see isEligibleForStatus) — this just posts the
  // photo/caption; a 403 (ineligible) throws and StatusComposer.tsx surfaces it.
  postStatus: (imageUrl: string, caption?: string) => Promise<void>
  // Owner-only early removal — StatusViewer.tsx's delete action.
  deleteStatus: (statusId: string) => Promise<void>
  // Marks one status as seen by the current viewer — called once per slide from
  // StatusViewer.tsx as it auto-advances.
  viewStatus: (statusId: string) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [events, setEvents] = useState<DealeoneEvent[]>([])
  const [sellersById, setSellersById] = useState<Record<string, Seller>>({})
  const [wishlist, setWishlist] = useState<string[]>([])
  const [offers, setOffers] = useState<Offer[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [buyerRequests, setBuyerRequests] = useState<BuyerRequest[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [disputes, setDisputes] = useState<Dispute[]>([])
  const [ratedListingIds, setRatedListingIds] = useState<string[]>([])
  const [statusGroups, setStatusGroups] = useState<StatusGroup[]>([])
  const [canPostStatus, setCanPostStatus] = useState(false)
  const userLocation = useLiveLocation()

  const mergeSellers = useCallback((incoming: Seller[]) => {
    setSellersById((prev) => {
      const next = { ...prev }
      for (const s of incoming) next[s.id] = s
      return next
    })
  }, [])

  const refreshListings = useCallback(async () => {
    const res = await api.get<{ results: { listing: any; distanceKm: number; seller: any }[] }>(
      '/api/listings?radiusKm=25000&status=active',
    )
    setListings(res.results.map((r) => mapListing(r.listing)))
    mergeSellers(res.results.map((r) => mapSeller(r.seller)))
  }, [mergeSellers])

  // Events — fetched the same way listings are: a wide radius, `when=all` so both upcoming
  // and past events are already in client state for Events.tsx's tabs/filters to slice
  // without another round trip (mirrors the listings-fetched-once-filtered-client-side
  // pattern used throughout this app).
  const refreshEvents = useCallback(async () => {
    const res = await api.get<{
      results: { event: any; distanceKm: number; organizer: any; interestedCount: number; isInterested: boolean }[]
    }>('/api/events?radiusKm=25000&when=all&status=active')
    setEvents(res.results.map((r) => mapEvent({ ...r.event, interestedCount: r.interestedCount, isInterested: r.isInterested })))
    mergeSellers(res.results.map((r) => mapSeller(r.organizer)))
  }, [mergeSellers])

  // Statuses — see routes/statuses.ts's GET / for the grouping/ordering this trusts as-is
  // rather than re-deriving client-side. `posters` comes back in the same shape mapSeller
  // expects (see POSTER_COLS), so every poster is merged into the shared sellers map here —
  // a business account with no active listings of its own otherwise has no seller record for
  // StatusRow/StatusViewer to render a name/avatar/verification badge from.
  const refreshStatuses = useCallback(async () => {
    const res = await api.get<{
      canPost: boolean
      groups: { userId: string; allViewed: boolean; statuses: any[] }[]
      posters: any[]
    }>('/api/statuses')
    setCanPostStatus(res.canPost)
    setStatusGroups(
      res.groups.map((g) => ({
        userId: g.userId,
        allViewed: g.allViewed,
        statuses: g.statuses.map(mapStatusItem),
      })),
    )
    mergeSellers(res.posters.map(mapSeller))
  }, [mergeSellers])

  const refreshConversations = useCallback(async () => {
    const res = await api.get<{
      conversations: {
        conversation: any
        seller: any
        lastMessage: any
        unreadCount: number
      }[]
    }>('/api/conversations')
    mergeSellers(res.conversations.map((c) => mapSeller(c.seller)))
    setConversations((prev) =>
      res.conversations.map((c) => {
        const existing = prev.find((p) => p.id === c.conversation.id)
        return {
          id: c.conversation.id,
          listingId: c.conversation.listingId ?? undefined,
          eventId: c.conversation.eventId ?? undefined,
          sellerId: c.conversation.sellerId,
          lastMessageAt: c.conversation.lastMessageAt,
          unreadCount: c.unreadCount,
          messages: existing?.messages ?? (c.lastMessage ? [mapMessage(c.lastMessage)] : []),
        }
      }),
    )
  }, [mergeSellers])

  // Loads everything the app needs and flips the app "on" — called once we know who's
  // signed in AND their profile is complete. Deliberately NOT called for a brand-new user
  // straight out of signup: setting currentUser here is what makes App.tsx swap away
  // from the Login screen, and a new user still needs the name-collection step first (see
  // signup/completeProfile below) — calling this too early would skip that step.
  const activateSession = useCallback(
    async (rawUser: any) => {
      setCurrentUser(mapCurrentUser(rawUser))
      // the signed-in user is also a potential seller (spec §3 — no buyer/seller
      // split) — make sure their own listings can resolve a seller record too.
      mergeSellers([mapSeller(rawUser)])

      const [
        listingsRes,
        eventsRes,
        wishlistRes,
        offersRes,
        buyerReqRes,
        reportsRes,
        disputesRes,
        ratingsRes,
        statusesRes,
      ] = await Promise.all([
        api.get<{ results: { listing: any; seller: any }[] }>(
          '/api/listings?radiusKm=25000&status=active',
        ),
        api.get<{
          results: { event: any; organizer: any; interestedCount: number; isInterested: boolean }[]
        }>('/api/events?radiusKm=25000&when=all&status=active'),
        api.get<{ wishlist: { listing: any }[] }>('/api/wishlist'),
        api.get<{ offers: { offer: any }[] }>('/api/offers'),
        api.get<{ buyerRequests: any[] }>('/api/buyer-requests'),
        api.get<{ reports: any[] }>('/api/reports/mine'),
        api.get<{ disputes: { dispute: any }[] }>('/api/disputes/mine'),
        api.get<{ listingIds: string[] }>('/api/ratings/mine'),
        api.get<{
          canPost: boolean
          groups: { userId: string; allViewed: boolean; statuses: any[] }[]
          posters: any[]
        }>('/api/statuses'),
      ])

      setListings(listingsRes.results.map((r) => mapListing(r.listing)))
      mergeSellers(listingsRes.results.map((r) => mapSeller(r.seller)))
      setEvents(
        eventsRes.results.map((r) => mapEvent({ ...r.event, interestedCount: r.interestedCount, isInterested: r.isInterested })),
      )
      mergeSellers(eventsRes.results.map((r) => mapSeller(r.organizer)))
      setWishlist(wishlistRes.wishlist.map((w) => w.listing.id))
      setOffers(offersRes.offers.map((o) => mapOffer(o.offer)))
      setBuyerRequests(buyerReqRes.buyerRequests.map(mapBuyerRequest))
      setReports(reportsRes.reports.map(mapReport))
      setDisputes(disputesRes.disputes.map((d) => mapDispute(d.dispute)))
      setRatedListingIds(ratingsRes.listingIds)
      setCanPostStatus(statusesRes.canPost)
      setStatusGroups(
        statusesRes.groups.map((g) => ({
          userId: g.userId,
          allViewed: g.allViewed,
          statuses: g.statuses.map(mapStatusItem),
        })),
      )
      mergeSellers(statusesRes.posters.map(mapSeller))

      await refreshConversations()
      setAuthChecked(true)
      setReady(true)
    },
    [mergeSellers, refreshConversations],
  )

  // On launch: if a session token is already stored, validate it against the API. Valid
  // -> load straight into the app. Missing/invalid -> authChecked flips true with no
  // currentUser, and App.tsx shows the login screen (see requestOtp/verifyOtp below).
  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        const token = getSessionToken()
        if (token) {
          try {
            const res = await api.get<{ user: any }>('/api/users/me')
            if (cancelled) return
            await activateSession(res.user)
            return
          } catch {
            clearSessionToken() // stale/invalid/expired — fall through to the login screen
          }
        }
        if (!cancelled) setAuthChecked(true)
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          setError(
            err instanceof Error
              ? `Could not reach the DEALEONE API — ${err.message}`
              : 'Could not reach the DEALEONE API.',
          )
        }
      }
    }

    bootstrap()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Phone + self-chosen PIN — replaces the earlier phone-OTP flow (see Login.tsx and the
  // build log's "colors/borders" round's successor for why: no SMS provider exists to send a
  // real code, so the device just stays signed in via the stored JWT instead of re-verifying
  // every time, matching how WhatsApp and most chat apps behave on a trusted device).
  const checkPhone = useCallback(async (phone: string) => {
    return api.post<{ exists: boolean }>('/api/auth/check', { phone })
  }, [])

  const signup = useCallback(async (phone: string, pin: string) => {
    const res = await api.post<{ token: string; user: any; isNewUser: boolean }>('/api/auth/signup', {
      phone,
      pin,
    })
    // Token is stored right away — a brand-new user still needs an authenticated request
    // (PATCH /api/users/me) to complete their profile in the next step (see completeProfile
    // below), so activateSession is deliberately NOT called yet.
    setSessionToken(res.token)
  }, [])

  const login = useCallback(
    async (phone: string, pin: string) => {
      const res = await api.post<{ token: string; user: any; isNewUser: boolean }>('/api/auth/login', {
        phone,
        pin,
      })
      setSessionToken(res.token)
      await activateSession(res.user)
    },
    [activateSession],
  )

  // Only reached for a brand-new user, right after signup, to collect their name —
  // this is what actually finishes signing them in (see activateSession above).
  const completeProfile = useCallback(
    async (name: string) => {
      const res = await api.patch<{ user: any }>('/api/users/me', { name })
      await activateSession(res.user)
    },
    [activateSession],
  )

  const logout = useCallback(() => {
    clearSessionToken()
    setCurrentUser(null)
    setListings([])
    setEvents([])
    setSellersById({})
    setWishlist([])
    setOffers([])
    setConversations([])
    setBuyerRequests([])
    setReports([])
    setDisputes([])
    setRatedListingIds([])
    setStatusGroups([])
    setCanPostStatus(false)
    setReady(false)
    setAuthChecked(true)
  }, [])

  const deleteAccount = useCallback(
    async (pin: string) => {
      await api.delete('/api/users/me', { pin })
      logout()
    },
    [logout],
  )

  const submitReport = useCallback(
    async (
      targetType: 'listing' | 'user' | 'event' | 'status',
      targetId: string,
      reason: ReportReason,
      details?: string,
    ) => {
      const res = await api.post<{ report: any }>('/api/reports', { targetType, targetId, reason, details })
      setReports((prev) => [mapReport(res.report), ...prev])
    },
    [],
  )

  const submitDispute = useCallback(
    async (conversationId: string, reason: DisputeReason, details?: string) => {
      const res = await api.post<{ dispute: any }>('/api/disputes', { conversationId, reason, details })
      setDisputes((prev) => [mapDispute(res.dispute), ...prev])
    },
    [],
  )

  const toggleWishlist = useCallback((listingId: string) => {
    setWishlist((prev) =>
      prev.includes(listingId) ? prev.filter((id) => id !== listingId) : [...prev, listingId],
    )
    api.post<{ wishlisted: boolean }>('/api/wishlist/toggle', { listingId }).catch((err) => {
      console.error('wishlist toggle failed', err)
      // revert on failure
      setWishlist((prev) =>
        prev.includes(listingId) ? prev.filter((id) => id !== listingId) : [...prev, listingId],
      )
    })
  }, [])

  const isWishlisted = useCallback((listingId: string) => wishlist.includes(listingId), [wishlist])

  const makeOffer = useCallback(
    async (listingId: string, amount: number, message?: string) => {
      const res = await api.post<{ offer: any; conversationId: string }>('/api/offers', {
        listingId,
        amount,
        message,
      })
      setOffers((prev) => [mapOffer(res.offer), ...prev])
      await refreshConversations()
    },
    [refreshConversations],
  )

  const publishListing = useCallback(async (input: NewListingInput) => {
    const res = await api.post<{ listing: any }>('/api/listings', input)
    const listing = mapListing(res.listing)
    setListings((prev) => [listing, ...prev])
    return listing
  }, [])

  const publishEvent = useCallback(async (input: NewEventInput) => {
    const res = await api.post<{ event: any }>('/api/events', input)
    const event = mapEvent(res.event)
    setEvents((prev) => [event, ...prev])
    return event
  }, [])

  // Mirrors patchListing below, but preserves interestedCount/isInterested from whatever was
  // already in state — the status-patch response doesn't recompute those (see
  // routes/events.ts's PATCH /:id/status), so blindly overwriting would reset a real count
  // back to 0 in the UI until the next full refreshEvents.
  const patchEvent = useCallback((updated: DealeoneEvent) => {
    setEvents((prev) =>
      prev.map((e) =>
        e.id === updated.id
          ? { ...updated, interestedCount: e.interestedCount, isInterested: e.isInterested }
          : e,
      ),
    )
  }, [])

  const updateEventStatus = useCallback(
    async (eventId: string, status: EventStatus) => {
      const res = await api.patch<{ event: any }>(`/api/events/${eventId}/status`, { status })
      const event = mapEvent(res.event)
      patchEvent(event)
      return event
    },
    [patchEvent],
  )

  const toggleEventInterest = useCallback(async (eventId: string) => {
    const res = await api.post<{ interested: boolean; interestedCount: number }>(
      `/api/events/${eventId}/interested`,
      {},
    )
    setEvents((prev) =>
      prev.map((e) =>
        e.id === eventId ? { ...e, isInterested: res.interested, interestedCount: res.interestedCount } : e,
      ),
    )
    return res
  }, [])

  // Shared by renew/boost/feature below — all three hit a billing endpoint that returns
  // the updated listing row, and all three need the same "patch it into app-level state if
  // it's there, but don't worry if it's not" behavior (a seller's own expired/older listings
  // often aren't in the main `listings` feed at all, since that only holds the active
  // public feed — MyListings keeps its own separate fetch and patches itself directly).
  const patchListing = useCallback((updated: Listing) => {
    setListings((prev) => (prev.some((l) => l.id === updated.id) ? prev.map((l) => (l.id === updated.id ? updated : l)) : prev))
  }, [])

  const renewListing = useCallback(
    async (listingId: string) => {
      const res = await api.post<{ listing: any }>(`/api/listings/${listingId}/renew`, {})
      const listing = mapListing(res.listing)
      patchListing(listing)
      return listing
    },
    [patchListing],
  )

  const boostListing = useCallback(
    async (listingId: string) => {
      const res = await api.post<{ listing: any }>(`/api/listings/${listingId}/boost`, {})
      const listing = mapListing(res.listing)
      patchListing(listing)
      return listing
    },
    [patchListing],
  )

  const featureListing = useCallback(
    async (listingId: string) => {
      const res = await api.post<{ listing: any }>(`/api/listings/${listingId}/feature`, {})
      const listing = mapListing(res.listing)
      patchListing(listing)
      return listing
    },
    [patchListing],
  )

  const pinListingCategory = useCallback(
    async (listingId: string) => {
      const res = await api.post<{ listing: any }>(`/api/listings/${listingId}/pin-category`, {})
      const listing = mapListing(res.listing)
      patchListing(listing)
      return listing
    },
    [patchListing],
  )

  const bannerListing = useCallback(
    async (listingId: string) => {
      const res = await api.post<{ listing: any }>(`/api/listings/${listingId}/banner-ad`, {})
      const listing = mapListing(res.listing)
      patchListing(listing)
      return listing
    },
    [patchListing],
  )

  const updateListingStatus = useCallback(
    async (listingId: string, status: ListingStatus) => {
      const res = await api.patch<{ listing: any }>(`/api/listings/${listingId}/status`, { status })
      const listing = mapListing(res.listing)
      patchListing(listing)
      return listing
    },
    [patchListing],
  )

  const submitRating = useCallback(async (listingId: string, stars: number, comment?: string) => {
    await api.post('/api/ratings', { listingId, stars, comment })
    setRatedListingIds((prev) => (prev.includes(listingId) ? prev : [...prev, listingId]))
  }, [])

  const updateBusinessProfile = useCallback(
    async (input: { isBusiness: boolean; businessName?: string }) => {
      const res = await api.patch<{ user: any }>('/api/users/me', input)
      setCurrentUser(mapCurrentUser(res.user))
    },
    [],
  )

  const purchaseVerificationPriority = useCallback(async () => {
    const res = await api.post<{ user: any }>('/api/verification-requests/priority', {})
    setCurrentUser(mapCurrentUser(res.user))
  }, [])

  const purchaseBuyerRequestPriority = useCallback(async () => {
    const res = await api.post<{ user: any }>('/api/buyer-requests/priority-access', {})
    setCurrentUser(mapCurrentUser(res.user))
  }, [])

  const ensureConversation = useCallback(async (listingId: string) => {
    const res = await api.post<{ conversation: any }>('/api/conversations/ensure', { listingId })
    setConversations((prev) => {
      if (prev.find((c) => c.id === res.conversation.id)) return prev
      return [
        {
          id: res.conversation.id,
          listingId: res.conversation.listingId ?? undefined,
          eventId: res.conversation.eventId ?? undefined,
          sellerId: res.conversation.sellerId,
          lastMessageAt: res.conversation.lastMessageAt,
          unreadCount: 0,
          messages: [],
        },
        ...prev,
      ]
    })
    return res.conversation.id as string
  }, [])

  // Get-or-create a conversation with an event's organizer ("Message organizer" — see
  // EventDetail.tsx) — mirrors ensureConversation above, just keyed by eventId.
  const ensureEventConversation = useCallback(async (eventId: string) => {
    const res = await api.post<{ conversation: any }>('/api/conversations/ensure', { eventId })
    setConversations((prev) => {
      if (prev.find((c) => c.id === res.conversation.id)) return prev
      return [
        {
          id: res.conversation.id,
          listingId: res.conversation.listingId ?? undefined,
          eventId: res.conversation.eventId ?? undefined,
          sellerId: res.conversation.sellerId,
          lastMessageAt: res.conversation.lastMessageAt,
          unreadCount: 0,
          messages: [],
        },
        ...prev,
      ]
    })
    return res.conversation.id as string
  }, [])

  const sendMessage = useCallback(async (conversationId: string, text: string) => {
    const res = await api.post<{ message: any }>(`/api/conversations/${conversationId}/messages`, {
      text,
    })
    const msg = mapMessage(res.message)
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? { ...c, messages: [...c.messages, msg], lastMessageAt: msg.createdAt }
          : c,
      ),
    )
  }, [])

  // Voice notes — accessibility feature so buyers/sellers who can't read or write can still
  // message: record in the browser (see ChatThread.tsx's MediaRecorder use), send the clip
  // as a base64 data URL. Mirrors sendMessage above, just a different payload shape.
  const sendVoiceMessage = useCallback(async (conversationId: string, audioUrl: string, audioDurationSec: number) => {
    const res = await api.post<{ message: any }>(`/api/conversations/${conversationId}/messages`, {
      type: 'voice',
      audioUrl,
      audioDurationSec,
    })
    const msg = mapMessage(res.message)
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? { ...c, messages: [...c.messages, msg], lastMessageAt: msg.createdAt }
          : c,
      ),
    )
  }, [])

  // Local-only simulated seller reply for demo liveliness — not persisted to the API,
  // since we don't have real seller-side sessions to send it as. See ChatThread.tsx.
  const appendSimulatedReply = useCallback((conversationId: string, senderId: string, text: string) => {
    const msg: ChatMessage = {
      id: `local-${Date.now()}`,
      conversationId,
      senderId,
      type: 'text',
      text,
      createdAt: new Date().toISOString(),
      read: true,
    }
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? { ...c, messages: [...c.messages, msg], lastMessageAt: msg.createdAt }
          : c,
      ),
    )
  }, [])

  const markConversationRead = useCallback((conversationId: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)),
    )
    api.patch(`/api/conversations/${conversationId}/read`).catch((err) => {
      console.error('mark read failed', err)
    })
  }, [])

  const conversationForListing = useCallback(
    (listingId: string) => conversations.find((c) => c.listingId === listingId),
    [conversations],
  )

  const loadThread = useCallback(async (conversationId: string) => {
    const res = await api.get<{ messages: any[]; seller: any }>(
      `/api/conversations/${conversationId}`,
    )
    mergeSellers([mapSeller(res.seller)])
    const msgs = res.messages.map(mapMessage)
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, messages: msgs } : c)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addBuyerRequest = useCallback(
    async (req: { product: string; maxOffer: number; radiusKm: number; condition: 'new' | 'used' | 'either' }) => {
      const res = await api.post<{ buyerRequest: any }>('/api/buyer-requests', req)
      setBuyerRequests((prev) => [mapBuyerRequest(res.buyerRequest), ...prev])
    },
    [],
  )

  // POST /api/statuses re-checks isEligibleForStatus for real and throws (403) if the
  // account no longer qualifies — canPostStatus above is only ever a UI hint, never trusted
  // here. On success, prepend into the current user's own group (or create it) so the
  // Status row updates immediately rather than waiting on the next refreshStatuses.
  const postStatus = useCallback(
    async (imageUrl: string, caption?: string) => {
      const res = await api.post<{ status: any }>('/api/statuses', { imageUrl, caption })
      const created = mapStatusItem(res.status)
      setStatusGroups((prev) => {
        const idx = prev.findIndex((g) => g.userId === created.userId)
        if (idx === -1) {
          return [{ userId: created.userId, allViewed: false, statuses: [created] }, ...prev]
        }
        const next = [...prev]
        next[idx] = { ...next[idx], allViewed: false, statuses: [...next[idx].statuses, created] }
        return next
      })
    },
    [],
  )

  const deleteStatus = useCallback(async (statusId: string) => {
    await api.delete(`/api/statuses/${statusId}`)
    setStatusGroups((prev) =>
      prev
        .map((g) => ({ ...g, statuses: g.statuses.filter((s) => s.id !== statusId) }))
        .filter((g) => g.statuses.length > 0),
    )
  }, [])

  // Fire-and-forget, mirroring markConversationRead below — StatusViewer.tsx calls this once
  // per slide as it auto-advances and doesn't need to await it.
  const viewStatus = useCallback((statusId: string) => {
    setStatusGroups((prev) =>
      prev.map((g) => ({
        ...g,
        allViewed: g.allViewed || g.statuses.every((s) => s.id === statusId || s.viewedByMe),
        statuses: g.statuses.map((s) => (s.id === statusId ? { ...s, viewedByMe: true } : s)),
      })),
    )
    api.post(`/api/statuses/${statusId}/view`).catch((err) => {
      console.error('mark status viewed failed', err)
    })
  }, [])

  const sellers = useMemo(() => Object.values(sellersById), [sellersById])

  const value: AppContextValue = {
    ready,
    authChecked,
    error,
    listings,
    events,
    sellers,
    buyerRequests,
    currentUser,
    wishlist,
    offers,
    conversations,
    reports,
    disputes,
    ratedListingIds,
    statusGroups,
    canPostStatus,
    userLocation,
    checkPhone,
    signup,
    login,
    completeProfile,
    logout,
    deleteAccount,
    submitReport,
    submitDispute,
    toggleWishlist,
    isWishlisted,
    makeOffer,
    publishListing,
    publishEvent,
    updateEventStatus,
    toggleEventInterest,
    ensureEventConversation,
    renewListing,
    boostListing,
    featureListing,
    pinListingCategory,
    bannerListing,
    updateListingStatus,
    submitRating,
    updateBusinessProfile,
    purchaseVerificationPriority,
    purchaseBuyerRequestPriority,
    sendMessage,
    sendVoiceMessage,
    appendSimulatedReply,
    markConversationRead,
    conversationForListing,
    ensureConversation,
    addBuyerRequest,
    loadThread,
    refreshListings,
    refreshEvents,
    refreshStatuses,
    postStatus,
    deleteStatus,
    viewStatus,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
