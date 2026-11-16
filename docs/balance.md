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

A bot Cantor's cut is 20, times the Veyl bot multiplier 1.3, so 26 a cut. A Snapper has 55 health and no shield, so it dies to the third cut. At 52 it dies to the second. That one step is why every Veyl v Gloam lever was a cliff: Snapper health 55 to 52 alone moved Veyl v Gloam from 30-42 to 66-6 (144 matches), and Veyl bot multipliers 1.45/1.3 to 1.55/1.4 moved it from 17-19 to 35-1. Percent upgrades move the same line in matches: Ground Edge 1 (+25%) makes the cut 32.5, two cuts kill a Snapper again, and Hide 1 (+25% health) puts it back to three. So who buys their first level first decides the fight. The fix is finer steps (a smaller, faster cut, so a step is 4 cuts to 3 rather than 3 to 2), which round 3 tries. The list of every hits-to-kill pair within 10% of a step, with and without research, is in [breakpoints.md](breakpoints.md) (round 3).

## Undecided matches: options for an end rule (Mat's call)

Stream D traced the Gloam mirror draws: both sides still have armies of 20 to 60 and each loses 150 to 250 fighters. They are even trades, not wins the bot fails to finish, so a bot hunt rule does not end them. Of the 18 draws in the round 2 table, 12 are Gloam mirrors. Options, with numbers:

1. **Points win at the time limit, by value destroyed.** Decides all 18. In 8 of the 18 the two sides destroyed within 10% of each other's value, so the result is close to a coin flip in those.
2. **Overtime on buildings** (built in: `OVERTIME`, off). After the start minute, buildings take more damage each minute. Numbers: see the table that follows (mirrors, 108 matches each).
3. **Sudden-death Flux** (not built): after a set minute, vents stop paying and each side's Flux drains, so tier-2 and tier-3 armies cannot be rebuilt. Needs rules code (stream A); not measured.

## Round 3: the end rule, a softer Snapper bite

| Number | Was | Now | Why |
|---|---|---|---|
| `OVERTIME` (data.ts) | off | start 1200, perMin .2, limit 2400 | Mat's choice on 2026-11-14, "Overtime, then points": from minute 20 buildings take 20% more damage for each minute that passes, and at minute 40 the side (in team games, the alliance) that destroyed more value wins. A tie on value breaks on worth still standing; there are no draws. Fair skirmishes only, not story jobs or the classic raid match. It holds online (the server decides and tells each player it was on points) and in replays. Test: test/endrule.ts. |
| Snapper bite (`G_TUNE.bite.snapper`) | 7 | 6.9 | With the rule on, Veyl v Gloam was 30 to 42. 6.8 overshot to 42 to 30 (on lead 219c804); 6.9 gives 37 to 35. |

Tried and not kept:

- A finer Cantor cut, 15 every 0.71 s (the same damage a second): Veyl v Gloam 57 to 15 (144 matches, Gloam pairings). Three cuts of 19.5 still kill a Snapper, only sooner. A finer cut has to change the cuts-to-kill count, not the speed; see the breakpoint list.
- Snapper bite 6.5: Ironhold v Gloam 40 to 30, Veyl v Gloam 48 to 23 (too far).
- Gloam army mix with fewer Snappers (brood-mix weights Snapper 3 to 1.8, Quillback 2.4 to 3, Blister 1.2 to 1.6): the Snapper share only fell from 65% to 62%; win rates unchanged. Trial option `brood` in tools/review.ts.

### Before (lead e8f7071 with the end rule on, Snapper bite 7, 324 matches, Medium and Large)

- Ironhold v Veyl: 36 to 36
- Ironhold v Gloam: 36 to 36
- Veyl v Gloam: 30 to 42 (Gloam 58%)
- Mirrors: Ironhold yard 13, far 23. Veyl yard 22, far 14. Gloam yard 20, far 16.
- Nothing undecided; 4 matches won on points; middle match 18.9 minutes.

Without the end rule (lead 219c804, round 2 numbers) the same table had 18 undecided. The rule alone took Ironhold v Gloam from 29-42 to 36-36: Gloam wins that used to stall at the time limit now end.

### After (same lead, bite 6.9, 324 matches)

- Ironhold v Veyl: 36 to 36 (50%)
- Ironhold v Gloam: 32 to 40 (Gloam 56%)
- Veyl v Gloam: 37 to 35 (Veyl 51%)
- Mirrors: Ironhold yard 13, far 23. Veyl yard 22, far 14. Gloam yard 19, far 17.
- Nothing undecided; 5 won on points; middle match 19.3 minutes. Rows: /mnt/project-files/full-depth/L/r3/full-c89bite69.jsonl.

72 matches a pairing is about 6 points either way of noise, so every pairing is inside it; the gate's 270 a pairing is not yet reached. The Ironhold and Veyl mirrors each lean one way by 64% and 61% over 36 matches; round 2 had them even, so it is probably noise, to be re-measured with more seeds.

## Finding 3: the Gloam win with Snappers, before their tech

Snappers are 56% to 72% of Gloam army spend (gate: none over 35%). In the round 3 table 56 of 144 Gloam sides in a cross pairing never grew a Quill Garden: those won 48 of 56, in 9.6 minutes on average. The 88 that did grow one won 27, in 18 minutes. So the Gloam's wins are Snapper rushes, and a Gloam side that techs loses.

Making the bot grow its Garden every time shows it plainly (Gloam pairings, 180 matches each):

| Trial | Ironhold v Gloam | Veyl v Gloam | Snapper share |
|---|---|---|---|
| as is | 32 to 40 | 37 to 35 | 65%, 72% |
| Garden first at 4 fighters, its price held | 72 to 0 | 72 to 0 | 30%, 22% |
| Garden price held in its old place | 71 to 1 | 72 to 0 | 32%, 29% |
| Garden first at 8 fighters | 72 to 0 | 71 to 1 | 28%, 25% |

(Trial options `garden` and `ghold`, BROOD_EARLY in gloam/brain.ts; off by default.) Every way of getting the mix the gate asks for loses every match. That is not a number to nudge. It points to the Gloam's second tier (Quillback, Blister, Shellback, and the Bite and Hide levels) losing to the Ironhold and Veyl armies it meets, with only the early Snapper swarm keeping the Gloam level. Not yet split apart: how much is the tier itself and how much is the ore spent on the Garden while the foe is still building up. The fix is a stronger Gloam mid-game together with a slower Snapper rush, in one step, so the win rate holds while the mix changes. That is round 4, with stream D.

## Breakpoint list (round 3)

The full lists are in [breakpoints.md](breakpoints.md): 192 of 291 pairs that kill in six hits or fewer sit within 10% of a step with no research, 131 of 213 with every level bought. The ones between the kinds bots build most (round 3 spend):

- **Cantor, Bell and Lancer on a Snapper: 3 hits, 2 with a hit 10% harder**, with research and without (26 into 55; 44.9 into 95 with every level). This is Finding 2, and it is why Snapper bite, not Snapper health or Cantor numbers, is the lever for Veyl v Gloam. Keep Cantor damage and Snapper health apart by more than 10% from this line in any later round.
- Blister on a Snapper: 2 hits, 3 if 10% softer (Gloam mirror).
- Piledriver (set) on a Quillback: 3 hits, 2 if 10% harder, both ways. Breacher on a Quillback: 3, 4 if softer (5 and 6 with research).
- Bell on a Piledriver: 4 hits, 3 if harder (5 and 4 with research).
- Piledriver on a Snapper: 4 hits, 5 if softer, both ways.
- Quillback on a Snapper: 5 hits (6 or 4 either way), and on a Linesman 5 or 6: the Quillback's quill sits on a step against nearly everything small.
- Knell on a set Piledriver: 2 hits, 3 if softer, both ways.

Not counted: healing and shield regrowth between hits (a slow attacker can need one more), damage over time, splash and the first-person aim bonus.

## Cheese pass (2026-11-15, asked by Mat)

Mat's ask: find the cheese strategies and fix them so real play wins. Tool: `tools/fp.ts`, a headless scripted player (one side runs itself as a
player's side on auto, while the script drives one body in first person with perfect aim through the real controls and gives orders from
above). Every cheese was played on all nine pairings, maps 0-2, two seeds (54 matches), 15 minutes, and compared with the same player doing
nothing special (`cmd`: 10 of 54 won by minute 15, none by minute 6). Rows: /mnt/project-files/full-depth/L/cheese/.

| Cheese | What the script does | Before | After |
|---|---|---|---|
| Long-range sniping | drives an Ironhold rifle, stands 110 m off, shoots whatever is nearest, backs away from fighters | 19 of 54; Ironhold 18 of 18, no body lost | 11 of 54; Ironhold 5 of 18 |
| Same, standing off at 50 m | | (Ironhold 14 of 18 at 65 m) | Ironhold 12 of 18, no better than plain fighting in first person (13 of 18) |
| Snapper all-in | every fighter sent at the far base the moment it is out | 9 of 54, 7 by minute 6: Gloam v Veyl 6 of 6, the Choir Stone down at 3:20 | fixed 2026-11-16: Choir Stone bolt (see below) |
| Main-building snipe | every fighter told to hit the main building and nothing else | 8 of 54, 5 by minute 6 (all Gloam v Veyl) | fixed with it: 0 of 12 |
| Worker harass | a driven body that only shoots workers | 16 of 54 | 17 of 54 |
| Driven rush | a driven body runs at the far base from its first second | 33 of 54, 1 by minute 6 | 29 of 54, 3 by minute 6 |
| Points turtle | never pushes, keeps the army home, hopes to win on points at 40 | 7 of 54 on points, 47 lost | not changed: not a cheese |

(The After column was measured with an early version of the Veyl guard on, which is now off; it touches only matches with a Veyl side.)

The fixes:

1. **Driven gun reach** (`REACH` in ironhold/rules.ts). The aimed guns hit for full damage out to 150 m and the Autocannon to 140 m, while
   bot guns reach 10 to 44 m, so a player could stand where nothing could answer. Now full damage to 28 m (Linesman), 22 (Patch), 50
   (Longshot), 30 (Autocannon), falling to none at 45, 40, 80 and 50. The Veyl and Gloam driven guns already stop at 70 m and could not do this.
2. **Bots answer a far shooter** (`HUNT` in game.ts). A player's shot from more than 22 m off sends the bot fighters within 60 m of what
   was hit after the shooter (once every 2 s a side). Bot-only matches never meet it, so bot tables do not move.
3. **Crew bonus softened** (`LEAD` in command.ts, Mat's pick): 1.15 / .92, was 1.25 / .85. A scripted driver beside the army beat the bot
   30 of 36 at 40 minutes with the old bonus, 24 of 36 with the new one; 19 of 36 with none, and 20 of 36 from the command view only.

**The early Snapper all-in against the Veyl (fixed 2026-11-16, Mat: "Fix that cheese move").** About twelve Snappers sent at 1:50 kill every Tender and the Choir Stone by 3:30,
because the Veyl bot has spent every coin on Tenders and has no Cantor yet. Four ways of making the Veyl bot guard its opening were tried
(`VEYL_EARLY` in veyl/conductor.ts, shipped off): each stopped the all-in (0 of 6 to 1 of 9) but cost the Veyl the ordinary bot match
against the Gloam, which opens with the same Snapper flood: Veyl v Gloam 37 to 35 with the guard off, 20 to 52, 17 to 55 and 8 to 64 with it
on (72 matches each). Slower Snappers (build time 10 s, or 35 ore a pair) did not stop it either. This is the same problem as Finding 3: the
Gloam win with an early Snapper flood, so the fix belongs with round 4 (a slower Snapper rush with a stronger Gloam mid-game, stream D).

Fix: the Choir Stone's own bolt (`CHOIR_GUN` in veyl/rules.ts) went from 6 every 1.15 s at 21 m to 11 every 0.8 s at 22 m. It was half the
Ironhold Headframe's rivet gun (9 every 0.8 s at 20 m), which is why the same all-in won 1 of 6 against Ironhold and 6 of 6 against the Veyl.
Scripted Gloam all-in on the Veyl, 9 matches each (tools/fp.ts allin, maps 0-2): as it was 9 of 9 by 3:20; bolt 9 / 0.8 s 8 of 9 by 6:40;
11 / 0.8 s at 22 m 1 of 9; 12 / 0.8 s at 24 m 0 of 9. With a 12 bolt the Gloam and Ironhold all-ins and main-building snipes on the Veyl
won 0 of 12 each, and a driven rush 4 of 12, none by minute 6.

Bot tables (3 seeds, maps 0,1,2,20,21,22, rows in /mnt/project-files/full-depth/L/rush/): as it was, 108 matches, Ironhold v Veyl 17 to 19,
Ironhold v Gloam 16 to 20, Veyl v Gloam 17 to 19. With the 12 bolt and 2400 health: 17 to 19, 16 to 20, 25 to 11 (too far). With the 12
bolt alone, Veyl v Gloam 25 to 11 over 36. Shipped, 11 at 22 m with the old health: Veyl v Gloam 19 to 17 over 36.

Tried first and dropped, since the Gloam bot itself lives off the cheap Snapper (Snapper 63-75% of Gloam army spend): a fair Snapper price
(50 a pair: the Gloam lost 144 of 144; 36 a pair, about even in equal-value duels: the all-in still won 9 of 9), a weaker bite on buildings
(the Stone fell at 3:54 instead of 3:24), and a Gloam rebuild (6 more Grazers a Cap, more ore a trip, fewer Blisters: Ironhold v Gloam even,
but the Veyl then lost 19 to 23 of 24, and Cantor or Lancer bonus damage on living bodies held the Veyl near 7 of 24). The Snapper share and
the Gloam mid-game stay round 4 work.

Also seen: a driven body with perfect aim is far stronger than its bot, which real players are not; the Gloam bot's Snappers come out two at
a time and run at a driven Linesman pair after pair (Ironhold v Gloam driven rush: 2 of 6 over by minute 5 on map 0).
