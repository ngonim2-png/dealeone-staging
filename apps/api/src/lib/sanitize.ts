// Strips the salted PIN hash off a user row before it goes into any API response. scrypt
// hashes are one-way and salted, but there's no reason a hash — even a strong one — should
// ever leave the server; every route that returns a `users` row must pass it through this.
export function omitPinHash<T extends { pinHash?: string | null }>(user: T): Omit<T, 'pinHash'> {
  const { pinHash: _pinHash, ...rest } = user
  return rest
}
