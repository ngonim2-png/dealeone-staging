import { CATEGORY_KEYWORDS } from './aiParse'
import type { Category } from '../types'

// Guess a category from the title the seller typed ("Samsung A14 64GB" → Phones), using the
// same keyword table the search box uses. Word-boundary matching so "cat" doesn't match
// "catering" and "ring" doesn't match "charging". Returns null when nothing is clear.
export function suggestCategory(title: string): Category | null {
  const text = ` ${title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')} `
  let best: Category | null = null
  let bestScore = 0
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS) as [Category, string[]][]) {
    let score = 0
    for (const w of words) if (text.includes(` ${w} `) || text.includes(` ${w}s `)) score += w.includes(' ') ? 2 : 1
    if (score > bestScore) {
      best = cat
      bestScore = score
    }
  }
  return best
}

// The questions buyers always ask, per category — tapping one adds it to the description
// as a line to fill in, so listings answer them up front (fewer "is it…?" messages).
const PROMPTS: Partial<Record<Category, string[]>> = {
  phones: ['Storage (GB):', 'Battery health:', 'Any cracks or scratches?', 'Charger included?', 'Unlocked for all networks?'],
  computers: ['Processor / RAM:', 'Storage:', 'Battery lasts:', 'Charger included?', 'Any faults?'],
  electronics: ['Model:', 'Works perfectly?', 'What comes with it:', 'Any faults?'],
  appliances: ['Model / size:', 'Year bought:', 'Works perfectly?', 'Power use:'],
  cars: ['Year:', 'Mileage (km):', 'Automatic or manual:', 'Papers up to date?', 'Any accident damage?'],
  auto_parts: ['Fits which car:', 'New or used:', 'Part number:'],
  property: ['Bedrooms:', 'Rent per year / month:', 'Water & light:', 'Available from:'],
  fashion: ['Size:', 'Colour:', 'Worn how many times?'],
  shoes: ['Size:', 'Colour:', 'Worn how many times?'],
  furniture: ['Size (W×D×H):', 'Material:', 'Any damage?', 'Can you deliver?'],
  services: ['Areas you cover:', 'Price per job / hour:', 'Days & hours available:', 'Years of experience:'],
  food: ['Portion size:', 'Delivery or pickup?', 'Order before:'],
  groceries: ['Quantity / weight:', 'Fresh until:', 'Delivery or pickup?'],
}
const DEFAULT_PROMPTS = ['Condition details:', "What's included:", 'Why selling:', 'Can you deliver?']

export function descriptionPrompts(category: Category): string[] {
  return PROMPTS[category] ?? DEFAULT_PROMPTS
}

export interface PriceGuide {
  count: number
  basis: 'similar' | 'category' | 'none'
  low?: number
  median?: number
  high?: number
}
