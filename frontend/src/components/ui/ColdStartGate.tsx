import { useEffect, useState, type ReactNode } from 'react'
import { useBackendReady } from '../../hooks/useHealth'

/**
 * App-level cold-start gate (docs/DEMO_RUNBOOK.md §6).
 *
 * On first load the whole app waits behind this screen while
 * /api/v1/health/ready is polled. A warm backend clears it in well under a
 * second (it doubles as a brief brand splash); a sleeping Render free-tier
 * backend keeps it up for the wake — with an honest explanation of WHY the
 * first start is slow, and a real elapsed timer. No fake progress bars: the
 * service wakes when it wakes, and the screen says so.
 *
 * The free-tier explanation and brand mark are static and intentionally kept
 * out of the screen-reader live region. Only the elapsed-time line is live,
 * so a 30–60 s cold start does not re-announce the same sentence to AT.
 *
 * Page-level `BackendGate` remains as the mid-session fallback if the
 * backend drops after the app has already loaded.
 */
export function ColdStartGate({
  children,
  explainAfterMs = 2500,
  pollMs,
  maxAttempts,
}: {
  children: ReactNode
  /** Show the full free-tier explanation after this delay; before that only the brand splash (warm backends never see it). */
  explainAfterMs?: number
  /** Forwarded to useBackendReady (tests tune these). */
  pollMs?: number
  maxAttempts?: number
}) {
  const { status, attempt, lastError, recheck } = useBackendReady({ pollMs, maxAttempts })

  if (status === 'ready') return <>{children}</>
  return (
    <ColdStartScreen
      timedOut={status === 'down'}
      attempt={attempt}
      lastError={lastError}
      explainAfterMs={explainAfterMs}
      onRetry={recheck}
    />
  )
}

function useElapsedSeconds(): number {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])
  return elapsed
}

export function ColdStartScreen({
  timedOut,
  attempt,
  lastError,
  explainAfterMs,
  onRetry,
}: {
  timedOut: boolean
  attempt: number
  lastError: string | null
  explainAfterMs: number
  onRetry: () => void
}) {
  const elapsed = useElapsedSeconds()
  const [showExplanation, setShowExplanation] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShowExplanation(true), explainAfterMs)
    return () => clearTimeout(t)
  }, [explainAfterMs])

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 py-12 text-center"
    >
      {/* Brand — static, outside any live region so a long wait does not repeat it to AT */}
      <p className="section-title">System boot</p>
      <h1 className="mt-3 font-serif text-[32px] font-semibold leading-none tracking-tight">
        TRINETRA
      </h1>
      <p className="mt-2 text-meta text-ink-faint">MPLADS Risk Intelligence &amp; Investigation Platform</p>
      <p className="mt-1 font-plex text-[12.5px] font-medium text-accent">Detect. Investigate. Verify.</p>

      {/* Indeterminate activity — honest: no fake progress percentage */}
      <div className="mt-8 h-[3px] w-44 animate-pulse bg-accent/40" aria-hidden />

      {timedOut ? (
        /* Final failure: assertive so the retry choice is announced once. */
        <div role="alert" className="mt-8 max-w-md">
          <p className="font-plex text-[14px] font-semibold text-vermilion">
            Taking longer than expected
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
            The wake-up window timed out. The backend may still be asleep or briefly
            unavailable — that happens on free hosting. Retrying usually connects within
            a minute.
          </p>
          {lastError && <p className="num mt-2 text-[11px] text-ink-faint">{lastError}</p>}
          <button type="button" className="btn btn-primary mt-4" onClick={onRetry}>
            Retry connection
          </button>
          <p className="mt-4 text-meta text-ink-faint">
            Operators: wake the service with <span className="num">scripts/prewarm-demo.py</span> —
            docs/DEMO_RUNBOOK.md §6.
          </p>
        </div>
      ) : (
        <div className="mt-8 max-w-md">
          {showExplanation ? (
            <>
              <p className="font-plex text-[14px] font-semibold text-ink">First start takes about a minute</p>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
                TRINETRA&rsquo;s backend runs on Render&rsquo;s free tier, which spins the
                service down when idle. It is waking up now — no action is needed. This
                screen clears by itself the moment TRINETRA is ready.
              </p>
            </>
          ) : (
            <p className="text-[13px] text-ink-soft">Connecting to the TRINETRA backend…</p>
          )}
          {/* Only the changing timer line is live; the explanation paragraph is static
              and intentionally outside the live region — a 60 s cold start would otherwise
              re-announce the same sentence to AT. */}
          <p className="num mt-3 text-[11px] text-ink-faint" aria-live="polite" aria-atomic="true">
            {elapsed}s elapsed · polling backend readiness{attempt > 0 ? ` · attempt ${attempt}` : ''}
          </p>
        </div>
      )}
    </div>
  )
}
