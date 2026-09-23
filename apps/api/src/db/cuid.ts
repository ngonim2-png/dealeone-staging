import { randomUUID } from 'node:crypto'

// Simple unique id generator for primary keys. Using the platform's UUID rather than
// pulling in a cuid package — avoids an extra dependency for no real benefit here.
export function createId(): string {
  return randomUUID()
}
