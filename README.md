# makefun-gta6

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/ccxiaoba555/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/ccxiaoba555/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Vice Bay** is a 2D top-down open-world crime game set in an invented sun-soaked bay city of smugglers, neon motels and crews fighting over every corner — not a GTA remake, but its own place with its own people. Walk the streets or steal a car and drive a 3200×2400 map through traffic and pedestrians, rack up a wanted level and outrun the BBPD, and work your way up Mara's crew across **8 story jobs**. It ships with a HUD and minimap, a start screen with save support, and synthesized sound effects and radio — no build step, just open and play.

## The city

Vice Bay lives off the water: crates come in at the Marina after dark, the depot moves them by morning, and every corner from Coral Row to Gull Lane belongs to somebody. Mara runs the crew out of the safehouse; Rico tunes cars in his garage; the BBPD answers with roadblocks, spike strips and a helicopter called Air One. Respect is the only currency that matters here — earn it on jobs and turf, and the streets start tipping you off before the law arrives.

## 8 story jobs

1. **Cabbie for a Day** — pick up a fare on Coral Ave, drop them at the Marina.
2. **Hot Parcel** — a sealed parcel at the depot, 75 seconds to get it across town.
3. **Sunset Grand Prix** — street race: three checkpoints against the clock.
4. **Harbor Run** — smuggled crates from the Marina to the depot, quietly.
5. **Turf War: Coral Row** — plant the flag on three corners and the street is yours.
6. **Get Rico Out** — break Rico out near the depot and get him to the safehouse.
7. **Midnight Run** — four stars, one car, roadblocks and the chopper overhead.
8. **Three Stars to Home** — lose the whole precinct and reach the safehouse.

After the eighth job the city keeps handing out repeat taxi fares. Timed jobs go back on the board if the clock runs out.

## Systems

- **BBPD dispatch with escalation** — 1–5 wanted stars; at 3 stars roadblocks seal the streets and cops open fire, at 4 stars Air One circles overhead with a spotlight (heat won't cool off while it's watching) and spike strips shred your tires.
- **Crew & respect ranks** — Rookie → Hustler → Runner → Vice Bay Legend. Jobs and turf work raise respect; at Hustler the crew pays a 10% job bonus, at Runner tip-offs keep one patrol car off your tail and heat cools faster.
- **District standing** — Coral Row, Marina, Gull Lane, Depot District and Midtown each track your standing; claiming turf corners raises it.
- **Garage shop** — park at Rico's Garage and press G: engine (+12% top speed per tier), armor (cop rams hurt less) and paint, three tiers each, bought with job money.
- **Weapon slots** — pistol and shotgun (five-pellet spread), press Q to swap, K to fire.
- **Radio** — three synthesized stations (BAY FM 88 sunset pop, NEON 101 synthwave, GULL 94 bass & bounce), press R to switch; all music is WebAudio, no audio files.
- **Saves** — best cash and jobs done persist in localStorage.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot, drive |
| E | Steal / leave a car |
| J | Punch |
| K | Shoot |
| Q | Swap weapon |
| R | Switch radio station |
| G | Open the garage (parked beside it, in a car) |
| 1 / 2 / 3 | Buy engine / armor / paint in the garage |
| P / Esc | Pause |
| M | Mute |

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in your browser.

---

<sub>Entered on [make.fun](https://make.fun/?ref=gxmh0hrp&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
