import type { Category, Condition } from '../types'

export interface DetectedProduct {
  emoji: string
  title: string
  category: Category
  keywords: string[]
  suggestedPriceMin: number
  suggestedPriceMax: number
  condition: Condition
}

export const DETECTION_CATALOG: DetectedProduct[] = [
  {
    emoji: '📱',
    title: 'Samsung Galaxy A15 128GB Dual SIM',
    category: 'electronics',
    keywords: ['samsung', 'galaxy', 'a15', 'smartphone'],
    suggestedPriceMin: 2200,
    suggestedPriceMax: 2800,
    condition: 'used',
  },
  {
    emoji: '💻',
    title: 'Dell Latitude i5 8GB Laptop',
    category: 'computers',
    keywords: ['dell', 'latitude', 'laptop', 'i5'],
    suggestedPriceMin: 6800,
    suggestedPriceMax: 8200,
    condition: 'refurbished',
  },
  {
    emoji: '🪑',
    title: '2-Seater Fabric Sofa',
    category: 'furniture',
    keywords: ['sofa', 'fabric', 'seater'],
    suggestedPriceMin: 3500,
    suggestedPriceMax: 4600,
    condition: 'used',
  },
  {
    emoji: '🚗',
    title: 'Nissan Almera 2015',
    category: 'cars',
    keywords: ['nissan', 'almera', 'sedan'],
    suggestedPriceMin: 65000,
    suggestedPriceMax: 78000,
    condition: 'used',
  },
  {
    emoji: '👟',
    title: 'Nike Air Max Sneakers (Size 42)',
    category: 'fashion',
    keywords: ['nike', 'sneakers', 'air max'],
    suggestedPriceMin: 850,
    suggestedPriceMax: 1200,
    condition: 'used',
  },
  {
    emoji: '🔌',
    title: 'Generator 5kVA',
    category: 'electronics',
    keywords: ['generator', 'kva', 'power'],
    suggestedPriceMin: 18000,
    suggestedPriceMax: 24000,
    condition: 'used',
  },
  // Added alongside the categories-expansion round, so the demo AI-parse flow (Sell's
  // photo-detection mock) has an example in a few of the new categories too, not just the
  // original 11.
  {
    emoji: '💎',
    title: 'Gold-Plated Necklace Set',
    category: 'jewelry_watches',
    keywords: ['necklace', 'gold', 'jewelry', 'jewellery'],
    suggestedPriceMin: 500,
    suggestedPriceMax: 750,
    condition: 'new',
  },
  {
    emoji: '🛠️',
    title: 'Toolbox — Wrench & Socket Set',
    category: 'tools_hardware',
    keywords: ['toolbox', 'wrench', 'socket', 'tools'],
    suggestedPriceMin: 450,
    suggestedPriceMax: 650,
    condition: 'used',
  },
]

export function detectFromEmoji(emoji: string): DetectedProduct {
  return (
    DETECTION_CATALOG.find((d) => d.emoji === emoji) ?? DETECTION_CATALOG[0]
  )
}
