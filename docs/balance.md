# Ore Else balance log (stream L)

Every number change, with the tables before and after it and the reason for it. Tables are bot matches at Night shift on fair layouts, from `node tools/table.mjs <seeds> <pairs> <maps>`. In a pairing "A v B: x to y" counts A's wins first. "At the yard" means that faction held the yard end.

## How to measure

- `node tools/table.mjs 6 01,10,02,20,12,21,00,11,22 0,1,2,20,21,22` is 324 matches: all nine pairings, both ends, Medium and Large maps, six seeds each. At four matches at a time it takes about an hour. `all` as the maps argument runs the three 1v1 maps at all four sizes. `OUT=file` names the rows file, and `PAR=n` sets how many matches run at once.
- A fourth argument passes trial numbers to every match without editing the source. For example, `'{"vhp":1.45,"vdmg":1.3,"cleaveK":.45,"set":{"snapper":{"hp":55}}}'` sets the Veyl bot multipliers, the Cantor side-cut share and the Snapper's health.
- The summary adds up spend by kind for each faction (gate line 3) and the top unit's share of army spend in each pairing.
- `node tools/run-ts.mjs tools/duels.ts '{"runs":6,"only":"cantor,snapper","vs":"linesman,dustbike"}'` runs equal-value fights on open ground under match conditions (bot bodies, Veyl multipliers on). Value is ore + 2 x Flux. The two groups swap ends every other run. `... duels.ts sum <rows>` flags any pair outside 25% to 75%.
- Trial numbers can also reach buildings (`'{"set":{"mothercap":{"cost":300}}}'`) and the faction dial tables (`'{"tune":{"v":{"cantor":{"cut":15,"cd":0.71}}}}'`, `v` for V_TUNE, `g` for G_TUNE). The duel tool takes `cleave`, `cleaveK` and `skip` (resume a shard after its first n pairs).
- `node tools/run-ts.mjs tools/trace.ts '{"home":0,"out":0,"map":0,"seed":7}'` prints one match minute by minute for each end: ore mined, workers, army, Flux, vent taps, Headframes and pushes.
- Results barely move with the seed on a given map. Seeds shuffle worker start spots and brain timing, but most matches on one map end the same way. So a table moves in steps, and a single map can lean 6 to 0. Judge on the totals.

## Finding 1: the far end won because it could not tap Flux (fixed by stream A, PR 65)

On the combined rosters the far end won 93 to 61. On Needle's Eye it won 32 of 36, whatever the factions. The lean went away on flat ground and with vents off, and stayed with ledges, the natural's cliff ring, beacons and rally points each turned off. The far base could never tap a home vent. A crystal sat on one of its two home vents, because props were kept clear only round the yard. Its own Depot and Assay Office stood close enough to the other vent that a Pump Jack no longer fitted. So the far end never made Flux and put all its ore into Linesmen, which beat the yard's early Pump Jack. Stream A's PR 65 clears props off vents and keeps buildings a tap's width off an open vent. Needle's Eye then went 20 to 15, and 162 matches went 74 to 76 between the ends.

Tried and not kept: bots pushing on an army-worth edge instead of at six idle fighters. Alone it moved the far-end lean from 93-61 to 98-60, so the order of pushes was not the cause.

## Round 1 (numbers only)

| Number | Was | Now | Why |
|---|---|---|---|
| `Game.vBoost` (a Veyl body the AI drives takes hits / hp and deals x dmg, two-economy matches only) | hp 1.65, dmg 1.45 | hp 1.45, dmg 1.3 | At equal value a bot Cantor beat Linesmen, Breachers, Snappers, Quillbacks and Bells. Veyl beat Ironhold 52 to 17. |
| Snapper health (`G_UNIT.snapper.hp`) | 50 | 55 | Snappers lost every same-value fight to Linesmen and Cantors. They are 65 to 87% of Gloam army spend, so the Gloam army could not hold while the bot saved for a second Cap. |
| `CLEAVE.k`, new dial (share of a bot Cantor's swing that cuts each of up to 2 more bodies within 1.9 m) | 0.5, written into veyl/rules.ts | 0.45 | The side cut is what wins the Cantor its fights against packs of Snappers. Trials on the lead before C's PR 66: k 0.5 gave Veyl v Gloam 27 to 9, 0.4 gave 16 to 20, 0.25 gave 11 to 25. |

### Before (lead 8bfa8f7, 324 matches, Medium and Large)

- Ironhold v Veyl: 17 to 52, 3 undecided (Veyl at the yard 34 to 2)
- Ironhold v Gloam: 49 to 23
- Veyl v Gloam: 72 to 0
- Mirrors: Ironhold yard 12, far 21, 3 undecided. Veyl 15 to 14, 7 undecided. Gloam 12 to 12, 12 undecided.
- 25 of 324 undecided at 40 minutes (7.7%). Ore a minute: Ironhold 533, Veyl 455, Gloam 350.

### After (lead 6ed1080 plus these numbers, 324 matches)

- Ironhold v Veyl: 39 to 28, 5 undecided (Ironhold 58%)
- Ironhold v Gloam: 30 to 42 (Gloam 58%)
- Veyl v Gloam: 70 to 1. This did not follow the trials, and the lead had taken C's PR 66 in between. See "Open" below.
- Mirrors: Ironhold yard 12, far 21, 3 undecided. Veyl 13 to 16, 7 undecided. Gloam 14 to 13, 9 undecided.
- 25 of 324 undecided (7.7%). Middle decided match: 13.8 min on Medium, 16.5 on Large.

## Open after round 1

- **Veyl v Gloam.** On lead 6ed1080 it falls off a cliff. With Cantor side cuts off (`cleave` 0) it is 7 to 29, at share 0.25 it is 31 to 4, at 0.4 it is 36 to 0, and with Veyl multipliers 1.3/1.2 it is 29 to 6 (36 matches each, Medium). Stream D is fixing a Gloam rules bug: a Mother Cap that ripens into an Elder or Ancient Cap shrinks its Bloom from 20 m to 6 m, which cripples any Gloam base that tiers up. Gloam numbers wait for that fix, then the Veyl v Gloam table is measured again.
- **The Gloam expansion.** The Gloam mine level with Ironhold for 10 minutes, then stay on one Cap (stream D's probe). Next levers: the second Cap's price, or Bud supply.
- **Undecided matches** are at 7.7% against a 3% gate, mostly mirrors and Large maps. The gate rules out switching an end rule on (overtime is Mat's call). The bot side of it (winning armies that never finish the last Headframe) gets measured next.
- **Spend lines.** Snapper 65% of Gloam army spend and Cantor 43% of Veyl are over the 35% cap. A long tail of kinds is under the 3% floor.
- **The Dustbike** beats every same-value army in duels (Snappers at 89% health left). Bots rarely build it, so the tables do not show it yet.

## Round 2 (numbers only)

| Number | Was | Now | Why |
|---|---|---|---|
| `CLEAVE.k` (share of a bot Cantor's swing that cuts each of up to 2 more bodies) | 0.45 | 0.03 | The side cut won Veyl v Gloam 69 to 3. On its own it moves smoothly (36 matches each, Medium, lead f4fb7af: 0 gives 7-29, 0.05 11-25, 0.1 17-19, 0.15 22-14, 0.3 35-1), but cutting it also took away what let Cantors beat Linesmen: at 0.1, Ironhold beat Veyl 53 to 18. |
| Cantor shield (`V_UNIT.cantor.shield`) | 80 | 100 | Helps the Veyl against rifles far more than against Snappers (Medium, side cut 0.1: shield 110 moved Ironhold v Veyl from 27-9 to 13-23 but Veyl v Gloam only from 17-19 to 26-10). So shield up and side cut down together lift Veyl v Ironhold and lower Veyl v Gloam. |

Tried and not kept: Cantor speed 6.0 and 6.6 (Cantors also catch Snappers better, so Veyl v Gloam rose as much as Veyl v Ironhold); one side-cut body at 0.25 (same as 0.1); higher Veyl bot multipliers (a cliff, see below); Snapper health 52 or 50 (a cliff, see below).

### Before (lead 4e3fc6c as is, 324 matches, Medium and Large)

- Ironhold v Veyl: 43 to 25, 4 undecided
- Ironhold v Gloam: 29 to 42, 1 undecided
- Veyl v Gloam: 69 to 3
- Mirrors: Ironhold 17 to 17, 2 undecided. Veyl yard 12, far 21, 3 undecided. Gloam yard 16, far 8, 12 undecided.
- 22 of 324 undecided (6.8%).

### After (same lead with these two numbers, 324 matches)

- Ironhold v Veyl: 37 to 33, 2 undecided (Ironhold 53%)
- Ironhold v Gloam: 29 to 42, 1 undecided (Gloam 59%)
- Veyl v Gloam: 30 to 42 (Gloam 58%)
- Mirrors: Ironhold 17 to 17, 2 undecided. Veyl 17 to 18, 1 undecided. Gloam yard 16, far 8, 12 undecided.
- 18 of 324 undecided (5.6%). Rows: /mnt/project-files/full-depth/L/r2/full-cand1.jsonl.

The Gloam now lead both their pairings by about the same margin, so round 3 trims the Gloam (a softer Snapper bite) and smooths the Cantor's hit steps.

## Finding 2: Veyl v Gloam is a hit breakpoint

A bot Cantor's cut is 20, times the Veyl bot multiplier 1.3, so 26 a cut. A Snapper has 55 health and no shield, so it dies to the third cut. At 52 it dies to the second. That one step is why every Veyl v Gloam lever was a cliff: Snapper health 55 to 52 alone moved Veyl v Gloam from 30-42 to 66-6 (144 matches), and Veyl bot multipliers 1.45/1.3 to 1.55/1.4 moved it from 17-19 to 35-1. Percent upgrades move the same line in matches: Ground Edge 1 (+25%) makes the cut 32.5, two cuts kill a Snapper again, and Hide 1 (+25% health) puts it back to three. So who buys their first level first decides the fight. The fix is finer steps (a smaller, faster cut, so a step is 4 cuts to 3 rather than 3 to 2), which round 3 tries. A list of every cuts-to-kill pair within 10% of a step, upgrades counted, will be added here with round 3.

## Undecided matches: options for an end rule (Mat's call)

Stream D traced the Gloam mirror draws: both sides still have armies of 20 to 60 and each loses 150 to 250 fighters. They are even trades, not wins the bot fails to finish, so a bot hunt rule does not end them. Of the 18 draws in the round 2 table, 12 are Gloam mirrors. Options, with numbers:

1. **Points win at the time limit, by value destroyed.** Decides all 18. In 8 of the 18 the two sides destroyed within 10% of each other's value, so the result is close to a coin flip in those.
2. **Overtime on buildings** (built in: `OVERTIME`, off). After the start minute, buildings take more damage each minute. Numbers: see the table that follows (mirrors, 108 matches each).
3. **Sudden-death Flux** (not built): after a set minute, vents stop paying and each side's Flux drains, so tier-2 and tier-3 armies cannot be rebuilt. Needs rules code (stream A); not measured.
