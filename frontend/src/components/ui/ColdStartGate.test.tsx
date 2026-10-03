import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ColdStartGate } from './ColdStartGate'

type FetchResult = { ok: boolean; status: number; json: () => Promise<unknown> }

/** Stub global fetch: only /health/ready matters to the gate. */
function stubHealthReady(results: Array<'reject' | FetchResult>) {
  const queue = [...results]
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      const next = queue.length > 1 ? queue.shift()! : queue[0]
      if (next === 'reject') return Promise.reject(new TypeError('Failed to fetch'))
      return Promise.resolve(next as FetchResult)
    }),
  )
}

const READY: FetchResult = {
  ok: true,
  status: 200,
  json: () => Promise.resolve({ status: 'ok', ready: true, checks: { database: 'ok' } }),
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ColdStartGate (app-level cold-start screen)', () => {
  it('explains the Render free-tier wake-up while the backend sleeps', async () => {
    stubHealthReady(['reject'])
    render(
      <ColdStartGate explainAfterMs={1}>
        <div>app content</div>
      </ColdStartGate>,
    )
    await waitFor(() =>
      expect(screen.getByText(/Render.s free tier/)).toBeInTheDocument(),
    )
    expect(screen.getByText(/First start takes about a minute/)).toBeInTheDocument()
    expect(screen.getByText(/s elapsed/)).toBeInTheDocument()
    // Never looks like a crash while waking.
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
  })

  it('shows only the brand splash before the explanation delay', async () => {
    stubHealthReady(['reject'])
    render(
      <ColdStartGate explainAfterMs={60_000}>
        <div>app content</div>
      </ColdStartGate>,
    )
    await waitFor(() =>
      expect(screen.getByText(/Connecting to the TRINETRA backend/)).toBeInTheDocument(),
    )
    expect(screen.queryByText(/First start takes about a minute/)).not.toBeInTheDocument()
  })

  it('clears and renders the app once the backend reports ready', async () => {
    stubHealthReady([READY])
    render(
      <ColdStartGate>
        <div>app content</div>
      </ColdStartGate>,
    )
    await waitFor(() => expect(screen.getByText('app content')).toBeInTheDocument())
    expect(screen.queryByText(/First start takes about a minute/)).not.toBeInTheDocument()
  })

  it('offers retry after the wake-up window times out, then recovers', async () => {
    // Initial probe consumes the reject and declares down; the retry consumes READY.
    stubHealthReady(['reject', READY])
    render(
      <ColdStartGate explainAfterMs={1} pollMs={5} maxAttempts={1}>
        <div>app content</div>
      </ColdStartGate>,
    )
    await waitFor(() =>
      expect(screen.getByText(/Taking longer than expected/)).toBeInTheDocument(),
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Retry connection/i }))
    await waitFor(() => expect(screen.getByText('app content')).toBeInTheDocument())
  })
})
