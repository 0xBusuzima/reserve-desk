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

/**
 * Launch, announced by the team on 11 September 2026: "The Standard Reserve is
 * coming on September 14. Both audits have found 0 critical vulnerabilities."
 * No hour was given, so the countdown runs to midnight UTC and says so.
 */
export const LAUNCH_ISO = '2026-09-14T00:00:00Z'

export const LINKS = {
  site: 'https://www.standardreserve.xyz/',
  protocol: 'https://www.standardreserve.xyz/app/protocol/',
  whitepaper: 'https://www.standardreserve.xyz/whitepaper/',
  mint: 'https://www.standardreserve.xyz/app/mint/',
  x: 'https://x.com/standard_rsv',
  launchPost: 'https://x.com/standard_rsv/status/2098183945926119589',
  repo: 'https://github.com/0xBusuzima/reserve-desk',
}
