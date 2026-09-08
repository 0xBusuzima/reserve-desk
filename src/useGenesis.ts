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
