import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  AppNotification,
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
import { distanceKm } from '../lib/geo'
import { connectLive } from '../lib/live'
import { clearStoredReferralCode, getStoredReferralCode } from '../lib/referral'
import { useToast } from '../components/Toast'
import { api, ApiError, clearSessionToken, errorMessage, getSessionToken, isNetworkError, setSessionToken } from '../lib/api'
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
  // Optional spoken description recorded in the Sell flow (data:audio/… URL).
  voiceNote?: string
}

// Fields a seller can change on a listing after publishing (see EditListing.tsx).
export interface EditListingInput {
  title?: string
  description?: string
  price?: number
  negotiable?: boolean
  condition?: Listing['condition']
  quantity?: number
  category?: Listing['category']
  images?: string[]
  voiceNote?: string | null
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
  // True when a stored session belongs to someone who signed up but never entered a name —
  // Login.tsx resumes at its name step instead of the phone step.
  needsProfile: boolean
  // Look up a listing/event by id, including ones that are no longer in the public feed
  // (sold, reserved, expired, cancelled, past). Chats, offers and detail pages that point
  // at such items used to show "not found" because `listings`/`events` only hold the live
  // public feed. getX is synchronous; loadX fetches it in the background if it's missing.
  getListing: (id: string | undefined) => Listing | undefined
  loadListing: (id: string) => Promise<void>
  getEvent: (id: string | undefined) => DealeoneEvent | undefined
  loadEvent: (id: string) => Promise<void>
  checkPhone: (phone: string) => Promise<{ exists: boolean }>
  signup: (phone: string, pin: string, referralCode?: string) => Promise<void>
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
  // useCredit spends a free boost week earned from referrals instead of paying.
  boostListing: (listingId: string, useCredit?: boolean) => Promise<Listing>
  // Seller edits a published listing; a price cut alerts everyone who saved it.
  editListing: (listingId: string, input: EditListingInput) => Promise<Listing>
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
  // Change the display name (account/Settings.tsx) — there was previously no way to fix a
  // typo'd name after signup.
  updateName: (name: string) => Promise<void>
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
  // Paged feed: the nearest FEED_PAGE listings load at sign-in; more load as people scroll.
  // Low-data mode (Settings): photos aren't downloaded until tapped. Defaults on when the
  // phone's own "Data Saver" is on or the connection is 2G.
  lowData: boolean
  setLowData: (on: boolean) => void
  // True while the device has no connection — the app keeps working from its saved copy.
  offline: boolean
  // The bell (see pages/Notifications.tsx) — kept current in real time via the live stream.
  notifications: AppNotification[]
  unreadNotifications: number
  markAllNotificationsRead: () => void
  markNotificationRead: (id: string) => void
  // ChatThread tells the app which conversation is on screen, so a message arriving live
  // there isn't counted as unread (and doesn't pop a toast).
  setActiveConversation: (id: string | null) => void
  listingsHasMore: boolean
  listingsLoadingMore: boolean
  loadMoreListings: () => Promise<void>
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

const FEED_PAGE = 40

function mapNotification(n: any): AppNotification {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body ?? '',
    url: n.url ?? undefined,
    read: !!n.read,
    createdAt: typeof n.createdAt === 'string' ? n.createdAt : new Date(n.createdAt).toISOString(),
  }
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
  const [needsProfile, setNeedsProfile] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const activeConversationRef = useRef<string | null>(null)
  const toast = useToast()
  const [extraListings, setExtraListings] = useState<Record<string, Listing>>({})
  const [extraEvents, setExtraEvents] = useState<Record<string, DealeoneEvent>>({})
  const requestedIds = useRef(new Set<string>())
  const [statusGroups, setStatusGroups] = useState<StatusGroup[]>([])
  const [canPostStatus, setCanPostStatus] = useState(false)
  const userLocation = useLiveLocation()
  // Latest position without making every fetch callback depend on (and re-create for) each
  // GPS update.
  const locationRef = useRef(userLocation)
  locationRef.current = userLocation
  const [lowData, setLowDataState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('dealeone.lowData')
      if (saved != null) return saved === '1'
    } catch {
      // storage unavailable — fall through to the connection hint
    }
    const conn = (navigator as any).connection
    return !!conn && (conn.saveData === true || /(^|-)2g$/.test(conn.effectiveType ?? ''))
  })
  const setLowData = useCallback((on: boolean) => {
    setLowDataState(on)
    try {
      localStorage.setItem('dealeone.lowData', on ? '1' : '0')
    } catch {
      // not persisted — still applies for this session
    }
  }, [])
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false)
  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  const [listingsHasMore, setListingsHasMore] = useState(false)
  const [listingsLoadingMore, setListingsLoadingMore] = useState(false)
  // Where the current feed's first page was centred.
  const feedCenterRef = useRef<{ lat: number; lng: number } | null>(null)
  const fetchListingsPage = useCallback(async (offset: number) => {
    const { lat, lng } = locationRef.current
    if (offset === 0) feedCenterRef.current = { lat, lng }
    return api.get<{ results: { listing: any; distanceKm: number; seller: any }[]; hasMore?: boolean }>(
      `/api/listings?radiusKm=25000&status=active&lat=${lat}&lng=${lng}&limit=${FEED_PAGE}&offset=${offset}`,
    )
  }, [])

  const mergeSellers = useCallback((incoming: Seller[]) => {
    setSellersById((prev) => {
      const next = { ...prev }
      for (const s of incoming) next[s.id] = s
      return next
    })
  }, [])

  const refreshListings = useCallback(async () => {
    const res = await fetchListingsPage(0)
    setListings(res.results.map((r) => mapListing(r.listing)))
    setListingsHasMore(!!res.hasMore)
    mergeSellers(res.results.map((r) => mapSeller(r.seller)))
  }, [mergeSellers, fetchListingsPage])

  const loadMoreListings = useCallback(async () => {
    if (listingsLoadingMore || !listingsHasMore) return
    setListingsLoadingMore(true)
    try {
      const res = await fetchListingsPage(listings.length)
      mergeSellers(res.results.map((r) => mapSeller(r.seller)))
      setListings((prev) => {
        const seen = new Set(prev.map((l) => l.id))
        return [...prev, ...res.results.map((r) => mapListing(r.listing)).filter((l) => !seen.has(l.id))]
      })
      setListingsHasMore(!!res.hasMore)
    } finally {
      setListingsLoadingMore(false)
    }
  }, [listingsLoadingMore, listingsHasMore, listings.length, fetchListingsPage, mergeSellers])

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
        role?: 'buyer' | 'seller'
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
          role: c.role ?? 'buyer',
          otherPartyId: c.seller?.id ?? c.conversation.sellerId,
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
      // the signed-in user is also a potential seller (spec §3 — no buyer/seller
      // split) — make sure their own listings can resolve a seller record too.
      mergeSellers([mapSeller(rawUser)])

      // Listings are essential (the home map is empty without them) — if that one fails
      // the whole sign-in fails with a readable error the caller can show and retry.
      // Everything else loads with allSettled: one slow or failing secondary endpoint
      // (statuses, reports…) used to leave the app stuck forever on "Setting things up…".
      const listingsRes = await fetchListingsPage(0)
      const [eventsR, wishlistR, offersR, buyerReqR, reportsR, disputesR, ratingsR, statusesR, , notificationsR] =
        await Promise.allSettled([
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
          refreshConversations(),
          api.get<{ notifications: any[]; unreadCount: number }>('/api/notifications'),
        ])
      const ok = <T,>(r: PromiseSettledResult<T>): T | null => {
        if (r.status === 'fulfilled') return r.value
        console.error('startup load failed', r.reason)
        return null
      }

      setListings(listingsRes.results.map((r) => mapListing(r.listing)))
      setListingsHasMore(!!listingsRes.hasMore)
      mergeSellers(listingsRes.results.map((r) => mapSeller(r.seller)))
      const eventsRes = ok(eventsR)
      if (eventsRes) {
        setEvents(
          eventsRes.results.map((r) => mapEvent({ ...r.event, interestedCount: r.interestedCount, isInterested: r.isInterested })),
        )
        mergeSellers(eventsRes.results.map((r) => mapSeller(r.organizer)))
      }
      const wishlistRes = ok(wishlistR)
      if (wishlistRes) setWishlist(wishlistRes.wishlist.map((w) => w.listing.id))
      const offersRes = ok(offersR)
      if (offersRes) setOffers(offersRes.offers.map((o) => mapOffer(o.offer)))
      const buyerReqRes = ok(buyerReqR)
      if (buyerReqRes) setBuyerRequests(buyerReqRes.buyerRequests.map(mapBuyerRequest))
      const reportsRes = ok(reportsR)
      if (reportsRes) setReports(reportsRes.reports.map(mapReport))
      const disputesRes = ok(disputesR)
      if (disputesRes) setDisputes(disputesRes.disputes.map((d) => mapDispute(d.dispute)))
      const ratingsRes = ok(ratingsR)
      if (ratingsRes) setRatedListingIds(ratingsRes.listingIds)
      const statusesRes = ok(statusesR)
      if (statusesRes) {
        setCanPostStatus(statusesRes.canPost)
        setStatusGroups(
          statusesRes.groups.map((g) => ({
            userId: g.userId,
            allViewed: g.allViewed,
            statuses: g.statuses.map(mapStatusItem),
          })),
        )
        mergeSellers(statusesRes.posters.map(mapSeller))
      }

      const notificationsRes = ok(notificationsR)
      if (notificationsRes) {
        setNotifications(notificationsRes.notifications.map(mapNotification))
        setUnreadNotifications(notificationsRes.unreadCount)
      }

      // Remembered so the app can still open (from its saved copy) with no connection.
      try {
        localStorage.setItem('dealeone.lastUser', JSON.stringify(rawUser))
      } catch {
        // not critical
      }
      // Set last: this is what swaps App.tsx from the login screen into the app, so it
      // only happens once there's actually something to show.
      setCurrentUser(mapCurrentUser(rawUser))
      setNeedsProfile(false)
      setAuthChecked(true)
      setReady(true)
    },
    [mergeSellers, refreshConversations, fetchListingsPage],
  )

  // When GPS first locks on somewhere well away from where the feed was loaded (the feed
  // loads around a default spot until then), reload it around the real position so
  // "nearest first" is actually nearest to the person.
  useEffect(() => {
    if (!ready || userLocation.status !== 'live') return
    const c = feedCenterRef.current
    if (c && distanceKm(c.lat, c.lng, userLocation.lat, userLocation.lng) < 3) return
    refreshListings().catch((err) => console.error('reload feed near GPS failed', err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userLocation.status, userLocation.lat, userLocation.lng])

  // On launch: if a session token is already stored, validate it against the API. Valid
  // -> load straight into the app. Missing/invalid -> authChecked flips true with no
  // currentUser, and App.tsx shows the login screen (see requestOtp/verifyOtp below).
  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      const token = getSessionToken()
      if (!token) {
        if (!cancelled) setAuthChecked(true)
        return
      }
      try {
        const res = await api.get<{ user: any }>('/api/users/me')
        if (cancelled) return
        // Signed up but closed the app before entering a name: resume at the name step
        // instead of dropping them into the app as "New User" forever.
        if (!res.user?.name || res.user.name === 'New User') {
          setNeedsProfile(true)
          setAuthChecked(true)
          return
        }
        await activateSession(res.user)
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          // Expired/invalid token, suspended or deleted account → back to the login screen.
          clearSessionToken()
          setAuthChecked(true)
          return
        }
        // Offline, or the API is down/waking up: keep the session (being offline used to
        // sign people out). If this phone has opened the app before, open it from the saved
        // copy (listings/events come from the service-worker cache); otherwise show retry.
        console.error(err)
        let cached: any = null
        try {
          cached = JSON.parse(localStorage.getItem('dealeone.lastUser') ?? 'null')
        } catch {
          cached = null
        }
        if (cached && isNetworkError(err)) {
          try {
            await activateSession(cached)
            setOffline(true)
            return
          } catch {
            // no saved feed either — fall through to the retry screen
          }
        }
        setError(errorMessage(err, "Can't reach DEALEONE right now."))
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

  const signup = useCallback(async (phone: string, pin: string, referralCode?: string) => {
    const code = (referralCode ?? getStoredReferralCode() ?? '').trim().toUpperCase()
    const res = await api.post<{ token: string; user: any; isNewUser: boolean }>('/api/auth/signup', {
      phone,
      pin,
      ...(code ? { referralCode: code } : {}),
    })
    clearStoredReferralCode()
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
    try {
      localStorage.removeItem('dealeone.lastUser')
    } catch {
      // ignore
    }
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
    setExtraListings({})
    setExtraEvents({})
    requestedIds.current.clear()
    setNeedsProfile(false)
    setNotifications([])
    setUnreadNotifications(0)
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
  // Keeps the public events feed in step with a status change: a reactivated event reappears
  // (it used to stay missing until a full reload), a cancelled one drops out.
  const patchEvent = useCallback((updated: DealeoneEvent) => {
    setEvents((prev) => {
      const existing = prev.find((e) => e.id === updated.id)
      if (updated.status !== 'active') return prev.filter((e) => e.id !== updated.id)
      if (!existing) return [updated, ...prev]
      return prev.map((e) =>
        e.id === updated.id ? { ...updated, interestedCount: e.interestedCount, isInterested: e.isInterested } : e,
      )
    })
    setExtraEvents((prev) => (prev[updated.id] ? { ...prev, [updated.id]: { ...prev[updated.id], ...updated } } : prev))
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
  // Same idea for listings: renewing an expired listing puts it back on the map right away;
  // marking one sold/removed takes it off.
  const patchListing = useCallback((updated: Listing) => {
    setListings((prev) => {
      const present = prev.some((l) => l.id === updated.id)
      if (updated.status !== 'active') return present ? prev.filter((l) => l.id !== updated.id) : prev
      return present ? prev.map((l) => (l.id === updated.id ? updated : l)) : [updated, ...prev]
    })
    setExtraListings((prev) => (prev[updated.id] ? { ...prev, [updated.id]: updated } : prev))
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
    async (listingId: string, useCredit = false) => {
      const res = await api.post<{ listing: any }>(`/api/listings/${listingId}/boost`, useCredit ? { useCredit: true } : {})
      const listing = mapListing(res.listing)
      patchListing(listing)
      return listing
    },
    [patchListing],
  )

  const editListing = useCallback(
    async (listingId: string, input: EditListingInput) => {
      const res = await api.patch<{ listing: any }>(`/api/listings/${listingId}`, input)
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

  const updateName = useCallback(
    async (name: string) => {
      const res = await api.patch<{ user: any }>('/api/users/me', { name })
      setCurrentUser(mapCurrentUser(res.user))
      mergeSellers([mapSeller(res.user)])
    },
    [mergeSellers],
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
          role: 'buyer' as const,
          otherPartyId: res.conversation.sellerId,
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
          role: 'buyer' as const,
          otherPartyId: res.conversation.sellerId,
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
        // The live stream may already have delivered this exact message — don't add it twice.
        c.id === conversationId && !c.messages.some((m) => m.id === msg.id)
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
        // The live stream may already have delivered this exact message — don't add it twice.
        c.id === conversationId && !c.messages.some((m) => m.id === msg.id)
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
        // The live stream may already have delivered this exact message — don't add it twice.
        c.id === conversationId && !c.messages.some((m) => m.id === msg.id)
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

  // Loads a thread's messages. Upserts the conversation too, so a thread that isn't in
  // local state yet (opened from a deep link, or one just created by responding to a buyer
  // request) renders instead of showing "Conversation not found".
  const loadThread = useCallback(async (conversationId: string) => {
    const res = await api.get<{ conversation: any; messages: any[]; seller: any; role?: 'buyer' | 'seller' }>(
      `/api/conversations/${conversationId}`,
    )
    if (res.seller) mergeSellers([mapSeller(res.seller)])
    const msgs = res.messages.map(mapMessage)
    setConversations((prev) => {
      if (prev.some((c) => c.id === conversationId)) {
        return prev.map((c) => (c.id === conversationId ? { ...c, messages: msgs } : c))
      }
      const c = res.conversation
      return [
        {
          id: c.id,
          listingId: c.listingId ?? undefined,
          eventId: c.eventId ?? undefined,
          sellerId: c.sellerId,
          role: res.role ?? 'buyer',
          otherPartyId: res.seller?.id ?? c.sellerId,
          lastMessageAt: c.lastMessageAt,
          unreadCount: 0,
          messages: msgs,
        },
        ...prev,
      ]
    })
  }, [mergeSellers])

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

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadNotifications(0)
    api.post('/api/notifications/read-all').catch((err) => console.error('mark all read failed', err))
  }, [])
  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) => {
      const target = prev.find((n) => n.id === id)
      if (target && !target.read) setUnreadNotifications((c) => Math.max(0, c - 1))
      return prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    })
    api.patch(`/api/notifications/${id}/read`).catch((err) => console.error('mark read failed', err))
  }, [])
  const setActiveConversation = useCallback((id: string | null) => {
    activeConversationRef.current = id
  }, [])

  // Real-time updates while signed in (see lib/live.ts): chat messages from the other
  // person appear immediately, the Messages badge and the bell update without a refresh.
  const conversationsRef = useRef(conversations)
  conversationsRef.current = conversations
  const sellersRef = useRef(sellersById)
  sellersRef.current = sellersById
  useEffect(() => {
    if (!ready || !currentUser) return
    const me = currentUser.id
    return connectLive(
      (e) => {
        if (e.type === 'message') {
          const msg = mapMessage(e.message)
          const known = conversationsRef.current.some((c) => c.id === e.conversationId)
          if (!known) {
            refreshConversations().catch(() => {})
          } else {
            const viewing = activeConversationRef.current === e.conversationId
            setConversations((prev) => {
              const updated = prev.map((c) => {
                if (c.id !== e.conversationId || c.messages.some((m) => m.id === msg.id)) return c
                return {
                  ...c,
                  messages: [...c.messages, msg],
                  lastMessageAt: msg.createdAt,
                  unreadCount: msg.senderId !== me && !viewing ? c.unreadCount + 1 : c.unreadCount,
                }
              })
              // Newest conversation first, like every messaging app.
              return [...updated].sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1))
            })
            if (viewing && msg.senderId !== me) {
              api.patch(`/api/conversations/${e.conversationId}/read`).catch(() => {})
            }
          }
          if (msg.senderId !== me && activeConversationRef.current !== e.conversationId && (msg.type === 'text' || msg.type === 'voice')) {
            // Offers/counters/system notes already arrive as their own notification toast.
            const convo = conversationsRef.current.find((c) => c.id === e.conversationId)
            const from = convo ? sellersRef.current[convo.otherPartyId]?.name : undefined
            toast.info(from ? `New message from ${from}` : 'New message')
          }
        } else if (e.type === 'notification') {
          const n = mapNotification(e.notification)
          setNotifications((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev]))
          setUnreadNotifications((c) => c + 1)
          toast.info(n.title)
        }
      },
      () => {
        // Back online after a drop: catch up on anything missed.
        refreshConversations().catch(() => {})
        api
          .get<{ notifications: any[]; unreadCount: number }>('/api/notifications')
          .then((r) => {
            setNotifications(r.notifications.map(mapNotification))
            setUnreadNotifications(r.unreadCount)
          })
          .catch(() => {})
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, currentUser?.id])

  const getListing = useCallback(
    (id: string | undefined) => (id ? listings.find((l) => l.id === id) ?? extraListings[id] : undefined),
    [listings, extraListings],
  )
  const getEvent = useCallback(
    (id: string | undefined) => (id ? events.find((e) => e.id === id) ?? extraEvents[id] : undefined),
    [events, extraEvents],
  )
  const loadListing = useCallback(
    async (id: string) => {
      const key = `l:${id}`
      if (requestedIds.current.has(key)) return
      requestedIds.current.add(key)
      try {
        const res = await api.get<{ listing: any; seller: any }>(`/api/listings/${id}`)
        mergeSellers([mapSeller(res.seller)])
        setExtraListings((prev) => ({ ...prev, [id]: mapListing(res.listing) }))
      } catch (err) {
        // Genuinely gone (removed/deleted) — callers show their own "no longer available".
        requestedIds.current.delete(key)
        if (!(err instanceof ApiError && err.status === 404)) console.error('load listing failed', err)
      }
    },
    [mergeSellers],
  )
  const loadEvent = useCallback(
    async (id: string) => {
      const key = `e:${id}`
      if (requestedIds.current.has(key)) return
      requestedIds.current.add(key)
      try {
        const res = await api.get<{ event: any; organizer: any; interestedCount: number; isInterested: boolean }>(
          `/api/events/${id}`,
        )
        mergeSellers([mapSeller(res.organizer)])
        setExtraEvents((prev) => ({
          ...prev,
          [id]: mapEvent({ ...res.event, interestedCount: res.interestedCount, isInterested: res.isInterested }),
        }))
      } catch (err) {
        requestedIds.current.delete(key)
        if (!(err instanceof ApiError && err.status === 404)) console.error('load event failed', err)
      }
    },
    [mergeSellers],
  )

  // Every conversation should be able to show what it's about, even once the item is sold
  // or the event has passed.
  useEffect(() => {
    for (const c of conversations) {
      if (c.listingId && !listings.some((l) => l.id === c.listingId) && !extraListings[c.listingId]) loadListing(c.listingId)
      if (c.eventId && !events.some((e) => e.id === c.eventId) && !extraEvents[c.eventId]) loadEvent(c.eventId)
    }
  }, [conversations, listings, events, extraListings, extraEvents, loadListing, loadEvent])

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
    needsProfile,
    getListing,
    loadListing,
    getEvent,
    loadEvent,
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
    editListing,
    featureListing,
    pinListingCategory,
    bannerListing,
    updateListingStatus,
    submitRating,
    updateBusinessProfile,
    updateName,
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
    lowData,
    setLowData,
    offline,
    notifications,
    unreadNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    setActiveConversation,
    listingsHasMore,
    listingsLoadingMore,
    loadMoreListings,
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
