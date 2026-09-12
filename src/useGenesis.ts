import { useEffect, useState } from 'react'
import { GENESIS_ALLOCATED, GENESIS_CHECKED, GENESIS_TOTAL } from './config'

/**
 * Genesis mint progress, read at runtime.
 *
 * The count is refreshed by a scheduled job that reads the official mint page
 * and commits public/genesis.json, so the page picks up a new number without
 * anyone editing the source. See scripts/fetch-genesis.mjs.
 *
 * The values compiled into config.ts are the fallback: if the fetch fails, is
 * blocked, or the file is missing, the page still renders a real number and
 * says plainly that it is the built in one.
 */
export interface Genesis {
  total: number
  allocated: number
  /** ISO timestamp of the last successful read of the official page. */
  checkedAt: string
  /** Where the number came from. */
  source?: string
  /** 'live' once the published snapshot has loaded, 'built in' until then. */
  origin: 'live' | 'built in'
}

const FALLBACK: Genesis = {
  total: GENESIS_TOTAL,
  allocated: GENESIS_ALLOCATED,
  checkedAt: GENESIS_CHECKED,
  origin: 'built in',
}

export function useGenesis(): Genesis {
  const [genesis, setGenesis] = useState<Genesis>(FALLBACK)

  useEffect(() => {
    let live = true
    const url = `${import.meta.env.BASE_URL}genesis.json`

    fetch(url, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: unknown) => {
        if (!live) return
        const g = d as Partial<Genesis>
        // Trust the snapshot only if it is internally coherent.
        if (
          typeof g.total !== 'number' ||
          typeof g.allocated !== 'number' ||
          !Number.isFinite(g.total) ||
          !Number.isFinite(g.allocated) ||
          g.total <= 0 ||
          g.allocated < 0 ||
          g.allocated > g.total
        ) {
          return
        }
        setGenesis({
          total: g.total,
          allocated: g.allocated,
          checkedAt: typeof g.checkedAt === 'string' ? g.checkedAt : FALLBACK.checkedAt,
          source: typeof g.source === 'string' ? g.source : undefined,
          origin: 'live',
        })
      })
      .catch(() => {
        // Keep the fallback. Nothing here is worth an error state.
      })

    return () => {
      live = false
    }
  }, [])

  return genesis
}

/** "3 minutes ago", "2 days ago", or a date once it is older than a month. */
export function since(iso: string): string {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return iso
  const mins = Math.round((Date.now() - then) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days <= 31) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(then).toISOString().slice(0, 10)
}

/**
 * The published parameter sweep behind the charter finding.
 *
 * The full sweep is 2,430 simulations, far too slow to run in a page, so it is
 * measured by scripts/measure-findings.mjs and shipped as a snapshot. The app
 * still recomputes a small version live, which is what moves when you change
 * the parameters, but the headline number here is the published one so the
 * page and the share cards never quote different figures.
 */
export interface PublishedSweep {
  runs: number
  worst: number
  median: number
  everBeatenPct: number
  medianBranches: number
  parameterSets: number
}

export function usePublishedSweep(): PublishedSweep | null {
  const [sweep, setSweep] = useState<PublishedSweep | null>(null)

  useEffect(() => {
    let live = true
    fetch(`${import.meta.env.BASE_URL}findings.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: any) => {
        if (!live) return
        const c = d?.charter
        if (!c || typeof c.median !== 'number' || !Number.isFinite(c.median)) return
        setSweep({
          runs: c.runs,
          worst: c.worst,
          median: c.median,
          everBeatenPct: c.everBeatenPct,
          medianBranches: c.medianBranches,
          parameterSets: d.charterGrid ?? 0,
        })
      })
      .catch(() => {
        // Fall back to the live sweep the page computes for itself.
      })
    return () => {
      live = false
    }
  }, [])

  return sweep
}


/**
 * Whether the whitepaper's launch parameter table is still redacted.
 *
 * Refreshed by scripts/watch-whitepaper.mjs on the same schedule as the mint
 * count. The moment those fifteen values stop being blank bars, everything on
 * this page marked as an assumption can be replaced with the real number, and
 * the banner is how you find out.
 */
export interface WhitepaperWatch {
  redacted: boolean
  parameters: number
  redactedCount: number
  publishedLabels: string[]
  checkedAt: string
}

export function useWhitepaperWatch(): WhitepaperWatch | null {
  const [watch, setWatch] = useState<WhitepaperWatch | null>(null)

  useEffect(() => {
    let live = true
    fetch(`${import.meta.env.BASE_URL}whitepaper.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: any) => {
        if (!live) return
        if (typeof d?.redactedCount !== 'number') return
        setWatch({
          redacted: !!d.redacted,
          parameters: d.parameters ?? 0,
          redactedCount: d.redactedCount,
          publishedLabels: Array.isArray(d.publishedLabels) ? d.publishedLabels : [],
          checkedAt: typeof d.checkedAt === 'string' ? d.checkedAt : '',
        })
      })
      .catch(() => {
        // No banner rather than a wrong one.
      })
    return () => {
      live = false
    }
  }, [])

  return watch
}

/** Time left until `iso`, refreshed every second while it matters. */
export function useCountdown(iso: string): { days: number; hours: number; mins: number; secs: number; past: boolean } {
  const target = Date.parse(iso)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const left = Math.max(0, target - now)
  return {
    days: Math.floor(left / 86400000),
    hours: Math.floor((left % 86400000) / 3600000),
    mins: Math.floor((left % 3600000) / 60000),
    secs: Math.floor((left % 60000) / 1000),
    past: left <= 0,
  }
}
