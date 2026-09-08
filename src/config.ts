/**
 * Facts about the live protocol that cannot be derived, only observed.
 *
 * The Standard Reserve is pre launch: no token, no NFT, no contracts, so there
 * is nothing on chain to read. The live number comes from public/genesis.json,
 * refreshed by scripts/fetch-genesis.mjs on a schedule. The constants below
 * are the fallback used before that file loads, or if it cannot be reached.
 */

/** Founding Charters in the genesis mint. Whitepaper §6. */
export const GENESIS_TOTAL = 1_000

/** Fallback spots allocated, per standardreserve.xyz/app/mint. */
export const GENESIS_ALLOCATED = 350

/** When the fallback above was last checked, ISO date. */
export const GENESIS_CHECKED = '2026-09-08'

export const LINKS = {
  site: 'https://www.standardreserve.xyz/',
  protocol: 'https://www.standardreserve.xyz/app/protocol/',
  whitepaper: 'https://www.standardreserve.xyz/whitepaper/',
  mint: 'https://www.standardreserve.xyz/app/mint/',
  x: 'https://x.com/standard_rsv',
  repo: 'https://github.com/0xBusuzima/reserve-desk',
}
