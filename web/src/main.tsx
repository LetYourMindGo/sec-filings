import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// The server caches and retries EDGAR itself, so a failed API call is shown at once rather than retried.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
