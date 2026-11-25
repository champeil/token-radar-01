# Token Radar

[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?ref=6w8nnt9d)
[![rank](https://make.fun/badge/token-radar-01/champeil/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01?ref=6w8nnt9d)
[![reward](https://make.fun/badge/token-radar-01/champeil/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?ref=6w8nnt9d)

Build the best token launch radar — make.fun token-radar-01 entry.

[The bounty](https://make.fun/bounty/token-radar-01?ref=6w8nnt9d) · entry referral code `6w8nnt9d`

A protocol's launch is the token it may issue one day. Token Radar reads one frozen
DefiLlama snapshot (758 protocols at or above $5M TVL, 40 of them on the house
watchlist: TVL at or above $50M and no token recorded), scores every protocol that
records no token with a comparables model, and publishes a ranked board of what that
protocol's fully diluted value would be if its record stayed as it is. Each row
carries a farm plan: what to do on chain, what it costs, how long it takes.

## What the model does

Implied value follows from the snapshot's own figures only, in three steps. No
protocol name is special-cased anywhere in `lib/model.ts`.

1. **Comparables.** For a protocol's category, take every live-token protocol in the
   same category (it records a market cap, its TVL is above zero, it is not an
   exchange) and use the **median `mcap_usd / tvl_usd`** of that set as the category
   multiple. A category with fewer than 3 live names borrows the global median across
   all live-token protocols. `base = tvl_usd × median(mcap/tvl of live peers)`
2. **Growth.** `change_7d`, clamped to [-60%, +120%] and scaled by 0.35, so a hot week
   lifts the number without dominating it.
3. **Maturity.** Age in days since `listed_at`, lifting value from 0.70 to 1.20 over
   1460 days: a protocol that has run a long time and still records no token is the
   seasoned case a launch radar is looking for.

`implied = tvl × multiple × growthMult × maturityMult`, rounded, floored at $1 and
capped at $100T. The page shows every constant and recomputes the number in front of
the reader, so a row can be checked against the snapshot by hand.

A protocol is ranked when the snapshot records no token for it **and** it is not a
wrapped, staked or bridged product of one that already trades (a bridge, a liquid
staking or restaking pool, a versioned pool, an exchange's own product). Those
products' TVL is other people's capital passing through, so ranking them would top
the radar with pass-through volume; the house watchlist applies the same test. On the
shipped snapshot that sets 145 products aside. The board is every remaining protocol
— the 40 watchlist slugs (the floor, never the ceiling) plus the rest, 197 rows here,
ranked 1..197. Protocols whose token already trades are never ranked: they sit in a
separate live view at the market's own market cap, and they are the comparables the
board is priced against.

## Run it

Node 22+ (no dependencies, standard library only):

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

The snapshot is sealed and ships with the kit, not with this repository. `--input`
takes either the JSON file or a directory holding `snapshot.json`.

Inside the grader the same program reads `/input/snapshot.json` and writes
`/output`:

```sh
node main.ts
```

Either way it writes:

- `board.json` — the ranked board, `{ rows: [...] }`, 197 rows with ranks 1..197 on the shipped snapshot
- `data.js` — `window.RADAR`, the dashboard's whole dataset
- `dashboard/` — `index.html`, `app.css`, `app.js` (about 51 KB, under the 64 KB cap)
- `screenshots/` — the board, a detail view and a filtered view
- `dossier.json` — built by `buildDossier` from `vendor/makefun-board.ts`

Open `out/dashboard/index.html` from a served directory (`python3 -m http.server`
in `out/`) to use the page: sortable columns, a search box, category and chain
filters, a watchlist/off-watchlist scope, a live-token tab, and a detail drawer per
protocol with its model breakdown, then its farm plan, then the comparables behind its
multiple — every step of the plan states a cost and a time. The detail screenshot shows
the derivation and the first steps of the plan in one frame.

## Layout

```
main.ts                 entry: read the snapshot, write board.json, data.js, dashboard/, dossier.json
lib/model.ts            the comparables model, the board builder and the farm plans
dashboard/index.html    the page
dashboard/app.css       one palette, one type scale, one spacing scale
dashboard/app.js        renders window.RADAR: board, filters, detail drawer
vendor/makefun-board.ts vendored buildDossier (copied from the kit, not modified)
screenshots/            1-board.png, 2-detail.png, 3-filtered.png
```

## Reading the numbers honestly

The snapshot is DefiLlama's record as of 2026-11-14, not proof about any protocol. A
row says the snapshot **records no token** for that protocol; it does not say the
protocol has none. An implied value is this entry's own claim about what a token
would be worth if the record stayed as it is — not a prediction that a token is
issued, and not investment advice. Farm steps name only on-chain actions and costs;
claim nothing except from the protocol's own page, and never pay a fee to claim.

## Licence

MIT. See `LICENSE`.
