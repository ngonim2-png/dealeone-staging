import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Loader2, WifiOff } from 'lucide-react'
import Explore from './pages/Explore'
import Login from './pages/Login'
import { useApp } from './context/AppContext'
import logoMark from './assets/logo-mark.png'

// Code splitting: only the home map and the login screen ship in the first download.
// Every other screen is fetched the first time someone opens it (then cached by the
// service worker), so opening the app on a slow connection is noticeably quicker.
const Events = lazy(() => import('./pages/Events'))
const EventDetail = lazy(() => import('./pages/EventDetail'))
const CreateEvent = lazy(() => import('./pages/CreateEvent'))
const Promote = lazy(() => import('./pages/Promote'))
const Notifications = lazy(() => import('./pages/Notifications'))
const ListingDetail = lazy(() => import('./pages/ListingDetail'))
const Sell = lazy(() => import('./pages/Sell'))
const Chats = lazy(() => import('./pages/Chats'))
const ChatThread = lazy(() => import('./pages/ChatThread'))
const Account = lazy(() => import('./pages/Account'))
const MyListings = lazy(() => import('./pages/account/MyListings'))
const MyOffers = lazy(() => import('./pages/account/MyOffers'))
const MyEvents = lazy(() => import('./pages/account/MyEvents'))
const Wishlist = lazy(() => import('./pages/account/Wishlist'))
const Verification = lazy(() => import('./pages/account/Verification'))
const BuyerRequests = lazy(() => import('./pages/account/BuyerRequests'))
const MyReports = lazy(() => import('./pages/account/MyReports'))
const Settings = lazy(() => import('./pages/account/Settings'))
const Payments = lazy(() => import('./pages/account/Payments'))
const SavedSearches = lazy(() => import('./pages/account/SavedSearches'))
const EditListing = lazy(() => import('./pages/account/EditListing'))
const Insights = lazy(() => import('./pages/account/Insights'))
const Invite = lazy(() => import('./pages/account/Invite'))
const AdminHome = lazy(() => import('./pages/admin/AdminHome'))
const AdminReports = lazy(() => import('./pages/admin/AdminReports'))
const AdminDisputes = lazy(() => import('./pages/admin/AdminDisputes'))
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'))
const AdminListings = lazy(() => import('./pages/admin/AdminListings'))
const AdminVerification = lazy(() => import('./pages/admin/AdminVerification'))

// Gate for every /admin/* route — Account.tsx only ever links here for an admin, but a
// non-admin could still type the URL directly, so this is the actual enforcement point
// (the API's requireAdmin middleware is the real security boundary; this is just UX).
function AdminRoute({ children }: { children: ReactNode }) {
  const { currentUser } = useApp()
  if (currentUser?.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}

function App() {
  const { ready, authChecked, error, currentUser, offline } = useApp()

  return (
    // `app-shell` (index.css) pins this box to exactly the visible screen, pads it for the
    // notch/home indicator, and makes each page scroll inside it instead of scrolling the
    // whole document — see the comment there for why that's what stops the mobile jitter.
    // Width: edge-to-edge on every phone and tablet (iPads and Android tablets included, in
    // either orientation) — only capped on big desktop monitors (xl+), where a full-width
    // marketplace would stretch cards absurdly wide. Pages add columns via md:/lg: grids.
    // Individual pieces (BottomNav's floating pill, the login form, Settings' rows) keep
    // their own tighter caps on purpose.
    <div className="app-shell mx-auto flex w-full flex-col bg-bg text-ink xl:max-w-6xl">
      {offline && currentUser && (
        // Fixed, so it doesn't take part in the shell's page layout.
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)_+_0.5rem)] z-[70] flex justify-center px-4"
        >
          <span className="flex items-center gap-1.5 rounded-full bg-ink/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
            <WifiOff size={13} /> You're offline — showing your saved copy
          </span>
        </div>
      )}
      {error ? (
        <ApiErrorScreen message={error} />
      ) : !authChecked ? (
        <LoadingScreen label="Opening DEALEONE…" />
      ) : !currentUser ? (
        <Login />
      ) : !ready ? (
        <LoadingScreen label="Opening DEALEONE…" />
      ) : (
        <Suspense fallback={<LoadingScreen label="Loading…" />}>
        <Routes>
          <Route path="/" element={<Explore />} />
          <Route path="/events" element={<Events />} />
          <Route path="/events/new" element={<CreateEvent />} />
          <Route path="/events/:id" element={<EventDetail />} />
          {/* Explore ("map") and Search ("list") merged into one home screen with a
              Map/List toggle — see Explore.tsx. This redirect keeps any old /search
              bookmark or link working by landing on the home screen already in List view. */}
          <Route path="/search" element={<Navigate to="/?view=list" replace />} />
          <Route path="/promote" element={<Promote />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/listing/:id" element={<ListingDetail />} />
          <Route path="/sell" element={<Sell />} />
          <Route path="/chats" element={<Chats />} />
          <Route path="/chats/:id" element={<ChatThread />} />
          <Route path="/account" element={<Account />} />
          <Route path="/account/listings" element={<MyListings />} />
          <Route path="/account/offers" element={<MyOffers />} />
          <Route path="/account/events" element={<MyEvents />} />
          <Route path="/account/wishlist" element={<Wishlist />} />
          <Route path="/account/verification" element={<Verification />} />
          <Route path="/account/requests" element={<BuyerRequests />} />
          <Route path="/account/reports" element={<MyReports />} />
          <Route path="/account/settings" element={<Settings />} />
          <Route path="/account/payments" element={<Payments />} />
          <Route path="/account/searches" element={<SavedSearches />} />
          <Route path="/account/listings/:id/edit" element={<EditListing />} />
          <Route path="/account/insights" element={<Insights />} />
          <Route path="/account/invite" element={<Invite />} />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminHome />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/reports"
            element={
              <AdminRoute>
                <AdminReports />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/disputes"
            element={
              <AdminRoute>
                <AdminDisputes />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <AdminRoute>
                <AdminUsers />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/listings"
            element={
              <AdminRoute>
                <AdminListings />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/verification"
            element={
              <AdminRoute>
                <AdminVerification />
              </AdminRoute>
            }
          />
        </Routes>
        </Suspense>
      )}
    </div>
  )
}

// Branded splash while the session and first data load — the logo instead of a bare
// spinner, so opening the app feels like opening an app.
function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted" role="status" aria-live="polite">
      <img src={logoMark} alt="" className="logo-glow-pulse h-14 w-14" />
      <p className="flex items-center gap-2 text-sm">
        <Loader2 size={16} className="animate-spin text-accent" /> {label}
      </p>
    </div>
  )
}

// Shown when the app can't reach the server at start-up (offline, or the free-tier API
// still waking up — that can take ~30-60s after it's been idle). Used to show developer
// instructions ("npm run dev:api") to real users.
function ApiErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-bad/10 text-bad">
        <WifiOff size={26} />
      </span>
      <p className="text-base font-semibold text-ink">Can't connect to DEALEONE</p>
      <p className="max-w-xs text-sm text-muted">{message}</p>
      <p className="max-w-xs text-xs text-muted">
        If you just opened the app, the server may still be waking up — wait a few seconds and try again.
      </p>
      <button onClick={() => window.location.reload()} className="btn-primary mt-2 min-h-12 px-6 text-sm">
        Try again
      </button>
    </div>
  )
}

export default App
