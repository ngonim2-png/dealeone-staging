import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AppProvider } from './context/AppContext.tsx'
import { ToastProvider } from './components/Toast.tsx'
import { captureReferralFromUrl } from './lib/referral.ts'

// Remember an invite code from the link this app was opened with, before anything routes.
captureReferralFromUrl()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ToastProvider>
        <AppProvider>
          <App />
        </AppProvider>
      </ToastProvider>
    </HashRouter>
  </StrictMode>,
)
