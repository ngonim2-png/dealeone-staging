// Imported by the generated service worker (vite.config.ts → workbox.importScripts).
// Shows phone notifications sent by the DEALEONE API (lib/push.ts) and opens the right
// screen when one is tapped — even when the app is closed.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (_) {
    data = { title: 'DEALEONE', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'DEALEONE'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/favicon-64.png',
      tag: data.tag || undefined,
      renotify: !!data.tag,
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) {
          w.navigate(self.registration.scope + '#' + target.replace(/^#/, '')).catch(() => {})
          return w.focus()
        }
      }
      return self.clients.openWindow(self.registration.scope + '#' + target.replace(/^#/, ''))
    }),
  )
})
