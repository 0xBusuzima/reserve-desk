# Reserve Desk

**A monetary policy simulator and banker's console for [The Standard Reserve](https://www.standardreserve.xyz/).**

The Standard Reserve whitepaper specifies a complete onchain central bank, covering issuance, expansion, reserves, exits, auctions and defense, and then publishes its launch parameter table with **every value blank**, closing with *"final parameters will be announced closer to launch."* That is deliberate, and it is their call to make.

So the mechanism is public and the numbers are not. You can read the whitepaper end to end and still not answer the only questions that matter to someone holding a charter:

- If I open a branch today, how many days until it pays for itself?
- What does it cost me to leave, and what does it cost me if everyone else leaves first?
- How much can the bank actually defend, and is it limited by its vault or by the pool?
- Under what conditions does compounding beat holding, and when does it stop?

Reserve Desk answers all four. I implemented whitepaper v0.1 as an executable model, let you supply every unpublished number yourself, and run the whole economy day by day so you can see what your assumptions imply.

> **Unofficial.** I am not affiliated with The Standard Reserve and this is not endorsed by them. The protocol is pre launch: no token, no NFT, no deployed contracts. Nothing here is investment advice.

---

## What it does

**Policy Lab.** Every parameter the whitepaper holds back is a slider, tagged with its provenance: `STATED` (verbatim in the whitepaper), `DERIVED` (follows from a stated rule), or `UNPUBLISHED` (your assumption). You always know which numbers are the protocol's and which are yours. Moving a control scrolls the page to the section that control changes.

**Scenario engine.** Five flow regimes, being launch melt up, slow bleed, bank run, chop and dead pool, driving a full simulation of the pool, the fee engine, both vaults, the license auction, the charter auction, retirements, the resolution fee, and dormancy revocation.

**Cohort outcomes.** 1,000 genesis charters split across five temperaments: compounders, holders, harvesters, weak hands and ghosts. The table tells you which strategy actually won, in tokens, net of everything spent on licenses.

**The desk.** Three standalone calculators seeded from wherever the simulation ended:
- *Should I buy a license today?* The day's Dutch curve with payback overlaid, and the hour your target becomes available.
- *What does it cost me to leave?* The quadratic resolution fee at your exit pressure, plus a run table showing what stayers collect.
- *How hard can the bank defend?* Whether the buyback throttle is vault bound or depth bound.

**Invariant checking.** The engine asserts the whitepaper's accounting on every simulated day: the supply identity, the monotonic max supply ratchet, the 900M issuance budget, the branch cap, and the policy band. If a parameter set breaks the accounting, the console says so instead of quietly producing a pretty chart.

---

## Run it

```bash
npm install
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

The build is a static bundle with no runtime dependencies beyond React, so it deploys to any static host. This repository ships a GitHub Pages workflow.

---

## The engine, on its own

The simulation core is a dependency free TypeScript module under [`src/engine`](src/engine). It has no React in it and can be used directly:

```ts
import { DEFAULT_PARAMS, getScenario, makeCohorts, simulate } from './src/engine'

const flows = getScenario('bank-run').generate(365, 42)
const result = simulate({
  params: { ...DEFAULT_PARAMS, baseIssuancePerDay: 400_000, mMax: 3 },
  cohorts: makeCohorts(1_000),
  flows,
})

console.log(result.violations)              // [] when the accounting holds
console.log(result.days.at(-1)?.circulating)
console.log(result.cohorts)                 // who won
```

| Module | What lives there |
| --- | --- |
| `math.ts` | The Dutch curve (7.1), the multiplier rule (5.2), exit pressure and the resolution fee (9.1), the buyback throttle (11.1), the supply identities (3.1, 3.2) |
| `pool.ts` | Constant product model of the single ETH ⇄ $STANDARD market, with protocol owned liquidity |
| `scenarios.ts` | Deterministic gross flow generators |
| `simulate.ts` | The day loop, cohort behaviour, and the invariant checks |
| `calculators.ts` | The three desk calculators |
| `params.ts` | Defaults, provenance table, and control metadata |

Every function carries the whitepaper section it implements.

---

## Honesty about the model

Read [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) before you trust a number. In short:

- **Unpublished parameters are assumptions.** The defaults satisfy every qualitative constraint the whitepaper states: cuts exceed raises, the resolution ceiling sits under the 70% revocation fee, the license floor is two days of a branch's yield, and buybacks bound near 5% of depth per day. They are still guesses.
- **The multiplier rule is reconstructed.** Equation 5.2 is not published. The engine models the smallest rule consistent with everything the whitepaper says about it.
- **Two genuine ambiguities in the whitepaper** are documented rather than papered over: whether expansion licenses are paid from the ledger balance or from minted tokens, and how the 2% dormancy bounty composes with the 70% revocation fee. Both readings are stated in the methodology, and the engine's choice is marked in the code.
- **The pool is constant product.** The real market is a hooked Uniswap v4 pool with a full range protocol owned position, so this gets depth and price impact directionally right and nothing about MEV or third party concentrated liquidity right at all.

Where this model and the deployed contracts disagree, the contracts are right.

---

## Genesis mint tracker

The app shows how many of the 1,000 Founding Charters have been allocated, read off the official mint page rather than typed in by hand.

There is no API for it. The protocol is pre launch, so there is no contract to query, and the mint page ships the count as a constant compiled into a hashed chunk. The site cannot fetch that chunk from the browser either, because standardreserve.xyz sends no CORS headers. So the read happens in CI:

1. [`scripts/fetch-genesis.mjs`](scripts/fetch-genesis.mjs) walks the same path a browser does. It fetches the mint page, follows its scripts to the chunk that renders the counter, and resolves the `minted` and `total` props back to their minified constants.
2. [`.github/workflows/genesis.yml`](.github/workflows/genesis.yml) runs it roughly every half hour and commits [`public/genesis.json`](public/genesis.json) only when the number moves, then redeploys.
3. The page fetches that snapshot at runtime and labels it `LIVE`, falling back to the value compiled into [`src/config.ts`](src/config.ts) if it cannot be reached.

Because every reading is a commit, the history of this number is auditable in the log rather than being a claim on a page.

```bash
node scripts/fetch-genesis.mjs --dry-run
```

The script anchors on the counter's own props instead of on a number pattern, which matters more than it sounds: at the time of writing the chunk declares `const ee=1e3,se=350,te=350` where `te` is an unrelated timeout that happens to equal the allocated count.

## Share cards

[`scripts/make-card.mjs`](scripts/make-card.mjs) renders 1600x900 images for posting, screenshotting itself with whatever Chromium is already installed.

```bash
npx vite-node scripts/measure-findings.mjs   # refresh the measured numbers
node scripts/make-card.mjs                   # all of them
node scripts/make-card.mjs --card finding    # just one
```

| Card | What it shows | Source of its numbers |
| --- | --- | --- |
| [`share/genesis-card.png`](share/genesis-card.png) | Founding Charters allocated, as a 200 square grid | `public/genesis.json` |
| [`share/redaction-card.png`](share/redaction-card.png) | How many parameters the whitepaper states against how many it holds back | the `PROVENANCE` table in `src/engine/params.ts` |
| [`share/finding-card.png`](share/finding-card.png) | The sign versus size result, as paired bars that cross over | `share/findings.json`, measured by `scripts/measure-findings.mjs` |
| `public/og.png` | The link preview, deliberately sparser since it is read at thumbnail size | both of the above |

No card carries a hardcoded figure. The genesis card reads the same snapshot the site does, and the redaction card parses the provenance table out of the engine source, so a card cannot claim a count the code disagrees with. Re-run the script whenever either moves.

---

## Contributing

The most valuable contributions are corrections. If you can show that a mechanic is modelled wrong, or that a held back parameter has since been disclosed, open an issue with the whitepaper section or the announcement and I will fix it.

## Licence

MIT. See [LICENSE](LICENSE).

## Links

- [The Standard Reserve](https://www.standardreserve.xyz/) · [Whitepaper](https://www.standardreserve.xyz/whitepaper/) · [Genesis mint](https://www.standardreserve.xyz/app/mint/) · [@standard_rsv](https://x.com/standard_rsv)
