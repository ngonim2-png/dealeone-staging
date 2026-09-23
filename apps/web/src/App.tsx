import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Loader2, WifiOff } from 'lucide-react'
import Explore from './pages/Explore'
import Events from './pages/Events'
import EventDetail from './pages/EventDetail'
import CreateEvent from './pages/CreateEvent'
import Promote from './pages/Promote'
import ListingDetail from './pages/ListingDetail'
import Sell from './pages/Sell'
import Chats from './pages/Chats'
import ChatThread from './pages/ChatThread'
import Account from './pages/Account'
import MyListings from './pages/account/MyListings'
import MyOffers from './pages/account/MyOffers'
import MyEvents from './pages/account/MyEvents'
import Wishlist from './pages/account/Wishlist'
import Verification from './pages/account/Verification'
import BuyerRequests from './pages/account/BuyerRequests'
import MyReports from './pages/account/MyReports'
import Settings from './pages/account/Settings'
import Payments from './pages/account/Payments'
import AdminHome from './pages/admin/AdminHome'
import AdminReports from './pages/admin/AdminReports'
import AdminDisputes from './pages/admin/AdminDisputes'
import AdminUsers from './pages/admin/AdminUsers'
import AdminListings from './pages/admin/AdminListings'
import AdminVerification from './pages/admin/AdminVerification'
import Login from './pages/Login'
import { useApp } from './context/AppContext'

// Gate for every /admin/* route — Account.tsx only ever links here for an admin, but a
// non-admin could still type the URL directly, so this is the actual enforcement point
// (the API's requireAdmin middleware is the real security boundary; this is just UX).
function AdminRoute({ children }: { children: ReactNode }) {
  const { currentUser } = useApp()
  if (currentUser?.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}

function App() {
  const { ready, authChecked, error, currentUser } = useApp()

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-bg text-ink">
      {error ? (
        <ApiErrorScreen message={error} />
      ) : !authChecked ? (
        <LoadingScreen label="Loading DEALEONE…" />
      ) : !currentUser ? (
        <Login />
      ) : !ready ? (
        <LoadingScreen label="Setting things up…" />
      ) : (
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
      )}
    </div>
  )
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted">
      <Loader2 size={24} className="animate-spin text-accent" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

function ApiErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
      <WifiOff size={28} className="text-bad" />
      <p className="text-sm font-medium text-ink">Can't reach the DEALEONE API</p>
      <p className="text-xs text-muted">{message}</p>
      <p className="text-xs text-muted">
        Make sure the API server is running (<code className="text-ink">npm run dev:api</code>)
        and <code className="text-ink">VITE_API_URL</code> points at it, then reload.
      </p>
    </div>
  )
}

export default App
