# Methodology

How Reserve Desk turns whitepaper v0.1 into an executable model, what I had to assume, and where the whitepaper is genuinely ambiguous.

Source: [standardreserve.xyz/whitepaper](https://www.standardreserve.xyz/whitepaper/), retrieved 8 September 2026.

---

## 1. The central problem

The whitepaper is unusually complete on mechanism. Sections 2 through 13 specify the entities, the signal, the shape of the policy rule, the auction format, the shape of the exit fee, dormancy, the fee split, and the buyback throttle. Section 14 then presents a "Launch parameters" table in which **every value is blank**, followed by: *"Final parameters will be announced closer to launch."*

That is a defensible disclosure choice, since publishing a rate before an audit finishes invites gaming, but it means the document is, as economics, unfalsifiable. The same mechanism is a reasonable ten year emission or a three month farm depending entirely on one redacted number.

The design of Reserve Desk follows from that. It does not guess the parameters and present the result as truth. It makes the parameters the interface, tags every one with its provenance, and reports what follows.

---

## 2. What is stated, and what is not

### Stated verbatim

| Quantity | Value | Section |
| --- | --- | --- |
| Hard cap | 1,000,000,000 $STANDARD, 18 decimals | 3 |
| Genesis pre mint | 100,000,000, full range protocol owned liquidity, never withdrawable | 3 |
| Issuance budget | 900,000,000; base issuance stops permanently on exhaustion | 3 |
| Founding Charters | 1,000, free, allowlist plus public, one per wallet | 6 |
| Branches per charter | 1 to 10 | 7 |
| Expansion licenses | initially 100 per day | 7 |
| Per charter license limit | 3 per day | 8 |
| License payment | $STANDARD, 100% burned | 7 |
| License open | 2× yesterday's closing sale | 8 |
| Charter open | 3× yesterday's closing sale | 8 |
| Charter auctions per day | starts at zero, policy controlled | 6, 8 |
| Signal | `signalₙ = Fₙ₋₁ + Fₙ₋₂`, where `Fₙ = buys − sells` in ETH | 4 |
| Fee routing trigger | `sign(Fₙ)` of the current epoch | 4 |
| Fee split | 70% active vault / 15% protocol owned liquidity / 15% team | 11 |
| Buyback throttle | `spend_tick = min(0.10·V, 0.002·R)`, hourly | 11 |
| Exit window | trailing 7 days | 9 |
| Resolution fee split | half burned, half to bankers who stayed | 9 |
| Dormancy trigger | 30 days inactive, reportable by anyone | 10 |
| Informant bounty | 2% of the dormant balance, capped at 100,000 tokens | 10 |
| Revocation fee | 70%, remaining 30% to the wallet | 10 |
| Supply identities | `S_circ = 100M + M(t) − B(t)`, `S_max = 1B − B(t)` | 3 |
| Dutch curve | `P(t) = P_start·(P_floor/P_start)^(t/24h)` | 7 |
| Exit pressure | `P = W / max(D + W, ·)` | 9 |

### Redacted

Base issuance per day, the range of the multiplier along with its launch value, cut step and raise step, epoch length, the exact expression for the license floor, the charter reserve price, the floor, ceiling and saturation point of the resolution fee, the trading fee, and the ETH side of the genesis pool.

Every one of these is a slider in the app, tagged `REDACTED`.

### Derived

**License floor.** Section 7 gives the floor as a function of `N` with the expression blank, but section 8 describes the end of the day as approaching *"about two days of one branch's yield."* One branch's daily yield in a system of `N` branches is `base · m / N`, so the engine uses:

```
P_floor = licenseFloorDaysOfYield · (base · m / N)
```

with the multiple defaulting to 2. This is the only place I reconstruct a redacted formula from prose elsewhere in the document, and it is tagged `DERIVED` rather than `STATED`.

---

## 3. Reconstructed rules

### 3.1 The multiplier (equation 5.2)

Equation 5.2 is redacted entirely. What the whitepaper states about it:

1. `m` is bounded by a floor and a ceiling.
2. A positive signal raises it; a non positive signal cuts it.
3. *"Cuts are immediate, raises must be earned"*, so the cut step exceeds the raise step.
4. Sustained inflows reach full issue in some number of days and the ceiling in some longer number; a sustained exodus walks the ceiling down to the floor.
5. The path is drawn as a series of discrete per epoch steps, not a continuous curve.

The smallest rule satisfying all five is a bounded additive step whose sign follows the signal:

```
m_{n+1} = clamp(m_n + (signal_n > 0 ? raise : −cut), mMin, mMax)
```

That is what the engine implements. It is almost certainly not the deployed rule in detail, since a real implementation may scale the step by signal magnitude or use a multiplicative step, but it reproduces every stated property. The qualitative results, such as asymmetric recovery and chop being the worst regime for holders, follow from the asymmetry rather than from the functional form.

**Consequence worth knowing:** with additive steps, a market that oscillates around zero net flow is strictly worse for issuance than one that trends down and recovers, because each up leg is earned a step at a time and each down leg is given back at once. Try the "Chop" scenario against "Slow bleed" at the same horizon.

### 3.2 The resolution fee (equation 9.1)

Section 9 gives the pressure term explicitly and describes the fee as *"a quadratic curve from a floor to a ceiling, saturating when [X]% of the bank tries to leave in a week."* The engine implements:

```
fee = floor + (ceiling − floor) · min(P / P_sat, 1)²
```

The floor, ceiling and saturation point are all redacted. The defaults of 2%, 50% and 25% are chosen so that the ceiling stays under the 70% revocation fee. Section 10 states that the revocation fee is *"deliberately worse than the worst-case resolution fee"*, which is a hard constraint I enforce in the range of the slider.

### 3.3 The denominator floor

`P = W / max(D + W, ·)` has a redacted floor on the denominator. The engine uses one day of base issuance: the smallest scale that is guaranteed non zero while the bank is issuing, and small enough never to bind in a live economy.

---

## 4. Genuine ambiguities

These are places where the whitepaper admits more than one reading and the choice changes the numbers. The engine picks one, says so in the code, and documents the alternative here.

### 4.1 What are expansion licenses paid with?

Section 2 says *"Bankers spend earned $STANDARD on expansion licenses. Every token spent this way is burned."* Section 13 calls it *"the protocol's largest supply sink."*

- **Reading A (implemented):** licenses are paid from the banker's accrued ledger balance at the bank, and the payment is destroyed before it is ever minted.
- **Reading B:** licenses require ERC-20 tokens in the wallet, so an expander must first withdraw, which retires the branch they are trying to add to, or buy tokens on the open market.

The readings differ sharply. Under A, expansion is self financing from yield and burns unminted credits. Under B, expansion creates **buy pressure on the pool** as well as burning float, which is a materially stronger flywheel, and it means the largest supply sink only works if bankers are willing to buy.

The engine implements A because it needs no wallet round trip and matches the word "earned". It tracks the two burn categories separately, `burnedTokens` from buybacks and `burnedCredits` from licenses and fees, so that circulating supply reports real float rather than notional destruction. Under reading A, whitepaper equation 3.1 is literally true only for the buyback component; the app reports `S_circ` on real float and `S_max` on total burns, which is the conservative pairing.

**This is the single most consequential open question in the document,** and it is worth an official answer.

### 4.2 How does the dormancy bounty compose?

Section 10 lists, for one dormant balance: a 2% informant bounty, a 70% revocation fee, and 30% returned to the wallet. Those sum to 102%.

The engine assumes the bounty is paid **out of** the 70% fee, so the burn and redistribute halves of the fee apply to 68%. The alternative, with the bounty coming out of the 30% belonging to the ghost, leaves the informant paid by the victim rather than by the protocol, which reads less like the stated intent.

### 4.3 Where does the redistributed half of a fee land?

*"The other half is paid to every banker who stayed."* The engine credits it to their **ledger balance at the bank**, pro rata by branches, rather than minting it to wallets. That is consistent with the rest of the accrual model, and it means fee income is itself subject to a future resolution fee. Minting it directly would make staying strictly more liquid than the whitepaper implies.

---

## 5. Modelling choices that are not the fault of the whitepaper

### 5.1 The pool

The real market is a hooked Uniswap v4 pool with a full range protocol owned position. Full range behaves like a v2 curve across the whole domain, so `x·y = k` gets depth, slippage and the direction of price impact right, which is what the buyback throttle and the exit path depend on.

It does **not** model third party concentrated liquidity, MEV, sandwich risk, or the accounting inside the hook. Price paths are directionally honest and quantitatively soft. Do not read a price off this tool.

### 5.2 Sell pressure has to exist first

Scenario flows are exogenous, which creates an accounting hole: a scenario could ask to sell more tokens than exist. The engine caps every sell at the float outside the pool, `S_circ − poolStd`.

This is not a nicety. At genesis the entire float **is** the pool, so there is literally nothing to sell until someone buys or a banker withdraws. That constraint is why a run cannot start on day one, and it is visible in the bank run scenario: the exodus is blunted early and bites later, once withdrawals have created the float to sell.

### 5.3 Cohorts are homogeneous

Bankers are modelled as five aggregate cohorts, not 1,000 individuals. Within a cohort every charter holds the same number of branches and the same balance. This is exact for the pro rata mechanics, which are linear, and approximate for the per charter caps of 3 licenses a day and 10 branches maximum, which are enforced at cohort scale.

The visible artefact is that charters in a cohort die together rather than one at a time. For aggregate questions about supply, burns, vault balances and who won, this does not matter. For "what happens to *my* charter", use the desk calculators, which are exact for a single position.

### 5.4 The charter auction has no demand model

When charter auctions are enabled, the engine settles the seats for the day at the midpoint of the Dutch curve rather than modelling the willingness of newcomers to pay. With the default of zero auctions per day this never fires. Turn it on and treat the resulting ETH inflow as an upper middle estimate.

### 5.5 Time is daily

Issuance streams second by second in the protocol; the engine credits it daily. Auctions are walked hourly. Buybacks tick hourly, as specified. Epoch lengths that are not whole days are approximated to the nearest day boundary.

---

## 6. Invariants

The engine asserts these on every simulated day and surfaces any violation in the console. A parameter set that breaks the accounting produces a visible failure, not a plausible looking chart.

| Invariant | Source |
| --- | --- |
| `S_max(t)` is non increasing | 3.2 |
| `S_circ ≥ 0` | 3.1 |
| Cumulative issuance ≤ 900,000,000 | 3 |
| Base issuance is zero after the budget is exhausted | 3 |
| Bank ledger balance ≥ 0 | model |
| Branches ≤ charters × 10 | 7 |
| `mMin ≤ m ≤ mMax` | 5 |
| `feeFloor ≤ resolution fee ≤ feeCeiling` | 9 |
| Pool reserves stay strictly positive | model |
| Resolution fee burn equals resolution fee redistribution | 9 |
| Runs are deterministic for a given seed | model |

Test coverage lives in [`src/engine/__tests__`](../src/engine/__tests__).

---

## 7. What this tool cannot tell you

- **Whether the parameters will be good.** It tells you what a parameter set implies, not what the team will choose.
- **A price.** The pool model is too coarse and the scenarios are invented.
- **Contract risk.** The whitepaper is explicit that it is *"a design overview, not an implementation specification"* and that safeguards exist only in the deployed contracts. Nothing here reasons about the code.
- **Whether you will get a Founding Charter.** Allocation is off chain and discretionary.

---

## 8. Changelog

| Date | Change |
| --- | --- |
| 2026-09-08 | Initial model against whitepaper v0.1. |
