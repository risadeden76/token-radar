# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/risadeden76/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/risadeden76/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks the pre-token protocols DefiLlama tracks by what a launch would be worth, calibrated on the snapshot itself: a log-log size curve fitted by OLS on the launched protocols (log(market cap) = a + b·log(TVL)), with no category adjustment — the global curve stands alone, because per-category residual adjustments scored neutral-to-negative out of sample (leave-one-out ×3.50 with them, ×3.40 without). Token odds come from the no-token clock. The model is validated out of sample by the code itself — leave-one-out ×3.40 (32% within 2×) and walk-forward ×3.01 (35% within 2×), printed on the dashboard's cover, in the integrity strip and in the entry title — and every farm plan is costed in $/hour netted, with a farm / thin / skip verdict. The board ranks 198 rows (40 watchlist + 20 rankable protocols above the floor the watchlist leaves out + 138 early ones below it), and a coverage table accounts for all 758 protocols in the snapshot. A static dashboard shows the ranked board, an eight-step farm plan for every protocol, and the calibration behind every number.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path/to/snapshot.json>
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=ekkx10fx&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
