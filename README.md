# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/risadeden76/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/risadeden76/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks the pre-token protocols DefiLlama tracks by what a launch would be worth, calibrated on the snapshot itself: a log-log size curve fitted by OLS on the launched protocols (log(market cap) = a + b·log(TVL)), with per-category residual adjustments where a category has at least four launched peers, and token odds from the no-token clock. The model is validated out of sample by the code itself — leave-one-out and walk-forward numbers are printed on the dashboard's cover and in the integrity strip — and every farm plan is costed in $/hour netted, with a farm / thin / skip verdict. A static dashboard shows the ranked board, an eight-step farm plan for every protocol, and the calibration behind every number.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path/to/snapshot.json>
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=ekkx10fx&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
