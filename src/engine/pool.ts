/**
 * A constant-product model of the single ETH <> $STANDARD market.
 *
 * The real market is a hooked Uniswap v4 pool with a full-range,
 * protocol-owned position. Full range means the position behaves like a v2
 * curve across the whole price domain, so x*y=k is the right first-order
 * model for it: it gets depth, slippage and the direction of price impact
 * right, which is what the buyback throttle and the exit path depend on.
 *
 * What it does NOT model: concentrated third-party liquidity, MEV, or the
 * hook's own accounting. Treat price paths as directionally honest and
 * quantitatively soft.
 */
export interface Pool {
  /** ETH reserve. */
  eth: number
  /** $STANDARD reserve. */
  std: number
}

export function makePool(eth: number, std: number): Pool {
  return { eth, std }
}

/** Spot price in ETH per $STANDARD. */
export function spot(pool: Pool): number {
  if (pool.std <= 0) return 0
  return pool.eth / pool.std
}

/**
 * Swap ETH in for $STANDARD out. `feeBps` is taken off the input before it
 * touches the curve; the fee itself is returned separately because the hook
 * routes it to the bank rather than to liquidity providers.
 */
export function buy(pool: Pool, ethIn: number, feeBps: number): { stdOut: number; feeEth: number } {
  if (ethIn <= 0) return { stdOut: 0, feeEth: 0 }
  const feeEth = (ethIn * feeBps) / 10_000
  const net = ethIn - feeEth
  const k = pool.eth * pool.std
  const newEth = pool.eth + net
  const newStd = k / newEth
  const stdOut = pool.std - newStd
  pool.eth = newEth
  pool.std = newStd
  return { stdOut, feeEth }
}

/**
 * Swap $STANDARD in for ETH out. The fee is taken off the ETH leaving, so
 * fee revenue is denominated in ETH on both sides of the book, which is what
 * makes fee flow direction-agnostic (section 13, flywheel 03).
 */
export function sell(pool: Pool, stdIn: number, feeBps: number): { ethOut: number; feeEth: number } {
  if (stdIn <= 0) return { ethOut: 0, feeEth: 0 }
  const k = pool.eth * pool.std
  const newStd = pool.std + stdIn
  const newEth = k / newStd
  const gross = pool.eth - newEth
  const feeEth = (gross * feeBps) / 10_000
  pool.eth = newEth
  pool.std = newStd
  return { ethOut: gross - feeEth, feeEth }
}

/**
 * Sell a given ETH notional worth of $STANDARD. Scenario flows are quoted in
 * ETH on both sides, so a sell has to be converted to a token amount at the
 * prevailing spot before it hits the curve.
 *
 * `maxStdIn` caps the sell at the tokens that actually exist outside the pool.
 * Without it a scenario could conjure supply out of nothing: at genesis the
 * entire float IS the pool, so there is literally nothing to sell until
 * someone buys or a banker withdraws. That constraint is not a modelling
 * nicety. It is why a run cannot start on day one.
 */
export function sellForEthNotional(
  pool: Pool,
  ethNotional: number,
  feeBps: number,
  maxStdIn = Infinity,
): { ethOut: number; feeEth: number; stdIn: number } {
  const px = spot(pool)
  if (px <= 0 || ethNotional <= 0) return { ethOut: 0, feeEth: 0, stdIn: 0 }
  const stdIn = Math.min(ethNotional / px, Math.max(0, maxStdIn))
  if (stdIn <= 0) return { ethOut: 0, feeEth: 0, stdIn: 0 }
  const r = sell(pool, stdIn, feeBps)
  return { ...r, stdIn }
}

/**
 * The protocol's own buyback: ETH in, tokens out, tokens burned. No fee is
 * charged, because the bank paying itself a fee is a no-op.
 */
export function buybackAndBurn(pool: Pool, ethIn: number): number {
  const { stdOut } = buy(pool, ethIn, 0)
  return stdOut
}

/**
 * Add protocol-owned liquidity: half the ETH is swapped to $STANDARD, the two
 * legs are paired, and the position is added forever. Returns the tokens the
 * swap leg pulled out of the pool, which re-enter it immediately as the paired
 * side, so POL adds depth without changing spot.
 */
export function addPol(pool: Pool, ethIn: number): { ethAdded: number; stdAdded: number } {
  if (ethIn <= 0) return { ethAdded: 0, stdAdded: 0 }
  const half = ethIn / 2
  const { stdOut } = buy(pool, half, 0)
  pool.eth += half
  pool.std += stdOut
  return { ethAdded: half, stdAdded: stdOut }
}
