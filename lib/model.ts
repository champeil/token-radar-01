// Token Radar's model: one frozen snapshot of the protocol universe in, one ranked board out.
//
// The board is two things kept apart. First the ranked board: every protocol that records no token and is
// not a product of one that trades — the watchlist slugs (the house floor, never a ceiling) and all the
// rest, ranked together by implied value. No quota, no cut-off: the rule decides membership, the model
// decides order. Second the live view: the largest protocols whose token already trades, shown at the
// market's own market cap and never mixed into the ranking, because a token that trades does not need an
// implied value.
//
// A protocol records no token when its snapshot entry has no market cap, no CoinGecko id and no symbol.
// Such a protocol is ranked. One that records a token is not: the market already priced it.
//
// The color commentary above describes the board's two halves. Both are now the same rule applied
// twice: a protocol may be ranked when the snapshot records no token for it AND it is not a wrapped,
// staked or bridged product of a protocol whose token already trades. The second half of that rule is
// what stops a launch radar from topping its board with bridge and liquid-staking TVL, which is other
// people's capital passing through rather than a protocol's own claim; the house watchlist applies the
// same test, so the board and the watchlist speak the same language.
//
// Implied value comes only from the snapshot's own figures, through three steps:
//
//   1. comparables. For a protocol's category, take every live-token protocol in the same category
//      (not CEX, TVL > 0, market cap > 0) and use the MEDIAN of mcap_usd / tvl_usd as that category's
//      multiple. A category needs at least MIN_COMPARABLES live names to speak for itself; with fewer
//      it borrows the global median across every live-token protocol. This is what makes the number an
//      implied FDV rather than a flat factor: a lending protocol is priced against lending protocols.
//        base = tvl_usd x multiple
//   2. growth. The 7-day TVL change, clamped to [-60, +120] per cent and scaled by GROWTH_WEIGHT so a
//      hot week nudges the number instead of dominating it:
//        growthMult = 1 + (clamp(change_7d, -60, 120) / 100) x GROWTH_WEIGHT
//   3. maturity. A protocol that has run a long time and still records no token is the seasoned case
//      the radar is looking for, so age since listed_at lifts the value, with a neutral value when the
//      snapshot carries no listed_at:
//        maturityMult = MATURITY_FLOOR + min(age_days, MATURITY_DAYS) / MATURITY_DAYS x MATURITY_RANGE
//        (age_days unknown: NEUTRAL_MATURITY)
//   implied = max(1, round(base x growthMult x maturityMult)), never above IMPLIED_CAP.
//
// No protocol name is special-cased anywhere in this file: the same functions score every row, and the
// categories and multiples are computed from the snapshot at run time, not written down here.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants. Every one of them is printed in the dashboard's explainer. */
export interface ModelConstants {
  /** Live-token protocols a category needs before its own median is used. */
  min_comparables: number;
  /** Weight on the clamped 7-day change: 0.35 means a full +120% week lifts value by 42%. */
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  /** Maturity multiplier at age 0, and the span of years over which it rises to floor + range. */
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  /** The maturity multiplier when the snapshot records no listed_at (the midpoint of the range). */
  neutral_maturity: number;
  /** No row's implied value may pass this (the gate's ceiling is 1e14). */
  implied_cap: number;
}

export const MODEL: ModelConstants = {
  min_comparables: 3,
  growth_weight: 0.35,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.7,
  maturity_range: 0.5,
  maturity_days: 1460,
  neutral_maturity: 0.95,
  implied_cap: 1e14,
};

export const MODEL_VERSION = 'radar-v1-comparables';

/** Early rows: pre-token protocols below the floor, by implied value. */
export const EARLY_ROWS = 160;
/** Hard ceiling on the ranked board, whatever the snapshot holds (the gate takes 4,000). */
export const BOARD_MAX = 600;
/** Live view rows, by market cap. */
export const LIVE_ROWS = 24;
/** Comparables shown per category in the dashboard's table. */
export const COMPARABLE_EXAMPLES = 5;

/**
 * DefiLlama categories whose TVL is a product of a token that already trades: a bridge holds other
 * chains' assets, a liquid staking or restaking pool holds a staked version of a token, and a CEX is an
 * exchange's book. None of them is a protocol whose own launch is unpriced, so none is ranked.
 */
export const PRODUCT_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** One category's multiple, with the live-token protocols it came from. */
export interface ComparableExample {
  slug: string;
  name: string;
  tvl_usd: number;
  mcap_usd: number;
  multiple: number;
}

export interface CategoryMultiple {
  /** The snapshot category, or '(none)' when DefiLlama names none. */
  category: string;
  /** How many live-token protocols the category carries. */
  comparables: number;
  /** The median mcap/tvl of those comparables. */
  multiple: number;
  /** 'category' when the median is the category's own, 'global' when it borrowed the global one. */
  source: 'category' | 'global';
  examples: ComparableExample[];
}

/** A farm step: what to do, what it costs, how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of the ranked board, and of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    multiple_source: 'category' | 'global';
    comparables: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
    /**
     * The three factors at full precision, unrounded: [multiple, growthMult, maturityMult]. The rounded
     * fields above are for reading; these are what the page multiplies out, so its recomputation lands on
     * the same integer as implied_value_usd instead of a dollar or two beside it.
     */
    factors: [number, number, number];
  };
  farm_steps: string[];
}

/** A live-token protocol: the market's own numbers, never a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  /** mcap_usd / tvl_usd for the live row: the market's multiple, shown for comparison. */
  multiple: number | null;
}

/** Everything the dashboard renders, written to data.js beside the page. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  /** How many protocols the snapshot carries, in total. Display only: the panel states the universe size. */
  snapshot_size: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  /** Protocols the snapshot records no token for that are set aside as products of one that trades. */
  product_size: number;
  global_multiple: number;
  global_comparables: number;
  comparables: CategoryMultiple[];
  rows: BoardRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

const finite = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Days from `listedAt` to `asOf`, clamped at zero; null when either date is missing or unreadable. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of finite numbers. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A protocol records no token at all: no market cap, no CoinGecko id, no symbol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** A token already trades, on a live market cap: the comparable set's only members. */
export function tradesToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX';
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A wrapped or staked product, in any case, as a whole word. */
const PRODUCT_WORD = /\b(wrapped|staked|staking|restaked|restaking)\b/i;
/** An exchange's own product, named after the exchange. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/i;

/**
 * Whether a protocol is a product of a token that already trades rather than a protocol in its own
 * right: a bridge, a liquid staking or restaking pool, a wrapped or staked asset, a versioned pool, or
 * an exchange's own product. Its TVL is someone else's capital passing through, so an implied FDV
 * computed from it would rank a pass-through above a protocol that has actually been building.
 */
export function isProduct(p: SnapshotProtocol): boolean {
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return true;
  if (VERSIONED.test(p.name)) return true;
  if (PRODUCT_WORD.test(p.name)) return true;
  return EXCHANGE_PREFIX.test(p.name);
}

/** Whether the board may rank a protocol: it records no token and it is not a product of one that trades. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !isProduct(p);
}

const categoryKey = (p: SnapshotProtocol): string => p.category ?? '(none)';

/** A live protocol's own market cap to TVL ratio. */
export const multipleOf = (p: SnapshotProtocol): number => (p.tvl_usd > 0 ? (p.mcap_usd as number) / p.tvl_usd : 0);

/**
 * The comparables table: each category's median mcap/tvl across its live-token protocols, and the global
 * median for categories with fewer than `model.min_comparables` names. Derived from the snapshot alone.
 */
export function comparablesTable(snapshot: Snapshot, model: ModelConstants = MODEL): { table: CategoryMultiple[]; global: number; globalCount: number } {
  const live = snapshot.protocols.filter(tradesToken);
  const global = live.length > 0 ? median(live.map(multipleOf)) : 0;
  const byCategory = new Map<string, SnapshotProtocol[]>();
  for (const p of live) {
    const key = categoryKey(p);
    const bucket = byCategory.get(key);
    if (bucket === undefined) byCategory.set(key, [p]);
    else bucket.push(p);
  }
  const table: CategoryMultiple[] = [];
  for (const [category, members] of byCategory) {
    const enough = members.length >= model.min_comparables;
    // Examples: the names closest to the median ratio, so the table shows the typical case, not the tail.
    const withRatio = members.map((p) => ({ p, ratio: multipleOf(p) }));
    const mid = median(withRatio.map((m) => m.ratio));
    withRatio.sort((a, b) => Math.abs(a.ratio - mid) - Math.abs(b.ratio - mid) || b.p.tvl_usd - a.p.tvl_usd);
    table.push({
      category,
      comparables: members.length,
      multiple: enough ? mid : global,
      source: enough ? 'category' : 'global',
      examples: withRatio.slice(0, COMPARABLE_EXAMPLES).map(({ p }) => ({
        slug: p.slug,
        name: p.name,
        tvl_usd: p.tvl_usd,
        mcap_usd: p.mcap_usd as number,
        multiple: round4(multipleOf(p)),
      })),
    });
  }
  table.sort((a, b) => b.comparables - a.comparables || (a.category < b.category ? -1 : 1));
  return { table, global, globalCount: live.length };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The multiple a protocol gets: its category's when the category has enough comparables, else global. */
function multipleFor(category: string, table: Map<string, CategoryMultiple>, global: number): { multiple: number; source: 'category' | 'global'; comparables: number } {
  const entry = table.get(category);
  if (entry !== undefined && entry.source === 'category') return { multiple: entry.multiple, source: 'category', comparables: entry.comparables };
  return { multiple: global, source: 'global', comparables: entry?.comparables ?? 0 };
}

/** One protocol's three multipliers and implied value under `model`. */
export function scoreProtocol(
  p: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  table: Map<string, CategoryMultiple>,
  global: number,
): { implied: number; multiple: number; baseMultiple: number; source: 'category' | 'global'; comparables: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, p.listed_at);
  const { multiple, source, comparables } = multipleFor(categoryKey(p), table, global);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(p.change_7d, 0)));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const maturityMult =
    age === null ? model.neutral_maturity : model.maturity_floor + (Math.min(age, model.maturity_days) / model.maturity_days) * model.maturity_range;
  const base = p.tvl_usd * multiple;
  const implied = Math.min(model.implied_cap, Math.max(1, Math.round(base * growthMult * maturityMult)));
  return { implied, multiple, baseMultiple: round4(multiple), source, comparables, growthPct, growthMult, maturityMult, age };
}

/**
 * The ranked board's members: every protocol the snapshot records no token for and that is not a product
 * of one that trades, the watchlist among them and never dropped. The watchlist is a floor, not the
 * board: the rest are the early protocols the radar exists to find, below the house floor and above it.
 * Members are chosen by rule, not by a fixed count, so a different snapshot yields a different board.
 */
function boardMembers(snapshot: Snapshot, model: ModelConstants, table: Map<string, CategoryMultiple>, global: number): { p: SnapshotProtocol; scored: ReturnType<typeof scoreProtocol> }[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const members = new Map<string, SnapshotProtocol>();
  // Every watchlist slug first, whatever the category or the name: coverage is the first gate row and is
  // never traded away for a better-looking board.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) members.set(slug, p);
  }
  // Then every other rankable protocol, best implied value first, up to the board's ceiling. Slugs
  // already chosen are never dropped or replaced.
  const early = snapshot.protocols
    .filter((p) => !members.has(p.slug) && isRankable(p))
    .map((p) => ({ p, scored: scoreProtocol(p, snapshot.as_of, model, table, global) }))
    .sort((a, b) => b.scored.implied - a.scored.implied || a.p.slug.localeCompare(b.p.slug))
    .slice(0, Math.max(0, BOARD_MAX - members.size));
  for (const { p } of early) members.set(p.slug, p);

  return [...members.values()].map((p) => ({ p, scored: scoreProtocol(p, snapshot.as_of, model, table, global) }));
}

/** The ranked board: strongest implied value first, ranks 1..n, no gaps and no ties in rank. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const { table, global } = comparablesTable(snapshot, model);
  const tableByCategory = new Map(table.map((entry) => [entry.category, entry]));
  const watchlist = new Set(snapshot.watchlist);
  const scored = boardMembers(snapshot, model, tableByCategory, global);
  scored.sort((a, b) => b.scored.implied - a.scored.implied || a.p.slug.localeCompare(b.p.slug));
  return scored.map(({ p, scored: s }, i) => ({
    rank: i + 1,
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
    token_status: 'pre-token',
    on_watchlist: watchlist.has(p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: s.baseMultiple,
      multiple_source: s.source,
      comparables: s.comparables,
      growth_pct: round4(s.growthPct),
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
      factors: [s.multiple, s.growthMult, s.maturityMult],
    },
    farm_steps: farmSteps(p, s.age, s.implied).map(stepText),
  }));
}

/** A step as one gate-shaped string: the action, then its cost and its time (20 to 600 characters). */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Check the protocol's own page before you move funds.`;
  return s;
}

/** A protocol's primary chain, and the second when it names one. */
function chainsOf(p: SnapshotProtocol): { first: string; second: string | null } {
  return { first: p.chains[0] ?? 'its main chain', second: p.chains.length > 1 ? p.chains[1]! : null };
}

/**
 * Capital per position, scaled from the protocol's TVL: a $5B protocol needs a larger ticket to be a
 * meaningful position beside the rest of its book than a $12M one does.
 */
export function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 300;
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 250_000_000) return 125;
  if (p.tvl_usd >= 50_000_000) return 75;
  if (p.tvl_usd >= 20_000_000) return 50;
  return 25;
}

/** Hold period from age: a young protocol is held through its early seasons, a seasoned one need not be. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 120) return 90;
  if (age < 365) return 60;
  if (age < 730) return 45;
  return 30;
}

/** The one core on-chain action the category supports, in words a reader can follow. */
function coreAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('curator') || c.includes('allocator')) return `Allocate $${capital} of USDC into a ${n} vault on ${chain}, after reading the vault's stated strategy and its fee line`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${n} on ${chain} and leave it supplied so the position shows in the protocol's own TVL`;
  if (c.includes('dex') || c.includes('liquidity') || c.includes('leveraged farm') || c === 'farm') return `Provide $${capital} of liquidity to ${n}'s deepest pool on ${chain}, stable-pair first, and note the pool's fee tier`;
  if (c.includes('bridge')) return `Move $${capital} of USDC to ${chain} through ${n} and use the bridged funds once inside the app it serves`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of ${chain}'s staking asset through ${n} and keep the receipt token in the same wallet`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('synthetic')) return `Deposit $${capital} of USDC as margin on ${n} and open one small position, collateral ratio above 3x`;
  if (c.includes('prediction')) return `Fund $${capital} of USDC on ${n} and place one position in a market you can already read, then hold it to settlement`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${n} on ${chain} and hold the receipt`;
  if (c.includes('rwa')) return `Buy $${capital} of the yield asset ${n} issues on ${chain} and hold it in the same wallet you started with`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${n} on ${chain} for a position you already hold and keep the policy document`;
  if (c.includes('index')) return `Mint $${capital} of ${n}'s index on ${chain} and hold the basket rather than trading it`;
  if (c.includes('basis')) return `Deposit $${capital} of USDC into ${n}'s basis position on ${chain} and hold through one funding cycle`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC onto ${n} and use one app on the chain, so the deposit and the usage both land`;
  if (c.includes('payment')) return `Route $${capital} of a payment you were making anyway through ${n} on ${chain} and keep the receipt`;
  if (c.includes('launchpad')) return `Commit $${capital} to one ${n} launch on ${chain} you have read the terms of, and claim nothing outside its own page`;
  return `Deposit $${capital} of USDC into ${n} on ${chain} and keep the position open past the first week`;
}

/** Chain- and size-aware second action: a second chain when the protocol names one, else a second position. */
function secondAction(p: SnapshotProtocol, capital: number, chain: string, second: string | null): string {
  if (second !== null) {
    return `Open the same $${Math.max(10, Math.round(capital / 2))} position on ${second} as well, so ${p.name} sees activity on both ${chain} and ${second} rather than one chain only`;
  }
  return `Split the position: keep $${Math.round(capital / 2)} in the main position on ${chain} and hold the other $${Math.round(capital / 2)} in the protocol's stable or native asset so you can add on a drawdown`;
}

/**
 * The sizing step: what the position is worth beside the protocol's own record, so the reader sees why the
 * ticket is that size. Derived from the row's TVL and its implied value, never from a template number.
 */
function sizingStep(p: SnapshotProtocol, capital: number, implied: number): FarmStep {
  const fmt = (n: number): string =>
    n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M` : `$${Math.round(n / 1e3)}K`;
  const share = p.tvl_usd > 0 ? (capital / p.tvl_usd) * 100 : 0;
  // A $200 ticket into a $1B protocol is a five-millionth of its TVL, so state the share in the unit that
  // reads at that scale: a percentage to the first significant figure, never rounded away to "0.00%".
  const shareText =
    share >= 0.01
      ? `${share.toFixed(2)}% of its TVL`
      : share > 0
        ? `${share.toPrecision(2)}% of its TVL`
        : 'unmeasurable against its TVL';
  return {
    text:
      `Size the ticket against the record, not against a template: $${capital} is ${shareText} on a protocol whose snapshot TVL is ${fmt(p.tvl_usd)},` +
      ` and the model implies ${fmt(implied)} of value for the protocol, so the position is small enough to leave on its books through` +
      ` a drawdown and large enough that the protocol sees a real holding rather than a dust transaction`,
    cost: `$${capital}, and the share of TVL above is what the protocol itself would see`,
    time: '15 minutes to size and double-check',
  };
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time, derived from its own record
 * (category, chains, TVL tier, age, implied value) and never from a hand-written list of names. No step
 * promises a points program or a drop: it says what to do on chain, and to claim only from the protocol's
 * own links.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, implied: number): FarmStep[] {
  const { first, second } = chainsOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weekly = age !== null && age < 180 ? 14 : 7;
  const half = Math.max(10, Math.round(capital / 2));
  return [
    {
      text: `Make a fresh wallet for this position on ${first} and fund it with only the $${capital} you plan to use plus gas; keep the seed phrase offline and never reuse a wallet that holds other assets`,
      cost: 'under $5 of gas for the first transaction',
      time: '10 minutes',
    },
    {
      text: `${coreAction(p, capital, first)}, then record the transaction hash, the date and the amount in a note before you do anything else`,
      cost: `$${capital} of capital and about $${capital >= 125 ? 10 : 4} of gas`,
      time: '20 minutes to set up',
    },
    sizingStep(p, capital, implied),
    {
      text: `${secondAction(p, capital, first, second)}; a protocol's TVL is counted per chain, so activity on both sides is what its own record actually shows`,
      cost: `$${half} more of capital and about $3 of gas`,
      time: '15 minutes',
    },
    {
      text: `Return every ${weekly} days for one small qualifying action on ${p.name} itself, a deposit, a withdrawal, a borrow, a swap or a governance vote, rather than a burst in one week`,
      cost: `about $2 to $4 of gas per visit`,
      time: `${weekly === 14 ? '10 minutes twice a month' : '10 minutes a week'}`,
    },
    {
      text: `Hold the position at least ${hold} days so the balance is on the protocol's books across more than one weekly snapshot, and withdraw in two parts rather than all at once`,
      cost: `the $${capital} stays in the position for ${hold} days`,
      time: `${hold} days`,
    },
    {
      text: `Keep a farm log with the wallet address, every transaction hash, the dates and the exit plan, and check ${p.name}'s own site for the rewards it publishes: claim only from links on its own page and never pay a fee to claim`,
      cost: 'nothing but the log and one deliberate check',
      time: '10 minutes to write, 5 minutes a week to update',
    },
  ];
}

/** The live view: the largest live-token protocols at the market's own market cap, CEX excluded. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd as number) - (a.mcap_usd as number) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      multiple: p.tvl_usd > 0 ? round4(multipleOf(p)) : null,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const { table, global, globalCount } = comparablesTable(snapshot, model);
  const live = liveRows(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const ranked = new Set(board.map((r) => r.slug));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    snapshot_size: snapshot.protocols.length,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !watchlist.has(r.slug)).length,
    live_size: live.length,
    product_size: snapshot.protocols.filter((p) => isPreToken(p) && !ranked.has(p.slug)).length,
    global_multiple: round4(global),
    global_comparables: globalCount,
    comparables: table,
    rows: board,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape this model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate takes, or null. Checked before anything is written. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100) return `the board has ${board.length} rows, under the 100 the gate takes`;
  if (board.length > 4000) return `the board has ${board.length} rows, over the 4000 the gate takes`;
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share one implied value: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
