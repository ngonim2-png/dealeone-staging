import 'dotenv/config'
import { db, pool } from './client'
import {
  buyerRequests,
  conversations,
  disputes,
  eventInterests,
  events,
  listingPayments,
  listings,
  messages,
  offers,
  ratings,
  reports,
  statuses,
  statusViews,
  users,
  verificationRequests,
  wishlistEntries,
} from './schema'
import { jitterCoordinate } from '../lib/geo'
import { hashPin } from '../lib/pin'

// Every seeded account (including the admin one) signs in with this same 4-digit PIN — see
// the "phone + PIN" login round in the build log for why there's no OTP any more. One shared
// demo PIN keeps this file simple; a real signup picks its own.
const DEMO_PIN = '1234'
const DEMO_PIN_HASH = hashPin(DEMO_PIN)

// Same Freetown-area demo dataset the frontend prototype used, now seeded into real
// Postgres rows with real foreign keys instead of hard-coded string ids.

// Real, verified Freetown neighborhood coordinates (checked against Wikipedia/Mapcarta/
// latitude.to, Aug 2026) — every previous version of this file placed listings at an
// arbitrary km offset from a single coastal point (Lumley), and several of those offsets
// pointed west/south straight into the Atlantic, which is why pins were showing up over
// the ocean on the Explore map. Anchoring each listing to its seller's real neighborhood
// instead (plus a small ~80-320m jitter via jitterCoordinate, same helper used for the
// buyer-facing privacy fuzz) keeps every pin on land, in the right part of the city.
const NEIGHBORHOODS: Record<string, { lat: number; lng: number }> = {
  Lumley: { lat: 8.4657, lng: -13.2983 },
  'Lumley Beach Rd': { lat: 8.4695, lng: -13.2895 },
  Wilberforce: { lat: 8.467, lng: -13.267 },
  'Congo Cross': { lat: 8.48296, lng: -13.25888 },
  'Hill Station': { lat: 8.4561898, lng: -13.2533702 },
  Kissy: { lat: 8.46863, lng: -13.18931 },
  Brookfields: { lat: 8.48139, lng: -13.24508 },
  'Kenema St': { lat: 8.484, lng: -13.2299 }, // central Freetown/downtown
  Waterloo: { lat: 8.3389, lng: -13.0709 },
}

function near(location: keyof typeof NEIGHBORHOODS, seedKey: string) {
  const anchor = NEIGHBORHOODS[location] ?? NEIGHBORHOODS.Lumley
  return jitterCoordinate(anchor.lat, anchor.lng, seedKey)
}

const now = Date.now()
const daysAgo = (n: number) => new Date(now - n * 86400000)
const daysFromNow = (n: number) => new Date(now + n * 86400000)
const minsAgo = (n: number) => new Date(now - n * 60000)

// Statuses need a real data:image URL (routes/statuses.ts's zod schema requires it, and
// StatusViewer.tsx always renders it in an <img>, unlike listing/event cards which fall back
// to rendering the emoji placeholder as plain text) — a tiny inline SVG stands in for an
// actual photo upload, same MVP tradeoff as everywhere else in this file.
function placeholderStatusImage(emoji: string, bg: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="750"><rect width="100%" height="100%" fill="${bg}"/><text x="50%" y="52%" font-size="220" text-anchor="middle" dominant-baseline="central">${emoji}</text></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

async function main() {
  console.log('Seeding…')

  // wipe in FK-safe order (dev convenience — do NOT run against a prod DB with real data)
  await db.delete(disputes)
  await db.delete(reports)
  // ratings references both listings and users — same FK-ordering trap as listingPayments
  // below, has to go before either of those wipes.
  await db.delete(ratings)
  await db.delete(messages)
  await db.delete(offers)
  await db.delete(wishlistEntries)
  // conversations.eventId references events, so it has to go before the events wipe below
  // (same reason conversations already went before the listings wipe further down).
  await db.delete(conversations)
  await db.delete(buyerRequests)
  // event_interests references events, so it goes before the events wipe; events itself
  // references users, so it has to go before the users wipe too.
  await db.delete(eventInterests)
  await db.delete(events)
  // listing_payments (the monetization billing ledger — see lib/billing.ts) references
  // listings, so it has to go before the listings wipe or Postgres blocks the delete with a
  // foreign-key violation — hit this exact error while testing this round, the first time a
  // real renew/boost/feature charge had ever been logged before a reseed.
  await db.delete(listingPayments)
  // verification_requests references users, so it goes before the users wipe.
  await db.delete(verificationRequests)
  // status_views references statuses (cascade would handle this alone, but wiped explicitly
  // here to match this file's "no reliance on cascade" convention); statuses references
  // users, so both have to go before the users wipe.
  await db.delete(statusViews)
  await db.delete(statuses)
  await db.delete(listings)
  await db.delete(users)

  const [me] = await db
    .insert(users)
    .values({
      id: 'me',
      phone: '+232-76-000001',
      name: 'Ngoni M.',
      avatarEmoji: '🙂',
      location: 'Lumley',
      isBusiness: false,
      verificationLevel: 2,
      rating: 4.6,
      ratingCount: 4,
      pinHash: DEMO_PIN_HASH,
    })
    .returning()

  // Demo admin account for the moderation panel (Account > Admin Dashboard, only visible to
  // this role) — same DEMO_PIN as everyone else. Sign in with +232-76-000000 / 1234.
  await db.insert(users).values({
    id: 'admin',
    phone: '+232-76-000000',
    name: 'DEALEONE Admin',
    avatarEmoji: '🛡️',
    location: 'Freetown',
    isBusiness: false,
    verificationLevel: 1,
    role: 'admin',
    pinHash: DEMO_PIN_HASH,
  })

  const sellerSeeds = [
    // buyerRequestPriorityUntil demos the "Buyer-Request priority access" purchase (NLe
    // 100/wk, business accounts only) already being active — sign in as +232-76-100001 /
    // 1234 to see it reflected on account/BuyerRequestsFeed.tsx's "Browse" tab.
    { id: 'abc-electronics', phone: '+232-76-100001', name: 'ABC Electronics', avatarEmoji: '📱', location: 'Lumley', isBusiness: true, businessName: 'ABC Electronics Ltd', verificationLevel: 4, rating: 4.7, ratingCount: 212, buyerRequestPriorityUntil: daysFromNow(3) },
    { id: 'john-kamara', phone: '+232-76-100002', name: 'John Kamara', avatarEmoji: '🚗', location: 'Wilberforce', isBusiness: false, verificationLevel: 2, rating: 4.3, ratingCount: 18 },
    { id: 'xyz-furniture', phone: '+232-76-100003', name: 'XYZ Furniture', avatarEmoji: '🪑', location: 'Congo Cross', isBusiness: true, verificationLevel: 3, rating: 4.5, ratingCount: 76 },
    { id: 'fatmatas-kitchen', phone: '+232-76-100004', name: "Fatmata's Kitchen", avatarEmoji: '🍔', location: 'Lumley Beach Rd', isBusiness: true, verificationLevel: 4, rating: 4.9, ratingCount: 340 },
    { id: 'freetown-motors', phone: '+232-76-100005', name: 'Freetown Motors', avatarEmoji: '🚙', location: 'Kissy', isBusiness: true, verificationLevel: 3, rating: 4.2, ratingCount: 54 },
    { id: 'aminata-fashion', phone: '+232-76-100006', name: 'Aminata B.', avatarEmoji: '👗', location: 'Kenema St', isBusiness: false, verificationLevel: 1, rating: 4.8, ratingCount: 9 },
    { id: 'green-farm', phone: '+232-76-100007', name: 'Green Farm Co-op', avatarEmoji: '🌾', location: 'Waterloo', isBusiness: true, verificationLevel: 3, rating: 4.6, ratingCount: 41 },
    { id: 'techfix', phone: '+232-76-100008', name: 'TechFix Mobile Mechanic', avatarEmoji: '🔧', location: 'Brookfields', isBusiness: false, verificationLevel: 2, rating: 4.4, ratingCount: 27 },
    { id: 'star-pharmacy', phone: '+232-76-100009', name: 'Star Pharmacy', avatarEmoji: '💊', location: 'Congo Cross', isBusiness: true, verificationLevel: 4, rating: 4.7, ratingCount: 98 },
    { id: 'bintu', phone: '+232-76-100010', name: 'Bintu K.', avatarEmoji: '💻', location: 'Hill Station', isBusiness: false, verificationLevel: 2, rating: 4.5, ratingCount: 11 },
    // Events organizer — a dedicated business account rather than shoehorning show/nightlife
    // hosting onto one of the sellers above, same way star-pharmacy exists specifically as
    // an honest example of who the banner-ad feature is for.
    { id: 'citylights-events', phone: '+232-76-100011', name: 'CityLights Entertainment', avatarEmoji: '🎪', location: 'Kenema St', isBusiness: true, businessName: 'CityLights Entertainment', verificationLevel: 3, rating: 4.6, ratingCount: 58 },
  ]
  await db.insert(users).values(sellerSeeds.map((s) => ({ ...s, pinHash: DEMO_PIN_HASH })))

  const listingSeeds = [
    { id: 'l1', sellerId: 'abc-electronics', category: 'electronics', title: 'iPhone 15 Pro 256GB', price: 17500, negotiable: true, condition: 'used', quantity: 1, description: 'Excellent condition, battery health 96%. Screen protector fitted from new, S-Pen included. Box and charger included.', ...near('Lumley', 'l1'), status: 'active', type: 'standard', createdAt: daysAgo(3), expiresAt: daysFromNow(87), sponsored: true, featured: true, images: ['📱'] },
    { id: 'l2', sellerId: 'fatmatas-kitchen', category: 'food', title: 'Chicken & Chips — Flash Deal', price: 100, negotiable: false, condition: 'new', quantity: 40, description: 'Freshly made chicken & chips, flash deal today only. Ready in 15 minutes, dine-in or takeaway.', ...near('Lumley Beach Rd', 'l2'), status: 'active', type: 'deal', createdAt: daysAgo(0), expiresAt: daysFromNow(1), sponsored: false, featured: true, images: ['🍔'], dealOriginalPrice: 140, dealValidUntil: daysFromNow(0.3) },
    { id: 'l3', sellerId: 'green-farm', category: 'groceries', title: 'Bag of Rice 50kg', price: 1350, negotiable: true, condition: 'new', quantity: 25, description: 'Locally grown rice, 50kg bag. Bulk discounts available for 5+ bags.', ...near('Waterloo', 'l3'), status: 'active', type: 'standard', createdAt: daysAgo(5), expiresAt: daysFromNow(85), sponsored: false, featured: false, images: ['🛒'] },
    { id: 'l4', sellerId: 'techfix', category: 'services', title: 'Mobile Mechanic — Available Now', price: 250, negotiable: true, condition: 'new', quantity: 1, description: 'Call-out mechanic for engine diagnostics, brakes, batteries. Freetown & surrounding areas.', ...near('Brookfields', 'l4'), status: 'active', type: 'service', createdAt: daysAgo(1), expiresAt: daysFromNow(89), sponsored: false, featured: false, images: ['🔧'] },
    { id: 'l5', sellerId: 'freetown-motors', category: 'cars', title: 'Toyota Corolla 2014', price: 98000, negotiable: true, condition: 'used', quantity: 1, description: 'Clean title, automatic, well maintained. Recent service, new tyres. Serious buyers only.', ...near('Kissy', 'l5'), status: 'active', type: 'standard', createdAt: daysAgo(9), expiresAt: daysFromNow(81), sponsored: false, featured: false, images: ['🚗'] },
    { id: 'l6', sellerId: 'abc-electronics', category: 'electronics', title: 'Samsung Galaxy S24 Ultra', price: 14500, negotiable: true, condition: 'used', quantity: 1, description: '256GB, titanium grey. Minor wear on frame, screen flawless.', ...near('Lumley', 'l6'), status: 'active', type: 'standard', createdAt: daysAgo(2), expiresAt: daysFromNow(88), sponsored: false, featured: false, images: ['📱'] },
    { id: 'l7', sellerId: 'xyz-furniture', category: 'furniture', title: '3-Seater Sofa Set', price: 6800, negotiable: true, condition: 'new', quantity: 4, description: 'Fabric sofa set, 3+1+1. Delivery available within 10 km.', ...near('Congo Cross', 'l7'), status: 'active', type: 'standard', createdAt: daysAgo(14), expiresAt: daysFromNow(76), sponsored: true, featured: false, images: ['🪑'] },
    // categoryPinned/pin-category demo — "Top Search Placement" (NLe 100/wk). Filter Explore
    // by Furniture and this should float above l7's plain sort position.
    { id: 'l8', sellerId: 'bintu', category: 'computers', title: 'HP EliteBook i5 8GB', price: 7900, negotiable: true, condition: 'refurbished', quantity: 1, description: 'i5 8th gen, 8GB RAM, 256GB SSD. Refurbished, 3-month warranty.', ...near('Hill Station', 'l8'), status: 'active', type: 'standard', createdAt: daysAgo(6), expiresAt: daysFromNow(84), sponsored: false, featured: false, images: ['💻'] },
    { id: 'l9', sellerId: 'aminata-fashion', category: 'fashion', title: 'Ankara Two-Piece Set', price: 950, negotiable: true, condition: 'new', quantity: 1, description: 'Handmade Ankara two-piece, size M. One of a kind print.', ...near('Kenema St', 'l9'), status: 'reserved', type: 'standard', createdAt: daysAgo(4), expiresAt: daysFromNow(86), sponsored: false, featured: false, images: ['👗'] },
    { id: 'l10', sellerId: 'green-farm', category: 'agriculture', title: 'Cassava Farm Produce (per bushel)', price: 420, negotiable: true, condition: 'new', quantity: 60, description: 'Fresh cassava, harvested weekly. Farm pickup or delivery.', ...near('Waterloo', 'l10'), status: 'active', type: 'standard', createdAt: daysAgo(2), expiresAt: daysFromNow(88), sponsored: false, featured: false, images: ['🌾'] },
    // banner/banner-ad demo — Explore homepage banner (NLe 100/wk, business accounts only).
    // Star Pharmacy is a business account, so it's an honest example of who this is for.
    { id: 'l11', sellerId: 'star-pharmacy', category: 'shops', title: 'Star Pharmacy — Congo Cross', price: 0, negotiable: false, condition: 'new', quantity: 1, description: 'Full-service pharmacy. Prescriptions, first aid, baby care, delivery.', ...near('Congo Cross', 'l11'), status: 'active', type: 'standard', createdAt: daysAgo(60), expiresAt: daysFromNow(300), sponsored: false, featured: false, images: ['💊'], banner: true, bannerUntil: daysFromNow(6) },
    { id: 'l12', sellerId: 'freetown-motors', category: 'property', title: '2-Bedroom Flat — Hill Station', price: 3500, negotiable: true, condition: 'new', quantity: 1, description: 'Furnished 2-bed flat, monthly rent, water & security included.', ...near('Hill Station', 'l12'), status: 'active', type: 'standard', createdAt: daysAgo(11), expiresAt: daysFromNow(79), sponsored: false, featured: false, images: ['🏠'] },
    { id: 'l13', sellerId: 'abc-electronics', category: 'electronics', title: 'iPhone 14 Pro 128GB', price: 13200, negotiable: true, condition: 'used', quantity: 1, description: 'Good condition, minor scuffs on frame. Battery health 89%.', ...near('Lumley', 'l13'), status: 'active', type: 'standard', createdAt: daysAgo(8), expiresAt: daysFromNow(82), sponsored: false, featured: false, images: ['📱'] },
    { id: 'l14', sellerId: 'xyz-furniture', category: 'furniture', title: 'Dining Table Set (6 chairs)', price: 5200, negotiable: true, condition: 'new', quantity: 2, description: 'Solid wood dining table with 6 chairs. Local delivery available.', ...near('Congo Cross', 'l14'), status: 'active', type: 'standard', createdAt: daysAgo(20), expiresAt: daysFromNow(70), sponsored: false, featured: false, images: ['🪑'], categoryPinned: true, categoryPinnedUntil: daysFromNow(4) },
    { id: 'l15', sellerId: 'john-kamara', category: 'cars', title: 'Honda CR-V 2016', price: 145000, negotiable: true, condition: 'used', quantity: 1, description: 'Well maintained SUV, low mileage, full service history available.', ...near('Wilberforce', 'l15'), status: 'active', type: 'standard', createdAt: daysAgo(15), expiresAt: daysFromNow(75), sponsored: false, featured: false, images: ['🚙'] },
    { id: 'l16', sellerId: 'aminata-fashion', category: 'fashion', title: "Men's Leather Sandals (Handmade)", price: 380, negotiable: true, condition: 'new', quantity: 8, description: 'Handmade leather sandals, sizes 40-45 available.', ...near('Kenema St', 'l16'), status: 'active', type: 'standard', createdAt: daysAgo(3), expiresAt: daysFromNow(87), sponsored: false, featured: false, images: ['👟'] },
    { id: 'l17', sellerId: 'bintu', category: 'electronics', title: 'iPhone 15 Pro Max — SOLD', price: 19500, negotiable: false, condition: 'used', quantity: 1, description: 'No longer available — sold to a buyer via DEALEONE.', ...near('Hill Station', 'l17'), status: 'sold', type: 'standard', createdAt: daysAgo(25), expiresAt: daysAgo(1), sponsored: false, featured: false, images: ['📱'] },
    { id: 'l18', sellerId: 'green-farm', category: 'groceries', title: 'Fresh Vegetable Basket', price: 280, negotiable: false, condition: 'new', quantity: 15, description: 'Mixed seasonal vegetables, farm-fresh weekly basket.', ...near('Waterloo', 'l18'), status: 'draft', type: 'standard', createdAt: daysAgo(0), expiresAt: daysFromNow(90), sponsored: false, featured: false, images: ['🥬'] },
    // l19-l22: seeded straight into four of the new categories added by the categories-
    // expansion round, so Explore's category chips and Admin > Listings have something in
    // each of them on first look rather than only ever showing the original 11.
    { id: 'l19', sellerId: 'abc-electronics', category: 'phones', title: 'Fast Charger + Tempered Glass Bundle', price: 180, negotiable: true, condition: 'new', quantity: 12, description: 'USB-C fast charger (25W) with tempered glass screen protector, fits most Android/iPhone models.', ...near('Lumley', 'l19'), status: 'active', type: 'standard', createdAt: daysAgo(1), expiresAt: daysFromNow(89), sponsored: false, featured: false, images: ['📱'] },
    { id: 'l20', sellerId: 'aminata-fashion', category: 'jewelry_watches', title: 'Gold-Plated Necklace Set', price: 620, negotiable: true, condition: 'new', quantity: 3, description: 'Handmade gold-plated necklace and earring set. Hypoallergenic, comes with a gift box.', ...near('Kenema St', 'l20'), status: 'active', type: 'standard', createdAt: daysAgo(7), expiresAt: daysFromNow(83), sponsored: false, featured: false, images: ['💎'] },
    { id: 'l21', sellerId: 'techfix', category: 'tools_hardware', title: 'Toolbox — Wrench & Socket Set (46pc)', price: 540, negotiable: true, condition: 'used', quantity: 1, description: '46-piece wrench and socket set in a hard case. A few items lightly worn, all functional.', ...near('Brookfields', 'l21'), status: 'active', type: 'standard', createdAt: daysAgo(10), expiresAt: daysFromNow(80), sponsored: false, featured: false, images: ['🛠️'] },
    { id: 'l22', sellerId: 'john-kamara', category: 'pets', title: 'Puppy — Local Breed, 3 Months Old', price: 350, negotiable: true, condition: 'new', quantity: 1, description: 'Healthy 3-month-old puppy, first round of vaccinations done, litter-trained.', ...near('Wilberforce', 'l22'), status: 'active', type: 'standard', createdAt: daysAgo(2), expiresAt: daysFromNow(88), sponsored: false, featured: false, images: ['🐾'] },
    // l23: "me" (the demo login user) as a seller too — every other listing belongs to one
    // of the seller-seed accounts, which left MyOffers.tsx's new "Received" tab and
    // MyListings.tsx's pin-category/banner-ad buttons with nothing of "me"'s own to act on.
    { id: 'l23', sellerId: 'me', category: 'electronics', title: 'iPad Air 2022 64GB', price: 5200, negotiable: true, condition: 'used', quantity: 1, description: 'Excellent condition, 64GB Wi-Fi model, includes original charger and a case.', ...near('Lumley', 'l23'), status: 'active', type: 'standard', createdAt: daysAgo(2), expiresAt: daysFromNow(88), sponsored: false, featured: false, images: ['📱'] },
  ] as const

  await db.insert(listings).values(listingSeeds as any)

  // Events — a dedicated section, not a listing category (see schema.ts's events table).
  // A mix of categories/organizers/statuses so Events.tsx's category chips, the
  // upcoming/past toggle, ticketed vs. free events, and the cancelled state all have
  // something real to show on first look.
  const eventSeeds = [
    {
      id: 'e1',
      organizerId: 'citylights-events',
      category: 'live_show',
      title: 'Afrobeats Live: Freetown Sessions',
      description: 'A night of live Afrobeats performances from local and regional artists. Doors open 7pm.',
      venueName: 'National Stadium Grounds',
      ...near('Kenema St', 'e1'),
      startsAt: daysFromNow(5),
      endsAt: daysFromNow(5.2),
      ticketTiers: [
        { name: 'General', price: 150 },
        { name: 'VIP', price: 400 },
      ],
      images: ['🎤'],
    },
    {
      id: 'e2',
      organizerId: 'citylights-events',
      category: 'nightlife',
      title: 'Saturday Night Rooftop Party',
      description: 'DJ sets, drinks, and a beach-view rooftop. 18+.',
      venueName: 'Lumley Beach Rooftop',
      ...near('Lumley Beach Rd', 'e2'),
      startsAt: daysFromNow(3),
      endsAt: daysFromNow(3.3),
      ticketTiers: [{ name: 'Entry', price: 100 }],
      images: ['🪩'],
    },
    {
      id: 'e3',
      organizerId: 'john-kamara',
      category: 'sports',
      title: 'Freetown 5-a-side Football Tournament',
      description: 'Community 5-a-side tournament, open to all neighborhood teams. Spectators welcome, free entry.',
      venueName: 'Brookfields Sports Field',
      ...near('Brookfields', 'e3'),
      startsAt: daysFromNow(7),
      endsAt: daysFromNow(7.3),
      ticketTiers: [],
      images: ['⚽'],
    },
    {
      id: 'e4',
      organizerId: 'me',
      category: 'community',
      title: 'Neighborhood Clean-Up & Cookout',
      description: 'Morning clean-up followed by a free community cookout. Bring gloves if you have them.',
      venueName: 'Lumley Community Center',
      ...near('Lumley', 'e4'),
      startsAt: daysFromNow(2),
      endsAt: daysFromNow(2.2),
      ticketTiers: [],
      images: ['🤝'],
    },
    {
      id: 'e5',
      organizerId: 'green-farm',
      category: 'food_drink',
      title: 'Waterloo Harvest Food Festival',
      description: 'Local produce, street food stalls, and live music to celebrate the harvest season.',
      venueName: 'Waterloo Market Grounds',
      ...near('Waterloo', 'e5'),
      startsAt: daysFromNow(10),
      endsAt: daysFromNow(10.4),
      ticketTiers: [{ name: 'Entry', price: 50 }],
      images: ['🍲'],
    },
    // e6: already happened — gives the "Past" tab in Events.tsx something real to show
    // rather than being empty on first look.
    {
      id: 'e6',
      organizerId: 'citylights-events',
      category: 'live_show',
      title: "New Year's Eve Countdown Party",
      description: 'Countdown celebration with live performances and a midnight fireworks display.',
      venueName: 'Lumley Beach Grounds',
      ...near('Lumley Beach Rd', 'e6'),
      startsAt: daysAgo(10),
      endsAt: daysAgo(9.8),
      ticketTiers: [{ name: 'General', price: 200 }],
      images: ['🎆'],
    },
    // e7: cancelled — an honest example for the organizer-cancel flow and the "cancelled"
    // badge, rather than that state only ever existing in theory.
    {
      id: 'e7',
      organizerId: 'john-kamara',
      category: 'sports',
      title: 'Beach Volleyball Tournament',
      description: 'Cancelled due to weather — will be rescheduled.',
      venueName: 'Lumley Beach',
      ...near('Lumley Beach Rd', 'e7'),
      startsAt: daysFromNow(4),
      endsAt: daysFromNow(4.2),
      ticketTiers: [],
      images: ['🏐'],
      status: 'cancelled',
    },
  ] as const

  await db.insert(events).values(eventSeeds as any)

  // "Interested/going" RSVPs — spread across a few events/users so the interested-count
  // shown on every event card isn't just ever 0 or 1.
  await db.insert(eventInterests).values([
    { userId: 'me', eventId: 'e1' },
    { userId: 'bintu', eventId: 'e1' },
    { userId: 'aminata-fashion', eventId: 'e1' },
    { userId: 'me', eventId: 'e3' },
    { userId: 'john-kamara', eventId: 'e2' },
    { userId: 'bintu', eventId: 'e5' },
  ])

  // conversations + messages (buyer is always "me" in this seed data)
  async function seedThread(
    convoId: string,
    listingId: string,
    sellerId: string,
    lastMessageAt: Date,
    msgs: { from: 'me' | 'them'; text: string; minsAgo: number; type?: 'counter_offer'; amount?: number }[],
  ) {
    await db.insert(conversations).values({
      id: convoId,
      listingId,
      buyerId: 'me',
      sellerId,
      lastMessageAt,
    })
    await db.insert(messages).values(
      msgs.map((m, i) => ({
        id: `${convoId}-m${i}`,
        conversationId: convoId,
        senderId: m.from === 'me' ? 'me' : sellerId,
        type: m.type ?? ('text' as const),
        text: m.text,
        amount: m.amount,
        createdAt: minsAgo(m.minsAgo),
        read: true,
      })),
    )
  }

  await seedThread('c1', 'l1', 'abc-electronics', daysAgo(0), [
    { from: 'me', text: 'Hi, is the iPhone 15 Pro still available?', minsAgo: 40 },
    { from: 'them', text: 'Yes, still available. You can come today.', minsAgo: 38 },
    { from: 'them', text: 'We are open until 7pm.', minsAgo: 37 },
  ])
  await seedThread('c2', 'l5', 'freetown-motors', daysAgo(0.04), [
    { from: 'me', text: 'Would you accept NLe 95,000 for the Corolla?', minsAgo: 90 },
    { from: 'them', text: 'Can you accept NLe 95,000?', minsAgo: 60, type: 'counter_offer', amount: 96000 },
  ])
  await seedThread('c3', 'l7', 'xyz-furniture', daysAgo(1), [
    { from: 'me', text: 'Do you deliver to Goderich?', minsAgo: 1500 },
    { from: 'them', text: 'Delivery available within 10 km.', minsAgo: 1440 },
  ])
  await seedThread('c4', 'l4', 'techfix', daysAgo(2), [
    { from: 'me', text: 'My car battery is dead, can you come to Lumley now?', minsAgo: 2900 },
    { from: 'them', text: 'On my way, 20 minutes.', minsAgo: 2880 },
    { from: 'me', text: 'Thank you, fixed. Great service!', minsAgo: 2820 },
  ])
  // c5/l17: "me" is the buyer whose offer got accepted on an already-sold listing — the one
  // real precondition for the new post-transaction rating flow (routes/ratings.ts requires
  // status: 'sold' + an accepted offer from the rater on that exact listing). Deliberately
  // left UNRATED so opening this thread shows a real, live "Rate your seller" prompt rather
  // than a fabricated rating baked into the seed.
  await seedThread('c5', 'l17', 'bintu', daysAgo(19), [
    { from: 'me', text: 'Is the iPhone 15 Pro Max still available?', minsAgo: 28850 },
    { from: 'them', text: 'Yes — NLe 19,500, cash on collection.', minsAgo: 28800 },
  ])
  await db.insert(messages).values({
    id: 'c5-sys1',
    conversationId: 'c5',
    senderId: 'bintu',
    type: 'system',
    text: 'Offer accepted: NLe 19500 for iPhone 15 Pro Max — SOLD. Coordinate a time/place to complete the deal.',
    createdAt: daysAgo(19),
    read: true,
  })

  // c6/e1: an event conversation ("Message organizer" from EventDetail.tsx) — mirrors
  // seedThread above but keyed by eventId instead of listingId (see the conversations
  // table's polymorphic listingId/eventId columns in schema.ts).
  await db.insert(conversations).values({
    id: 'c6',
    eventId: 'e1',
    buyerId: 'me',
    sellerId: 'citylights-events',
    lastMessageAt: daysAgo(0.5),
  })
  await db.insert(messages).values([
    { id: 'c6-m0', conversationId: 'c6', senderId: 'me', type: 'text', text: 'Is the VIP tier general admission plus a reserved seating area?', createdAt: minsAgo(720), read: true },
    { id: 'c6-m1', conversationId: 'c6', senderId: 'citylights-events', type: 'text', text: 'Yes, VIP includes reserved seating up front plus a drink voucher.', createdAt: minsAgo(700), read: true },
  ])

  // Offers — previously this table was never seeded at all, so "My Offers" (sent) and the
  // new "Received" tab (routes/offers.ts's GET /received) were both empty on first look.
  await db.insert(offers).values([
    // Sent by "me" — a plain pending offer to demo the buyer-side "Sent" tab.
    { id: 'o1', listingId: 'l6', buyerId: 'me', amount: 13800, message: 'Would you take 13,800 cash?', status: 'pending', createdAt: minsAgo(600) },
    // The accepted offer behind c5/l17 above — this is what makes "me" eligible to rate
    // bintu once the "Rate your seller" prompt is used.
    { id: 'o2', listingId: 'l17', buyerId: 'me', amount: 19500, status: 'accepted', createdAt: daysAgo(20) },
    // Received by "me" on l23 — two pending offers so MyOffers.tsx's "Received" tab has
    // something to accept/reject/counter right away.
    { id: 'o3', listingId: 'l23', buyerId: 'john-kamara', amount: 4800, message: 'Would you take 4800? Can collect today.', status: 'pending', createdAt: minsAgo(200) },
    { id: 'o4', listingId: 'l23', buyerId: 'bintu', amount: 5000, status: 'pending', createdAt: minsAgo(90) },
  ])

  // A pending "Verified-seller fast-track" style request (not priority — that's a separate
  // paid purchase) so Admin > Verification isn't empty on first look. aminata-fashion is
  // seeded at level 1, requesting the next level up (2), same rule the API enforces.
  await db.insert(verificationRequests).values([
    {
      id: 'vr1',
      userId: 'aminata-fashion',
      targetLevel: 2,
      note: 'I have my national ID card ready to show — please verify my identity.',
      priority: false,
      status: 'pending',
    },
  ])

  await db.insert(buyerRequests).values([
    { id: 'r1', userId: 'me', product: 'Samsung S24 Ultra', maxOffer: 15000, radiusKm: 10, condition: 'either', status: 'matched', responses: 3, expiresAt: daysFromNow(21) },
    { id: 'r2', userId: 'me', product: 'Generator (5kVA or more)', maxOffer: 22000, radiusKm: 25, condition: 'used', status: 'open', responses: 0, expiresAt: daysFromNow(14) },
    // r3: from a different user, posted more than 24h ago — otherwise account/BuyerRequestsFeed.tsx's
    // "Browse" tab (routes/buyerRequests.ts's GET /feed) has nothing to show when signed in as
    // "me", since r1/r2 above are "me"'s own requests and the feed always excludes those.
    { id: 'r3', userId: 'john-kamara', product: 'Office desk and chair', maxOffer: 1800, radiusKm: 15, condition: 'either', status: 'open', responses: 0, createdAt: daysAgo(3), expiresAt: daysFromNow(27) },
  ])

  // A couple of demo reports/disputes so the admin panel isn't empty on first look.
  await db.insert(reports).values([
    {
      id: 'rep1',
      reporterId: 'me',
      targetType: 'listing',
      targetId: 'l9',
      reason: 'scam',
      details: 'Seller asked for a deposit before showing the item in person.',
    },
  ])
  await db.insert(disputes).values([
    {
      id: 'disp1',
      conversationId: 'c2',
      raisedByUserId: 'me',
      reason: 'no_show_seller',
      details: 'Agreed a time to view the Corolla and the seller never showed up.',
    },
  ])

  // Statuses (see schema.ts's statuses/statusViews tables and lib/statusEligibility.ts) —
  // only sellers with a real currently-active paid promotion qualify, so these three were
  // picked deliberately: abc-electronics via its buyerRequestPriorityUntil (account-scoped),
  // star-pharmacy via l11's bannerUntil and xyz-furniture via l14's categoryPinnedUntil
  // (both listing-scoped). A mix of viewed/unviewed-by-"me" so the Status row's ring styling
  // (StatusRow.tsx) has a real example of both states on first look.
  const statusSeeds = [
    { id: 'st1', userId: 'abc-electronics', imageUrl: placeholderStatusImage('📱', '#1d4ed8'), caption: 'New shipment of iPhones just arrived — DM for prices!', createdAt: minsAgo(90), expiresAt: daysFromNow(1) },
    { id: 'st2', userId: 'abc-electronics', imageUrl: placeholderStatusImage('🔌', '#1d4ed8'), caption: 'Fast chargers back in stock.', createdAt: minsAgo(40), expiresAt: daysFromNow(1) },
    { id: 'st3', userId: 'star-pharmacy', imageUrl: placeholderStatusImage('💊', '#059669'), caption: 'Open until 9pm today, free delivery within Congo Cross.', createdAt: minsAgo(300), expiresAt: daysFromNow(1) },
    { id: 'st4', userId: 'xyz-furniture', imageUrl: placeholderStatusImage('🪑', '#b45309'), caption: 'Dining sets 15% off this week only.', createdAt: minsAgo(600), expiresAt: daysFromNow(1) },
  ]
  await db.insert(statuses).values(statusSeeds)
  // "me" has already seen star-pharmacy's status but not the other two posters' — gives
  // StatusRow.tsx a real all-viewed (muted ring) poster alongside real unviewed ones.
  await db.insert(statusViews).values([{ statusId: 'st3', viewerId: 'me' }])

  console.log(
    `Seeded: 1 buyer + 1 admin + ${sellerSeeds.length} sellers, ${listingSeeds.length} listings, ${eventSeeds.length} events, 6 conversations, 4 offers, 3 buyer requests, 1 report, 1 dispute, 1 verification request, ${statusSeeds.length} statuses.`,
  )
  console.log('Current user id for testing:', me.id)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
