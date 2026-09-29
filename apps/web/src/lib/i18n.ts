import { useCallback, useSyncExternalStore } from 'react'

// Tiny translation layer — no library, because the app only needs two languages and a few
// dozen strings on the screens people use most (home, listing, sell, messages, profile).
// Strings not listed here stay in English on purpose; translate a screen by swapping its
// literals for t('key') and adding the key to both dictionaries.
//
// KRIO: written in the everyday phone-texting spelling (e.g. "Wetin yu de luk for?") rather
// than the formal ɔ/ɛ orthography, because that's what most people type. These are a first
// draft and must be checked by a native Krio speaker before launch.

export type Lang = 'en' | 'kri'
export const LANGS: { id: Lang; label: string; native: string }[] = [
  { id: 'en', label: 'English', native: 'English' },
  { id: 'kri', label: 'Krio', native: 'Krio (beta)' },
]

const en = {
  'nav.events': 'Events',
  'nav.messages': 'Messages',
  'nav.sell': 'Sell',
  'nav.profile': 'Profile',
  'nav.promote': 'Promote',

  'explore.search': 'What are you looking for?',
  'explore.aiSearch': 'e.g. "used iPhone under NLe 15,000 within 5 km"',
  'explore.map': 'Map',
  'explore.list': 'List',
  'explore.anywhere': 'Anywhere',
  'explore.results': '{n} results',
  'explore.noResults': 'No listings match yet — try widening the radius or clearing filters.',
  'explore.saveSearch': 'Save search',
  'explore.saved': 'Saved',
  'explore.saveHint': "We'll tell you when something new matches.",
  'explore.voice': 'Search by voice',
  'explore.listening': 'Listening…',

  'listing.makeOffer': 'Make Offer',
  'listing.chat': 'Chat',
  'listing.yours': 'This is your listing.',
  'listing.edit': 'Edit listing',
  'listing.voice': 'Seller’s voice description',

  'sell.heading': 'List a product',
  'sell.continue': 'Continue',
  'sell.category': 'Category',
  'sell.title': 'Title',
  'sell.description': 'Description',
  'sell.price': 'Price (NLe)',
  'sell.quantity': 'Quantity',
  'sell.condition': 'Condition',
  'sell.negotiable': 'Price is negotiable',
  'sell.voice': 'Describe it by voice (optional)',
  'cond.new': 'new',
  'cond.used': 'used',
  'cond.refurbished': 'refurbished',

  'account.listings': 'My Listings',
  'account.insights': 'Seller insights',
  'account.events': 'My Events',
  'account.offers': 'My Offers',
  'account.wishlist': 'My Wishlist',
  'account.searches': 'Saved searches',
  'account.requests': 'My Buyer Requests',
  'account.invite': 'Invite friends',
  'account.verification': 'Verification',
  'account.promote': 'Promote',
  'account.reports': 'My Reports',
  'account.payments': 'Payments',
  'account.settings': 'Settings',
  'account.logout': 'Log out',

  'settings.language': 'Language',
  'settings.languageHint': 'Krio is new — tell us if a word reads wrong.',
}

type Key = keyof typeof en

const kri: Partial<Record<Key, string>> = {
  'nav.events': 'Program',
  'nav.messages': 'Mesej',
  'nav.sell': 'Sell',
  'nav.profile': 'Mi Akawnt',
  'nav.promote': 'Advatiz',

  'explore.search': 'Wetin yu de luk for?',
  'explore.aiSearch': 'e.g. "iPhone we dem don yuz, onda NLe 15,000, nia 5 km"',
  'explore.map': 'Map',
  'explore.list': 'List',
  'explore.anywhere': 'Enisay',
  'explore.results': '{n} tin dem',
  'explore.noResults': 'Notin nor de yet — try fo wide di radius or klin di filta dem.',
  'explore.saveSearch': 'Kip dis search',
  'explore.saved': 'A don kip am',
  'explore.saveHint': 'Wi go tel yu wen sontin nyu kam we fit.',
  'explore.voice': 'Tok fo search',
  'explore.listening': 'A de lisin…',

  'listing.makeOffer': 'Mek Ofa',
  'listing.chat': 'Tok',
  'listing.yours': 'Na yu yon dis.',
  'listing.edit': 'Chenj am',
  'listing.voice': 'Di sela in vois',

  'sell.heading': 'Put tin fo sell',
  'sell.continue': 'Go bifo',
  'sell.category': 'Kayn',
  'sell.title': 'Nem fo di tin',
  'sell.description': 'Tok bot am',
  'sell.price': 'Pris (NLe)',
  'sell.quantity': 'Omus',
  'sell.condition': 'Aw i tan',
  'sell.negotiable': 'Pris kin kam don',
  'sell.voice': 'Tok bot am wit yu vois (if yu want)',
  'cond.new': 'nyu',
  'cond.used': 'yuz',
  'cond.refurbished': 'don fiks',

  'account.listings': 'Mi tin dem fo sell',
  'account.insights': 'Aw mi tin dem de go',
  'account.events': 'Mi program dem',
  'account.offers': 'Mi ofa dem',
  'account.wishlist': 'Tin dem we a lek',
  'account.searches': 'Search dem we a kip',
  'account.requests': 'Tin dem we a de fen',
  'account.invite': 'Invayt yu padi dem',
  'account.verification': 'Pruv se na yu',
  'account.promote': 'Advatiz',
  'account.reports': 'Mi ripot dem',
  'account.payments': 'Mi pement dem',
  'account.settings': 'Setin dem',
  'account.logout': 'Komot',

  'settings.language': 'Langwej',
  'settings.languageHint': 'Krio na nyu — tel wi if wan wod nor rayt.',
}

const DICTS: Record<Lang, Partial<Record<Key, string>>> = { en, kri }
const KEY = 'dealeone.lang'

function readLang(): Lang {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'kri' ? 'kri' : 'en'
  } catch {
    return 'en'
  }
}

let current: Lang = typeof window === 'undefined' ? 'en' : readLang()
const listeners = new Set<() => void>()
if (typeof document !== 'undefined') document.documentElement.lang = current === 'kri' ? 'kri' : 'en'

export function setLang(lang: Lang) {
  current = lang
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    // ignore — the choice just won't survive a reload
  }
  document.documentElement.lang = lang === 'kri' ? 'kri' : 'en'
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>) {
  let s = DICTS[lang][key] ?? en[key]
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v))
  return s
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, () => current, () => 'en' as Lang)
}

export function useT() {
  const lang = useLang()
  return useCallback((key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang])
}
