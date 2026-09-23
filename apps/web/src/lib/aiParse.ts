import type { Category, Condition } from '../types'

export interface ParsedQuery {
  maxPrice?: number
  minPrice?: number
  condition?: Condition
  radiusKm?: number
  category?: Category
  keywords: string[]
}

const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  // 'iphone'/'phone'/'samsung'/'smartphone'/'galaxy' moved down to the new `phones`
  // category below (categories-expansion round) — electronics keeps the more general terms.
  electronics: ['electronics', 'tablet', 'tv', 'television'],
  cars: ['car', 'corolla', 'toyota', 'honda', 'suv', 'vehicle', 'crv'],
  property: ['flat', 'house', 'apartment', 'property', 'rent', 'bedroom'],
  food: ['food', 'restaurant', 'chicken', 'chips', 'meal', 'deal'],
  groceries: ['rice', 'grocery', 'groceries', 'vegetable', 'vegetables'],
  // 'shoes' moved down to its own category below.
  fashion: ['dress', 'fashion', 'ankara', 'clothes', 'sandals'],
  services: ['mechanic', 'plumber', 'service', 'repair', 'cleaner'],
  furniture: ['sofa', 'furniture', 'table', 'chair', 'dining'],
  agriculture: ['farm', 'cassava', 'agriculture', 'produce'],
  computers: ['laptop', 'computer', 'macbook', 'elitebook', 'pc'],
  shops: ['shop', 'pharmacy', 'store'],
  // Added in the categories-expansion round — see types/index.ts's Category union.
  phones: ['iphone', 'phone', 'samsung', 'smartphone', 'galaxy', 'charger'],
  appliances: ['fridge', 'refrigerator', 'freezer', 'washing machine', 'microwave', 'appliance'],
  home_living: ['decor', 'lamp', 'curtain', 'kitchenware', 'homeware'],
  beauty_health: ['makeup', 'cosmetics', 'skincare', 'beauty', 'perfume', 'health'],
  baby_kids: ['baby', 'diaper', 'stroller', 'toddler', 'kids clothes'],
  jewelry_watches: ['necklace', 'jewelry', 'jewellery', 'ring', 'earrings', 'watch', 'watches'],
  bags_luggage: ['bag', 'handbag', 'luggage', 'suitcase', 'backpack'],
  shoes: ['shoes', 'sneakers', 'boots', 'heels'],
  sports_outdoors: ['gym', 'dumbbell', 'sports', 'outdoor', 'bicycle', 'football'],
  toys_games: ['toy', 'toys', 'game', 'games', 'puzzle'],
  office_school: ['office', 'school', 'stationery', 'notebook', 'printer'],
  tools_hardware: ['toolbox', 'wrench', 'hammer', 'hardware', 'tools', 'cement', 'zinc'],
  auto_parts: ['auto parts', 'car parts', 'tyre', 'tire', 'engine part'],
  pets: ['puppy', 'dog', 'cat', 'kitten', 'pet', 'pets'],
  hobbies_music: ['guitar', 'music', 'instrument', 'book', 'books', 'hobby'],
}

export function parseQuery(raw: string): ParsedQuery {
  const text = raw.toLowerCase()
  const result: ParsedQuery = { keywords: [] }

  const underMatch = text.match(/(?:under|below|less than|max(?:imum)?)\s*(?:nle)?\s*([\d,]+)/i)
  if (underMatch) result.maxPrice = Number(underMatch[1].replace(/,/g, ''))

  const aboutMatch = text.match(/(?:about|around|approx(?:imately)?)\s*(?:nle)?\s*([\d,]+k?)/i)
  if (aboutMatch && !result.maxPrice) {
    let val = aboutMatch[1].replace(/,/g, '')
    let n = val.endsWith('k') ? Number(val.slice(0, -1)) * 1000 : Number(val)
    if (!Number.isNaN(n)) {
      result.minPrice = Math.round(n * 0.8)
      result.maxPrice = Math.round(n * 1.2)
    }
  }

  const radiusMatch = text.match(/within\s*(\d+)\s*km/i)
  if (radiusMatch) result.radiusKm = Number(radiusMatch[1])

  if (/\bused\b/.test(text)) result.condition = 'used'
  else if (/\bnew\b/.test(text)) result.condition = 'new'
  else if (/refurbished/.test(text)) result.condition = 'refurbished'

  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS) as [Category, string[]][]) {
    if (words.some((w) => text.includes(w))) {
      result.category = cat
      break
    }
  }

  result.keywords = text
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .filter(
      (w) =>
        ![
          'the', 'and', 'for', 'with', 'find', 'me', 'good', 'that', 'has', 'have',
          'under', 'below', 'about', 'around', 'within', 'used', 'new', 'near',
        ].includes(w),
    )

  return result
}
