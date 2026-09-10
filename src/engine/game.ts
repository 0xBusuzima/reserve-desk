import { dutchPrice, licenseFloor, nextMultiplier, resolutionFee, rng } from './math'
import { DEFAULT_PARAMS } from './params'
import type { Params } from './types'

/**
 * Twelve Epochs: run one bank by hand.
 *
 * The rest of this project measures the economy from outside. This puts you
 * inside it, because there is a difference between reading that exits are
 * congestion priced and trying to leave in the middle of a run.
 *
 * It uses the same primitives as the simulator, so nothing here is a
 * simplification for the sake of the game: the licence price is the section 7
 * Dutch curve, the multiplier is the section 5 step, the exit fee is the
 * section 9 quadratic. What is simplified is the world around you, which is
 * one flow sequence rather than a full cohort simulation.
 */

export const EPOCHS = 12

/**
 * One epoch is a month, so a run is the same year the parameter sweep reports
 * on. At the default one day epoch nothing accrues fast enough for a decision
 * to matter inside twelve turns.
 */
export const EPOCH_DAYS = 30

export type Move =
  /** Buy one expansion licence at today's price. Paid from the balance, burned. */
  | { kind: 'expand' }
  /** Do nothing. The clock still runs. */
  | { kind: 'hold' }
  /** Retire branches, liquidating their pro rata share of the balance. */
  | { kind: 'retire'; branches: number }

export interface EpochView {
  epoch: number
  /** Net ETH through the pool this epoch. The bank's only input. */
  netFlowEth: number
  /** The multiplier in force for this epoch's issue. */
  m: number
  regime: 'expansion' | 'contraction'
  /** Branches across the whole system, including yours. */
  systemBranches: number
  yourBranches: number
  /** Unwithdrawn balance at the bank. */
  yourBalance: number
  /** Tokens already in your wallet, net of every fee paid to get them. */
  yourWallet: number
  /** What one licence costs right now. */
  licensePrice: number
  /** Days for a new branch to repay that price. */
  licensePayback: number
  /** The resolution fee a withdrawal would pay this epoch. */
  exitFee: number
  /** What this epoch credited to your balance. */
  earnedThisEpoch: number
  /** Set when the epoch just closed and the market had already moved. */
  note?: string
}

export interface GameResult {
  /** Wallet plus what is still at the bank. */
  finalTokens: number
  /** Everything spent on licences over the run. */
  spentOnLicenses: number
  /** Same run, if you had never expanded and never exited. */
  ifHeld: number
  /** Same run, expanding whenever affordable. */
  ifExpanded: number
  /** Your result over the better of the two naive lines. */
  vsBest: number
  grade: 'ruined' | 'behind' | 'even' | 'ahead' | 'banker'
  /** One line on what actually decided the run. */
  verdict: string
}

export interface GameState {
  params: Params
  seed: number
  epoch: number
  m: number
  systemBranches: number
  yourBranches: number
  yourBalance: number
  yourWallet: number
  spentOnLicenses: number
  /** Tokens withdrawn by everyone, this epoch, driving the exit fee. */
  crowdWithdrawals: number
  /** The fee the year-end settlement paid, once the run is over. */
  closingFee?: number
  history: EpochView[]
  log: string[]
  done: boolean
  result?: GameResult
}

/**
 * The world you play against.
 *
 * Twelve epochs of net flow with a shape the player has to read: an opening
 * run of inflows, a break, then a recovery that may or may not arrive. The
 * seed moves the details, never the fact that the middle is ugly.
 */
function makeFlows(seed: number): number[] {
  const rand = rng(seed)
  // Where the break lands and how deep it goes are what the seed decides, so
  // two runs are the same shape of year without being the same year.
  const breakAt = 3 + Math.floor(rand() * 3)
  const depth = 500 + rand() * 900
  // Roughly two years in five end inside a second wave of outflows, which is
  // the whole reason the exit window is a decision and not a formality.
  const endsBadly = rand() < 0.4
  const out: number[] = []

  for (let i = 0; i < EPOCHS; i++) {
    const jitter = (rand() * 2 - 1) * 320
    let base: number
    if (i < breakAt) base = 700 + rand() * 400
    else if (i < breakAt + 3) base = -depth * (1 - (i - breakAt) / 5)
    else if (i < EPOCHS - 3) base = 200 + (i - breakAt - 3) * 190
    else base = endsBadly ? -420 - (i - (EPOCHS - 3)) * 260 : 420 + (i - (EPOCHS - 3)) * 150
    out.push(base + jitter)
  }
  return out
}

export function newGame(seed = Math.floor(Math.random() * 100000), params = DEFAULT_PARAMS): GameState {
  const state: GameState = {
    params,
    seed,
    epoch: 0,
    m: params.mLaunch,
    // The genesis cohort, before anyone has expanded.
    systemBranches: params.foundingCharters,
    yourBranches: 1,
    yourBalance: 0,
    yourWallet: 0,
    spentOnLicenses: 0,
    crowdWithdrawals: 0,
    history: [],
    log: [],
    done: false,
  }
  // Issuance streams continuously, so by the time you are looking at epoch one
  // you have already accrued it. Without this the opening turn has no move.
  state.yourBalance = epochIssue(state) * (state.yourBranches / state.systemBranches)
  return state
}

/** What the bank issues in one epoch at the current multiplier. */
function epochIssue(s: GameState): number {
  return s.params.baseIssuancePerDay * EPOCH_DAYS * s.m
}

/** What the player is looking at before they choose. */
export function view(state: GameState): EpochView {
  const p = state.params
  const flows = makeFlows(state.seed)
  const netFlowEth = flows[Math.min(state.epoch, EPOCHS - 1)]

  const issue = p.baseIssuancePerDay * EPOCH_DAYS * state.m
  const earned = state.yourBranches > 0 ? (issue * state.yourBranches) / state.systemBranches : 0
  // `earned` is already sitting in yourBalance by the time you see this screen.

  const floor = licenseFloor(p, state.m, state.systemBranches)
  // Section 8 says the day ends near the floor, so licences are priced where
  // they actually clear rather than at the top of the curve.
  const price = dutchPrice(floor * p.licenseOpenMultiple * 2, floor, 18)
  const marginalYield = (p.baseIssuancePerDay * state.m) / (state.systemBranches + 1)

  // Everything the crowd still has at the bank, against what it pulled in the
  // trailing window. Section 9 prices the door by how busy it is.
  const bankHeld = Math.max(1, issue * 9)
  const pressure = Math.min(1, state.crowdWithdrawals / (bankHeld + state.crowdWithdrawals))

  return {
    epoch: state.epoch,
    netFlowEth,
    m: state.m,
    regime: netFlowEth > 0 ? 'expansion' : 'contraction',
    systemBranches: Math.round(state.systemBranches),
    yourBranches: state.yourBranches,
    yourBalance: state.yourBalance,
    yourWallet: state.yourWallet,
    licensePrice: price,
    licensePayback: marginalYield > 0 ? price / marginalYield : Infinity,
    exitFee: resolutionFee(p, pressure),
    earnedThisEpoch: earned,
  }
}

/**
 * Apply one move and advance the clock.
 *
 * `scoreAtEnd` exists because scoring replays the same world under fixed
 * rules to build the counterfactual lines, and those replays must not score
 * themselves or the recursion never bottoms out.
 */
function advance(state: GameState, move: Move, scoreAtEnd: boolean): GameState {
  if (state.done) return state

  const p = state.params
  const s: GameState = { ...state, history: [...state.history], log: [...state.log] }
  const v = view(state)

  // 1. Your move, against the balance the screen actually showed you.
  if (move.kind === 'expand') {
    if (s.yourBranches >= p.maxBranchesPerCharter) {
      s.log.push(`Epoch ${s.epoch + 1}: already at the ten branch cap.`)
    } else if (s.yourBalance < v.licensePrice) {
      s.log.push(`Epoch ${s.epoch + 1}: not enough at the bank for a licence.`)
    } else {
      s.yourBalance -= v.licensePrice
      s.spentOnLicenses += v.licensePrice
      s.yourBranches += 1
      s.systemBranches += 1
      s.log.push(
        `Epoch ${s.epoch + 1}: opened branch ${s.yourBranches}, burned ${Math.round(v.licensePrice).toLocaleString()} $STANDARD.`,
      )
    }
  } else if (move.kind === 'retire') {
    const k = Math.max(0, Math.min(move.branches, s.yourBranches))
    if (k > 0) {
      const released = s.yourBalance * (k / s.yourBranches)
      const fee = released * v.exitFee
      s.yourBalance -= released
      s.yourBranches -= k
      s.systemBranches = Math.max(1, s.systemBranches - k)
      s.yourWallet += released - fee
      s.crowdWithdrawals += released
      s.log.push(
        `Epoch ${s.epoch + 1}: retired ${k} branch${k > 1 ? 'es' : ''} at a ${(v.exitFee * 100).toFixed(0)}% fee, took ${Math.round(released - fee).toLocaleString()}.`,
      )
    }
  }

  // 2. The world moves. Other bankers expand when licences are cheap relative
  //    to yield, and the crowd heads for the door when flow turns negative.
  const crowdExpansion = v.regime === 'expansion' ? 0.06 : 0.01
  s.systemBranches = Math.min(
    p.foundingCharters * p.maxBranchesPerCharter,
    s.systemBranches * (1 + crowdExpansion),
  )
  const issue = p.baseIssuancePerDay * EPOCH_DAYS * s.m
  // The crowd heads for the door on the way down and drifts back once flow
  // turns, so the fee is worst in the middle of the break and cheap either side.
  const panic = v.regime === 'contraction' ? Math.min(1, Math.abs(v.netFlowEth) / 900) : 0
  s.crowdWithdrawals = s.crowdWithdrawals * 0.5 + issue * (0.05 + 1.1 * panic)

  // 3. Policy reads the flow and steps.
  s.m = nextMultiplier(p, s.m, v.netFlowEth)

  s.history.push(v)
  s.epoch += 1

  // 4. The next epoch's issue accrues before you are asked to decide again.
  if (s.epoch < EPOCHS) {
    s.yourBalance += epochIssue(s) * (s.yourBranches / Math.max(1, s.systemBranches))
  }

  if (s.epoch >= EPOCHS) {
    // The year closes. Anything still at the bank is settled at whatever the
    // door costs on the day, which is the point: an accrued balance is not
    // yours until you have paid to take it out.
    if (s.yourBranches > 0 && s.yourBalance > 0) {
      const closing = view({ ...s, epoch: EPOCHS - 1 })
      const fee = s.yourBalance * closing.exitFee
      s.closingFee = closing.exitFee
      s.yourWallet += s.yourBalance - fee
      s.log.push(
        `Year end: the bank settled ${Math.round(s.yourBalance).toLocaleString()} at a ${(closing.exitFee * 100).toFixed(0)}% fee.`,
      )
      s.yourBalance = 0
      s.yourBranches = 0
    }
    s.done = true
    if (scoreAtEnd) s.result = score(s)
  }
  return s
}

export function step(state: GameState, move: Move): GameState {
  return advance(state, move, true)
}

/** Play the whole run with a fixed rule, for the counterfactual lines. */
function playRule(seed: number, params: Params, rule: (v: EpochView) => Move): number {
  let s = newGame(seed, params)
  while (!s.done) s = advance(s, rule(view(s)), false)
  return s.yourWallet
}

function score(s: GameState): GameResult {
  const finalTokens = s.yourWallet

  // Never expanded, let the year end settle it.
  const ifHeld = playRule(s.seed, s.params, () => ({ kind: 'hold' }))
  // Expanded to the cap and rode it to the bell, whatever the door cost then.
  const ifExpanded = playRule(s.seed, s.params, (v) =>
    v.yourBranches < s.params.maxBranchesPerCharter && v.yourBalance > v.licensePrice
      ? { kind: 'expand' }
      : { kind: 'hold' },
  )

  const best = Math.max(ifHeld, ifExpanded)
  const vsBest = best > 0 ? finalTokens / best : 0

  let grade: GameResult['grade']
  if (vsBest >= 0.97) grade = 'banker'
  else if (vsBest >= 0.85) grade = 'ahead'
  else if (vsBest >= 0.55) grade = 'even'
  else if (vsBest >= 0.25) grade = 'behind'
  else grade = 'ruined'

  const verdicts: Record<GameResult['grade'], string> = {
    ruined:
      'Most of the year went to the exit door. Retiring a branch liquidates its share and burns the vehicle that was earning it, so profit taking is not a free action here.',
    behind:
      'Every branch you did not open was a slice of every epoch you did not get. Issuance is split across branches, so standing still is a slow dilution, not a safe position.',
    even:
      'You left a lot on the table by cashing out early. The fee is only half of it; the other half is the issuance the retired branches would have kept earning.',
    ahead:
      'Close to the best line available. Expanding early and leaving the balance at the bank is what the mechanism pays for.',
    banker:
      'That is the best this year had. Expand while licences are cheap, let it accrue, and pay the door once at the end rather than a piece at a time.',
  }

  return {
    finalTokens,
    spentOnLicenses: s.spentOnLicenses,
    ifHeld,
    ifExpanded,
    vsBest,
    grade,
    verdict: verdicts[grade],
  }
}
