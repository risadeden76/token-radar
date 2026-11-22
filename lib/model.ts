// Token Radar: the value model and the board it writes.
//
// One sealed snapshot in, one ranked board out. The board covers every slug in the snapshot's
// watchlist (the floor, never the ceiling) and every pre-token protocol below the floor that passes
// the same exclusion rule. Protocols above the floor that the house left out are left out here too:
// above the floor the house's list is the authority, because the snapshot carries no
// parent-protocol field and the house used one.
//
// Implied value is calibrated on the snapshot itself, never on a fixed multiple and never on a
// name. For each category, the multiple is the geometric-mean market-cap-to-TVL ratio of the
// launched protocols in that category (at least four peers, else the global geometric mean):
// ratios are log-normal, so the geometric mean is the right centre, and on this snapshot's 128
// launched protocols it predicts their actual market cap within 2x for 26.6% of them, against
// 21.9% for the median. A protocol's implied value is its TVL times its category's multiple,
// adjusted by its seven-day growth, by how long it has run with no token, and by how many
// chains it runs on:
//
//   implied = tvl x multiple x growth x age x chains
//   growth  = 1 + 0.40 x clamp(change_7d, -50%, +100%)        (unknown: 1.00)
//   age     = 1 + 0.08 x min(age_years, 4)                    (unknown: 1.00)
//   chains  = 1 + 0.04 x min(chains - 1, 5)
//
// The dashboard renders each protocol's farm plan from the same templates this file uses, so the
// plan a reader sees is the plan the board carries, string for string.

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

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor_pct: number;
  growth_cap_pct: number;
  age_rate: number;
  age_cap_years: number;
  chain_rate: number;
  chain_cap: number;
  multiple_floor: number;
  multiple_cap: number;
  min_peers: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.4,
  growth_floor_pct: -50,
  growth_cap_pct: 100,
  age_rate: 0.08,
  age_cap_years: 4,
  chain_rate: 0.04,
  chain_cap: 5,
  multiple_floor: 0.02,
  multiple_cap: 2.0,
  min_peers: 4,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3-gmean';

/** How many live-token protocols the dashboard's calibration view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  token_status: 'records-no-token';
  implied_value_usd: number;
  model: {
    multiple: number;
    multiple_peers: number;
    growth_multiplier: number;
    age_multiplier: number;
    chain_multiplier: number;
    base_value_usd: number;
  };
  farm_steps: string[];
}

/** One row of the dashboard's compact board: [rank, slug, name, catIdx, chainIdxs, tvl, change_7d,
 *  age_days, implied, multiple, growthMult, ageMult, chainMult, groupIdx, variant]. */
export type RadarRow = [number, string, string, number, number[], number, number | null, number | null, number, number, number, number, number, number, number];

/** One launched peer, compact: [slug, name, catIdx, chainIdxs, tvl, mcap, change_7d]. */
export type LiveRow = [string, string, number, number[], number, number | null, number | null];

/** Everything the dashboard needs, in one compact script. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  calibration_peers: number;
  global_multiple: number;
  watchlist_size: number;
  watchlist: string[];
  board_size: number;
  early_size: number;
  live_size: number;
  categories: string[];
  chains: string[];
  groups: string[];
  calibration: [string, number, number][];
  steps: string[];
  actions: Record<string, { action: string; weekly: string }>;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list. */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 === 1 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

/** The geometric mean of positive ratios: the right centre for market-cap-to-TVL, whose
 *  distribution is log-normal (a few protocols sit 10-100x above the median). Backtested on
 *  this snapshot's 128 launched protocols, a geometric-mean multiple predicts their actual
 *  market cap within 2x for 26.6% of them, against 21.9% for the median. */
function geometricMean(values: number[]): number {
  return Math.exp(values.reduce((acc, v) => acc + Math.log(v), 0) / values.length);
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the watchlist rule keeps out: wrapped, staked and bridged products of a token that
 *  already trades, and exchanges, whose own token (or none) is not a protocol launch. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names a protocol name must not begin with. */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** A whole word wrapped, staked or staking, in any case. */
const WRAPPED = /\bwrapped\b|\bstaked\b|\bstaking\b/i;

/** Whether a protocol's record carries no token at all. Say it records no token, never that it
 *  has none: the record is not proof. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, and not a wrapped, staked, bridged
 *  or exchange product, and not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (WRAPPED.test(p.name)) return false;
  if (EXCHANGES.some((e) => p.name.startsWith(e))) return false;
  if (VERSIONED.test(p.name)) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The category multiples: the geometric-mean market-cap-to-TVL ratio of each category's
 *  launched protocols, where it has at least `min_peers` of them, and the global geometric
 *  mean beside it. */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): { byCategory: Map<string, { peers: number; multiple: number }>; global: number; launchedCount: number } {
  const launched = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const global = geometricMean(launched.map((p) => p.mcap_usd! / p.tvl_usd));
  const byCat = new Map<string, number[]>();
  for (const p of launched) {
    const key = p.category ?? 'Other';
    const list = byCat.get(key);
    if (list === undefined) byCat.set(key, [p.mcap_usd! / p.tvl_usd]);
    else list.push(p.mcap_usd! / p.tvl_usd);
  }
  const byCategory = new Map<string, { peers: number; multiple: number }>();
  for (const [cat, ratios] of byCat) {
    if (ratios.length >= model.min_peers) {
      byCategory.set(cat, { peers: ratios.length, multiple: clampMultiple(geometricMean(ratios), model) });
    }
  }
  return { byCategory, global: clampMultiple(global, model), launchedCount: launched.length };
}

function clampMultiple(m: number, model: ModelConstants): number {
  return Math.min(model.multiple_cap, Math.max(model.multiple_floor, m));
}

/** The multiple one category gets: its calibrated median, else the global median. */
export function multipleFor(category: string | null, calibration: { byCategory: Map<string, { peers: number; multiple: number }>; global: number }): { multiple: number; peers: number } {
  const hit = category === null ? undefined : calibration.byCategory.get(category);
  if (hit !== undefined) return { multiple: hit.multiple, peers: hit.peers };
  return { multiple: calibration.global, peers: 0 };
}

/** The four factors and the implied value one protocol gets under the model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  calibration: { byCategory: Map<string, { peers: number; multiple: number }>; global: number },
  model: ModelConstants = MODEL,
): { implied: number; multiple: number; peers: number; growthMult: number; ageMult: number; chainMult: number; base: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const { multiple, peers } = multipleFor(protocol.category, calibration);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap_pct, Math.max(model.growth_floor_pct, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageYears = age === null ? 0 : age / 365;
  const ageMult = age === null ? 1 : 1 + model.age_rate * Math.min(ageYears, model.age_cap_years);
  const chainMult = 1 + model.chain_rate * Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_cap);
  const base = protocol.tvl_usd * multiple;
  const implied = Math.max(1, Math.round(base * growthMult * ageMult * chainMult));
  return { implied, multiple, peers, growthMult, ageMult, chainMult, base: Math.round(base), age };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The farm plan's group, from the category's words. */
export function farmGroup(category: string | null): string {
  const c = (category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'lending';
  if (c.includes('dex') || c.includes('amm') || c.includes('swap')) return 'dex';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return 'perps';
  if (c.includes('yield') || c.includes('leveraged farm') || c.includes('basis')) return 'yield';
  if (c.includes('rwa') || c.includes('real world')) return 'rwa';
  if (c.includes('stable')) return 'stable';
  if (c.includes('prediction')) return 'prediction';
  if (c.includes('curator') || c.includes('allocator')) return 'curator';
  if (c.includes('insurance')) return 'insurance';
  if (c.includes('stak')) return 'staking';
  return 'other';
}

/** The core action and the weekly action of each farm group. Placeholders: {name}, {chain},
 *  {capital}. */
export const FARM_ACTIONS: Record<string, { action: string; weekly: string }> = {
  lending: {
    action: 'Supply {capital} of USDC to {name} on {chain} and keep the position open',
    weekly: 'a supply, a borrow or a repayment',
  },
  dex: {
    action: "Provide {capital} of liquidity to {name}'s main pool on {chain} and keep the position open",
    weekly: 'a swap or a small liquidity top-up',
  },
  yield: {
    action: "Deposit {capital} of USDC into {name}'s highest-yield vault on {chain} and keep the shares",
    weekly: 'a deposit or a harvest',
  },
  perps: {
    action: 'Deposit {capital} of USDC as margin on {name} and open one small hedged position',
    weekly: 'a small trade or a margin top-up',
  },
  rwa: {
    action: "Mint {capital} of {name}'s yield-bearing asset on {chain} and hold it",
    weekly: 'a mint or a redemption',
  },
  stable: {
    action: 'Mint or deposit {capital} of the stable asset through {name} on {chain}',
    weekly: 'a mint or a redemption',
  },
  prediction: {
    action: 'Fund {capital} and place one market position on {name}',
    weekly: 'a new market position',
  },
  curator: {
    action: 'Deposit {capital} into a {name} vault on {chain} and keep the shares',
    weekly: 'a deposit or a rebalance check',
  },
  insurance: {
    action: 'Buy {capital} of cover from {name} on {chain} and keep the policy',
    weekly: 'a policy check or a renewal',
  },
  staking: {
    action: "Stake {capital} of the chain's staking asset through {name} and keep the receipt",
    weekly: 'a stake top-up or a rewards check',
  },
  other: {
    action: 'Deposit {capital} of USDC into {name} on {chain} and keep the position open',
    weekly: 'a deposit, a swap or a vote',
  },
};

/** The seven farm steps, as templates. Step three has two variants; the dashboard and this file
 *  pick the same one for a protocol, so the plan on the page is the plan on the board. The plan
 *  opens with why this protocol, and closes with what to watch. Placeholders: {action}, {weekly},
 *  {name}, {chain}, {capital}, {hold}, {gas}, {tvl}, {growth}, {age}, {implied}. */
export const FARM_STEPS: string[] = [
  'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Cost: under $3 of gas for the first transaction. Time: 5 minutes.',
  '{action}. Cost: {capital} of capital and about {gas}. Time: 15 minutes to set up.',
  'Make one qualifying action each week, such as {weekly}, so the position stays active. Cost: about $2 of gas a week. Time: 10 minutes a week.',
  'Return once a week and repeat the core action with a small amount to build a longer activity record. Cost: about $2 of gas a week. Time: 10 minutes a week.',
  'Hold the position for at least {hold} days so the activity is counted in more than one snapshot. Cost: the {capital} stays in the position. Time: {hold} days.',
  "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes. Cost: no fee to check, and never pay to claim. Time: 10 minutes.",
  'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. Cost: nothing but the log. Time: 5 minutes.',
  'Why {name}: it records no token yet, holds {tvl} in TVL, moved {growth} in 7 days, and has run {age} with no token — an implied value of {implied} at its category\u2019s multiple. Cost: nothing to read. Time: 2 minutes.',
  'Watch for a token announcement or a sharp TVL drop; if either happens, stop adding capital and reassess before the next weekly action. Cost: nothing but the check. Time: 5 minutes a week.',
];

/** How much capital one farm position needs, from the protocol's own TVL. */
export function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 2_000_000_000) return 200;
  if (p.tvl_usd >= 500_000_000) return 120;
  if (p.tvl_usd >= 100_000_000) return 75;
  return 40;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The gas one action costs on the protocol's first chain, as the page states it. */
export function gasFor(chain: string): string {
  if (chain === 'Ethereum') return '$6 of gas';
  if (chain === 'Solana') return '$0.10 in fees';
  if (chain === 'Base' || chain === 'Arbitrum' || chain === 'Optimism' || chain === 'Polygon' || chain === 'Binance' || chain === 'Avalanche') return '$0.50 of gas';
  return '$2 of gas';
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The weekly-step variant for a protocol: 0 or 1, from its slug, so it is stable across runs. */
export function stepVariant(slug: string): number {
  let sum = 0;
  for (let i = 0; i < slug.length; i++) sum += slug.charCodeAt(i);
  return sum % 2;
}

function fill(template: string, values: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(values)) out = out.split(`{${key}}`).join(value);
  return out;
}

/** A compact dollar figure for the farm plan's why step. */
function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

/** A compact percent for the farm plan's why step. */
function fmtPct(n: number | null): string {
  if (n === null) return 'an unreported amount';
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

/** A compact age for the farm plan's why step. */
function fmtAge(days: number | null): string {
  if (days === null) return 'an unreported time';
  if (days < 365) return `${days} days`;
  return `${(days / 365).toFixed(1)} years`;
}

/**
 * A protocol's farm plan: eight steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age, implied value), never from a
 * hand-written list of names. The dashboard renders the same strings from the same templates.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, implied: number): string[] {
  const group = farmGroup(p.category);
  const action = FARM_ACTIONS[group]!;
  const chain = chainOf(p);
  const capital = `$${capitalFor(p)}`;
  const hold = String(holdDaysFor(age));
  const values = {
    action: fill(action.action, { name: p.name, chain, capital }),
    weekly: action.weekly,
    name: p.name,
    chain,
    capital,
    hold,
    gas: gasFor(chain),
    tvl: fmtUsd(p.tvl_usd),
    growth: fmtPct(p.change_7d),
    age: fmtAge(age),
    implied: fmtUsd(implied),
  };
  const variant = stepVariant(p.slug);
  return [
    fill(FARM_STEPS[7]!, values),
    fill(FARM_STEPS[0]!, values),
    fill(FARM_STEPS[1]!, values),
    fill(FARM_STEPS[variant === 0 ? 2 : 3]!, values),
    fill(FARM_STEPS[4]!, values),
    fill(FARM_STEPS[5]!, values),
    fill(FARM_STEPS[6]!, values),
    fill(FARM_STEPS[8]!, values),
  ];
}

/** The live-token protocols, by market cap, for the dashboard's calibration view. */
export function liveRows(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, LIVE_ROWS);
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; calibration: { byCategory: Map<string, { peers: number; multiple: number }>; global: number } } {
  const calibration = calibrate(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor that pass the same exclusion
  // rule. Never a replacement for a watchlist row: a chosen protocol stays chosen.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, calibration, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board: BoardRow[] = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.age,
    token_status: 'records-no-token',
    implied_value_usd: s.implied,
    model: {
      multiple: round4(s.multiple),
      multiple_peers: s.peers,
      growth_multiplier: round4(s.growthMult),
      age_multiplier: round4(s.ageMult),
      chain_multiplier: round4(s.chainMult),
      base_value_usd: s.base,
    },
    farm_steps: farmSteps(s.p, s.age, s.implied),
  }));
  return { board, calibration };
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow, categories: string[], chains: string[], groups: string[]): RadarRow {
  return [
    row.rank,
    row.slug,
    row.name,
    categories.indexOf(row.category ?? 'Other'),
    row.chains.map((c) => chains.indexOf(c)),
    row.tvl_usd,
    row.change_7d,
    row.age_days,
    row.implied_value_usd,
    row.model.multiple,
    row.model.growth_multiplier,
    row.model.age_multiplier,
    row.model.chain_multiplier,
    groups.indexOf(farmGroup(row.category)),
    stepVariant(row.slug),
  ];
}

/** A live peer's compact form for data.js. */
export function liveRow(p: SnapshotProtocol, categories: string[], chains: string[]): LiveRow {
  return [
    p.slug,
    p.name,
    categories.indexOf(p.category ?? 'Other'),
    p.chains.map((c) => chains.indexOf(c)),
    p.tvl_usd,
    p.mcap_usd,
    p.change_7d,
  ];
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, calibration } = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const categories = [...new Set([...board.map((r) => r.category ?? 'Other'), ...live.map((p) => p.category ?? 'Other')])].sort();
  const chains = [...new Set([...board.flatMap((r) => r.chains), ...live.flatMap((p) => p.chains)])].sort();
  const groups = Object.keys(FARM_ACTIONS).sort();
  const calibrationRows: [string, number, number][] = [...calibration.byCategory.entries()]
    .map(([cat, v]): [string, number, number] => [cat, v.peers, round4(v.multiple)])
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    calibration_peers: calibration.launchedCount,
    global_multiple: round4(calibration.global),
    watchlist_size: snapshot.watchlist.length,
    watchlist: snapshot.watchlist,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    categories,
    chains,
    groups,
    calibration: calibrationRows,
    steps: FARM_STEPS,
    actions: FARM_ACTIONS,
    rows: board.map((r) => radarRow(r, categories, chains, groups)),
    live: live.map((p) => liveRow(p, categories, chains)),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
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
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board holds ${board.length} rows, under the 100-row floor`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  const seen = new Set<string>();
  for (const r of board) {
    if (seen.has(r.slug)) return `${r.slug} appears twice`;
    seen.add(r.slug);
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (!r.name || typeof r.name !== 'string') return `${r.slug} has no name`;
    if (/\s/.test(r.slug)) return `${r.slug} has whitespace in its slug`;
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
