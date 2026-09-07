/**
 * Facts about the live protocol that cannot be derived, only observed.
 *
 * The Standard Reserve is pre-launch: no token, no NFT, no contracts. There is
 * therefore nothing on chain to read, and these numbers are transcribed by
 * hand from the official site. Update them here when they move.
 */

/** Founding Charters in the genesis mint. Whitepaper §6. */
export const GENESIS_TOTAL = 1_000

/** Spots allocated so far, per standardreserve.xyz/app/mint. */
export const GENESIS_ALLOCATED = 125

/** When the number above was last checked, ISO date. */
export const GENESIS_CHECKED = '2026-09-08'

export const LINKS = {
  site: 'https://www.standardreserve.xyz/',
  protocol: 'https://www.standardreserve.xyz/app/protocol/',
  whitepaper: 'https://www.standardreserve.xyz/whitepaper/',
  mint: 'https://www.standardreserve.xyz/app/mint/',
  x: 'https://x.com/standard_rsv',
  repo: 'https://github.com/0xBusuzima/reserve-desk',
}
