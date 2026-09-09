import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PARAMS,
  SCENARIOS,
  defenseCapacity,
  dutchHourForPrice,
  dutchPrice,
  exitCost,
  exitPressure,
  getScenario,
  issuanceBudget,
  licenseFloor,
  licensePayback,
  makeCohorts,
  nextMultiplier,
  resolutionFee,
  runScenario,
  simulate,
  compareRegimes,
  charterSpread,
} from '..'
import { addPol, buy, makePool, sell, spot } from '../pool'
import type { Params } from '../types'

const P = DEFAULT_PARAMS

describe('dutch auction curve (s7.1)', () => {
  it('opens at the start price and lands on the floor', () => {
    expect(dutchPrice(100, 10, 0)).toBeCloseTo(100, 9)
    expect(dutchPrice(100, 10, 24)).toBeCloseTo(10, 9)
  })

  it('decays monotonically', () => {
    let prev = Infinity
    for (let h = 0; h <= 24; h++) {
      const px = dutchPrice(1000, 1, h)
      expect(px).toBeLessThan(prev)
      prev = px
    }
  })

  it('spends most of the day near the floor, because the decay is exponential', () => {
    // Halfway through the day the price is the geometric mean, not the mean.
    expect(dutchPrice(100, 1, 12)).toBeCloseTo(10, 9)
  })

  it('inverts correctly', () => {
    const h = dutchHourForPrice(100, 1, 10)
    expect(dutchPrice(100, 1, h)).toBeCloseTo(10, 6)
  })

  it('clamps outside the day', () => {
    expect(dutchHourForPrice(100, 1, 500)).toBe(0)
    expect(dutchHourForPrice(100, 1, 0.5)).toBe(24)
  })
})

describe('license floor', () => {
  it('is two days of one branch yield by default', () => {
    const f = licenseFloor(P, 1, 1000)
    expect(f).toBeCloseTo((P.baseIssuancePerDay / 1000) * 2, 9)
  })

  it('falls as the system grows, because each branch earns less', () => {
    expect(licenseFloor(P, 1, 5000)).toBeLessThan(licenseFloor(P, 1, 1000))
  })

  it('rises with the multiplier, so licenses cost more in expansion (s5)', () => {
    expect(licenseFloor(P, 2, 1000)).toBeGreaterThan(licenseFloor(P, 0.5, 1000))
  })
})

describe('policy multiplier (s5.2)', () => {
  it('raises on a positive signal and cuts otherwise', () => {
    expect(nextMultiplier(P, 1, 10)).toBeCloseTo(1 + P.rateRaise, 9)
    expect(nextMultiplier(P, 1, -10)).toBeCloseTo(1 - P.rateCut, 9)
    expect(nextMultiplier(P, 1, 0)).toBeCloseTo(1 - P.rateCut, 9)
  })

  it('stays inside the band', () => {
    expect(nextMultiplier(P, P.mMax, 10)).toBe(P.mMax)
    expect(nextMultiplier(P, P.mMin, -10)).toBe(P.mMin)
  })

  it('turns defensive faster than it turns generous', () => {
    expect(P.rateCut).toBeGreaterThan(P.rateRaise)
    const upEpochs = (P.mMax - P.mLaunch) / P.rateRaise
    const downEpochs = (P.mMax - P.mMin) / P.rateCut
    expect(downEpochs).toBeLessThan(upEpochs)
  })
})

describe('resolution fee (s9.1)', () => {
  it('sits at the floor when nobody is leaving', () => {
    expect(resolutionFee(P, 0)).toBeCloseTo(P.resolutionFeeFloor, 9)
  })

  it('saturates at the ceiling and never exceeds it', () => {
    expect(resolutionFee(P, P.resolutionSaturation)).toBeCloseTo(P.resolutionFeeCeiling, 9)
    expect(resolutionFee(P, 1)).toBeCloseTo(P.resolutionFeeCeiling, 9)
  })

  it('is quadratic, so early exits are cheap and late ones are not', () => {
    const half = resolutionFee(P, P.resolutionSaturation / 2)
    const midpoint = (P.resolutionFeeFloor + P.resolutionFeeCeiling) / 2
    expect(half).toBeLessThan(midpoint)
  })

  it('stays under the revocation fee, or going dark becomes the cheap exit (s10)', () => {
    expect(P.resolutionFeeCeiling).toBeLessThan(P.revocationFee)
  })

  it('is monotonically non-decreasing in pressure', () => {
    let prev = -1
    for (let i = 0; i <= 50; i++) {
      const f = resolutionFee(P, i / 50)
      expect(f).toBeGreaterThanOrEqual(prev)
      prev = f
    }
  })
})

describe('exit pressure', () => {
  it('is zero when nothing has been withdrawn', () => {
    expect(exitPressure(0, 1_000_000)).toBe(0)
  })

  it('approaches one as the bank empties', () => {
    expect(exitPressure(1_000_000, 0)).toBeCloseTo(1, 6)
  })

  it('is bounded to [0,1]', () => {
    expect(exitPressure(5, 1)).toBeLessThanOrEqual(1)
    expect(exitPressure(-5, 1)).toBeGreaterThanOrEqual(0)
  })
})

describe('a run transfers value from the impatient to the patient (s9)', () => {
  it('pays stayers more the harder the run', () => {
    const mild = runScenario(P, 10_000_000, 0.05)
    const hard = runScenario(P, 10_000_000, 0.4)
    expect(hard.feeRate).toBeGreaterThan(mild.feeRate)
    expect(hard.stayerYield).toBeGreaterThan(mild.stayerYield)
  })

  it('burns exactly half of what it redistributes', () => {
    const r = runScenario(P, 10_000_000, 0.3)
    expect(r.burned).toBeCloseTo(r.toStayers, 9)
    expect(r.burned + r.toStayers).toBeCloseTo(r.feePaid, 9)
  })

  it('never lets an exiter keep more than the balance they released', () => {
    const e = exitCost({
      params: P,
      bankBalance: 5_000_000,
      yourBalance: 100_000,
      yourBranches: 10,
      retiring: 10,
      withdrawn7d: 2_000_000,
    })
    expect(e.net).toBeLessThan(e.released)
    expect(e.net + e.fee).toBeCloseTo(e.released, 9)
    expect(e.dissolvesCharter).toBe(true)
  })

  it('liquidates pro rata: one branch of ten is one tenth', () => {
    const e = exitCost({
      params: P,
      bankBalance: 5_000_000,
      yourBalance: 100_000,
      yourBranches: 10,
      retiring: 1,
      withdrawn7d: 0,
    })
    expect(e.released).toBeCloseTo(10_000, 9)
    expect(e.dissolvesCharter).toBe(false)
  })
})

describe('buyback throttle (s11.1)', () => {
  it('bounds daily spend near 5% of depth at launch settings', () => {
    const d = defenseCapacity(P, 1_000_000, 1_000)
    // 24 ticks x 0.002 of depth = 4.8%.
    expect(d.shareOfDepth).toBeGreaterThan(0.04)
    expect(d.shareOfDepth).toBeLessThan(0.05)
  })

  it('is vault-bound when the vault is thin', () => {
    const d = defenseCapacity(P, 1, 1_000_000)
    expect(d.dailySpendEth).toBeLessThan(1)
  })

  it('never spends more than the vault holds', () => {
    const d = defenseCapacity(P, 100, 1_000_000)
    expect(d.dailySpendEth).toBeLessThanOrEqual(100 + 1e-9)
  })
})

describe('the pool', () => {
  it('buying raises the price, selling lowers it', () => {
    const pool = makePool(300, 100_000_000)
    const before = spot(pool)
    buy(pool, 10, 100)
    expect(spot(pool)).toBeGreaterThan(before)
    const mid = spot(pool)
    sell(pool, 5_000_000, 100)
    expect(spot(pool)).toBeLessThan(mid)
  })

  it('charges the fee in ETH on both sides', () => {
    const a = makePool(300, 100_000_000)
    expect(buy(a, 10, 100).feeEth).toBeCloseTo(0.1, 9)
    const b = makePool(300, 100_000_000)
    expect(sell(b, 1_000_000, 100).feeEth).toBeGreaterThan(0)
  })

  it('POL only ever adds depth', () => {
    const pool = makePool(300, 100_000_000)
    const kBefore = pool.eth * pool.std
    addPol(pool, 20)
    expect(pool.eth * pool.std).toBeGreaterThan(kBefore)
  })
})

describe('license payback calculator', () => {
  it('is cheaper later in the day', () => {
    const r = licensePayback({ params: P, branches: 1200, m: 1, lastClearingPrice: 5_000 })
    expect(r.curve[0].paybackDays).toBeGreaterThan(r.curve[24].paybackDays)
  })

  it('finds the hour a target payback becomes available', () => {
    const r = licensePayback({ params: P, branches: 1200, m: 1, lastClearingPrice: 5_000 })
    const target = 6
    const hour = r.hourForTarget(target)
    expect(hour).not.toBeNull()
    const px = dutchPrice(r.open, r.floor, hour as number)
    expect(px / r.marginalYield).toBeCloseTo(target, 4)
  })

  it('reports the floor as exactly the configured days of yield', () => {
    const r = licensePayback({ params: P, branches: 1200, m: 1, lastClearingPrice: 0 })
    const floorPayback = r.floor / ((P.baseIssuancePerDay * 1) / 1200)
    expect(floorPayback).toBeCloseTo(P.licenseFloorDaysOfYield, 6)
  })
})

// ---------------------------------------------------------------------------
// Whole-economy invariants. These are the reason the engine exists: whatever
// the parameters, the accounting has to hold.
// ---------------------------------------------------------------------------

function run(params: Params = P, scenarioId = 'chop', days = 240) {
  const flows = getScenario(scenarioId).generate(days, 42)
  return simulate({ params, cohorts: makeCohorts(params.foundingCharters), flows })
}

describe('simulation invariants', () => {
  for (const s of SCENARIOS) {
    it(`holds under "${s.label}"`, () => {
      const r = run(P, s.id, 240)
      expect(r.violations).toEqual([])
      expect(r.days).toHaveLength(240)

      let prevMax = Infinity
      for (const d of r.days) {
        // (3.2) max supply is strictly non-increasing.
        expect(d.maxSupply).toBeLessThanOrEqual(prevMax + 1e-6)
        prevMax = d.maxSupply
        // Nothing goes negative.
        expect(d.circulating).toBeGreaterThanOrEqual(-1e-6)
        expect(d.bankBalance).toBeGreaterThanOrEqual(-1e-6)
        expect(d.poolEth).toBeGreaterThan(0)
        expect(d.poolStd).toBeGreaterThan(0)
        // Policy stays inside its band.
        expect(d.m).toBeGreaterThanOrEqual(P.mMin - 1e-9)
        expect(d.m).toBeLessThanOrEqual(P.mMax + 1e-9)
        // Fees are a fraction.
        expect(d.resolutionFee).toBeGreaterThanOrEqual(P.resolutionFeeFloor - 1e-9)
        expect(d.resolutionFee).toBeLessThanOrEqual(P.resolutionFeeCeiling + 1e-9)
      }
    })
  }

  it('never issues more than the 900M budget', () => {
    const r = run(P, 'melt-up', 400)
    const last = r.days[r.days.length - 1]
    expect(last.issuedCumulative).toBeLessThanOrEqual(issuanceBudget(P) + 1e-6)
  })

  it('stops issuing permanently once the budget is spent', () => {
    const fast: Params = { ...P, baseIssuancePerDay: 400_000_000 }
    const r = run(fast, 'melt-up', 40)
    const exhausted = r.days.findIndex((d) => d.budgetExhausted)
    expect(exhausted).toBeGreaterThan(0)
    for (const d of r.days.slice(exhausted)) {
      expect(d.yieldPerBranch).toBeCloseTo(0, 6)
    }
  })

  it('respects the branch cap for every cohort', () => {
    const r = run(P, 'melt-up', 300)
    for (const c of r.cohorts) {
      expect(c.branches).toBeLessThanOrEqual(c.chartersAlive * P.maxBranchesPerCharter)
    }
  })

  it('burns something on every path through the economy (s2)', () => {
    for (const s of SCENARIOS) {
      const r = run(P, s.id, 200)
      expect(r.days[r.days.length - 1].burned).toBeGreaterThan(0)
    }
  })

  it('routes fees to the contraction vault when flow turns negative', () => {
    const r = run(P, 'bank-run', 120)
    const duringRun = r.days.slice(60, 74)
    expect(duringRun.some((d) => d.regime === 'contraction')).toBe(true)
    expect(r.days[119].contractionVaultEth + r.days[119].buybackEth).toBeGreaterThan(0)
  })

  it('cuts the multiplier during the run and does not instantly recover', () => {
    const r = run(P, 'bank-run', 120)
    const preRun = r.days[59].m
    const inRun = Math.min(...r.days.slice(62, 74).map((d) => d.m))
    expect(inRun).toBeLessThan(preRun)
  })

  it('revokes ghosts once the dormancy window passes', () => {
    const r = run(P, 'chop', 120)
    const ghosts = r.cohorts.find((c) => c.id === 'ghost')!
    expect(ghosts.chartersAlive).toBe(0)
    expect(ghosts.branches).toBe(0)
    // They keep 30% of the balance, so they are not wiped out, only removed.
    expect(ghosts.realized).toBeGreaterThan(0)
  })

  it('pays stayers: someone receives the redistributed half of exit fees', () => {
    const r = run(P, 'bank-run', 160)
    const total = r.cohorts.reduce((a, c) => a + c.redistributionsReceived, 0)
    expect(total).toBeGreaterThan(0)
  })

  it('is deterministic for a given seed', () => {
    const a = run(P, 'chop', 120)
    const b = run(P, 'chop', 120)
    expect(a.days[119]).toEqual(b.days[119])
  })
})

describe('parameter sanity guards', () => {
  it('survives a zero-issuance economy without dividing by zero', () => {
    const r = run({ ...P, baseIssuancePerDay: 0 }, 'chop', 60)
    expect(r.violations).toEqual([])
    expect(r.days.every((d) => Number.isFinite(d.yieldPerBranch))) .toBe(true)
  })

  it('survives licenses being switched off', () => {
    const r = run({ ...P, licensesPerDay: 0 }, 'melt-up', 120)
    expect(r.violations).toEqual([])
    // With no auction the branch count can only fall, as harvesters retire.
    expect(r.days[119].branches).toBeLessThanOrEqual(r.days[0].branches)
    for (const d of r.days) expect(d.licensesSold).toBe(0)
  })

  it('produces finite numbers everywhere, in every scenario', () => {
    for (const s of SCENARIOS) {
      const r = run(P, s.id, 180)
      for (const d of r.days) {
        for (const [k, v] of Object.entries(d)) {
          if (typeof v === 'number') {
            expect(Number.isFinite(v), `${s.id} day ${d.day} field ${k}`).toBe(true)
          }
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Published findings. These back claims made on the site, so they are asserted
// rather than left to a one-off script.
// ---------------------------------------------------------------------------

describe('the policy signal reads sign, not size', () => {
  it('rewards a consistent trickle over a larger but choppy inflow', () => {
    const [chop, bleed] = compareRegimes(P, ['chop', 'slow-bleed'], 365, 12)

    // Chop takes in materially more capital than the bleed does. Sells are
    // capped at the float outside the pool, so a scenario cannot always
    // express the outflow it wants, and realised flow is what policy reads.
    expect(chop.realisedEth).toBeGreaterThan(bleed.realisedEth)

    // And is paid less for it, because the multiplier steps on the sign of
    // the two epoch signal and never on its magnitude. Chop flips sign
    // constantly and gives back three times more per cut than it earns per
    // raise; the bleed drifts one way and ratchets up.
    expect(chop.issued).toBeLessThan(bleed.issued)
    expect(chop.meanM).toBeLessThan(bleed.meanM)
  })

  it('is the sign rule doing it, not the scenario shapes', () => {
    // Equalise the step sizes and the gap narrows sharply. It does not close,
    // because a sign rule is still blind to how much capital moved.
    const symmetric: Params = { ...P, rateCut: 0.05, rateRaise: 0.05 }
    const [chopA, bleedA] = compareRegimes(P, ['chop', 'slow-bleed'], 365, 12)
    const [chopB, bleedB] = compareRegimes(symmetric, ['chop', 'slow-bleed'], 365, 12)

    const gapAsymmetric = bleedA.meanM - chopA.meanM
    const gapSymmetric = bleedB.meanM - chopB.meanM
    expect(gapSymmetric).toBeLessThan(gapAsymmetric)
  })
})

describe('what a Founding Charter is worth', () => {
  it('finds expanding beats holding across every parameter set it sweeps', () => {
    const s = charterSpread(P)
    expect(s.runs).toBeGreaterThan(10)
    expect(s.everBeatenPct).toBe(100)
    expect(s.worst).toBeGreaterThan(1)
  })

  it('is bounded by the ten branch cap, not by the base rate', () => {
    // The spread is a ratio of shares, so scaling issuance by six should move
    // it very little. That is the whole reason the number is publishable while
    // the launch parameters are not.
    const slow = charterSpread({ ...P, baseIssuancePerDay: 100_000 })
    const fast = charterSpread({ ...P, baseIssuancePerDay: 600_000 })
    expect(Math.abs(slow.median - fast.median)).toBeLessThan(2)
    expect(slow.median).toBeLessThan(P.maxBranchesPerCharter)
    expect(fast.median).toBeLessThan(P.maxBranchesPerCharter)
  })

  it('dilutes a charter that never expands', () => {
    const s = charterSpread(P)
    // Branches grow well past the 1,000 the genesis cohort starts with, so a
    // single branch charter holds a steadily smaller slice of each epoch.
    expect(s.medianBranches).toBeGreaterThan(P.foundingCharters * 2)
  })
})
