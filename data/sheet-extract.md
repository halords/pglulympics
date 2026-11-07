# Sheet extract — faithful record (2026-11-07)

## Full tab inventory (enumerated via live browser 2026-11-07; all tabs pulled via export CSV)
10 tabs = SUM tally + 9 sports. GIDs: SUM 2096581143 · Basketball 189028619 · Volleyball
1301000070 · Bowling 1667625131 · Pickle Ball 2085680548 · Badminton 590501769 ·
Athletics 1234658953 · Mobile Games 802742828 · Chess 1942970214 · Laro ng Lahi 165154871.

Two tab families:
- **Fixture tabs** (standings + dated fixtures): Volleyball, Basketball, Pickleball, Badminton.
- **Entry-matrix tabs** (team × category grid of "1" / "Incomplete" / blank; a header date;
  NO fixtures, times, or venues): Bowling (Nov 25), Athletics (Nov 9), Mobile Games (Nov 9),
  Chess (Nov 9), Laro ng Lahi (Nov 9). Raw transcriptions of the two big fixture tabs:
  data/tabs/pickleball.txt, data/tabs/badminton.txt. Seed builder: scripts/build_seed_v2.py;
  migration generator: scripts/gen_migration7.py.

### Basketball (gid=189028619)
Same "Round Robin Match Tracker & Standings" template as Volleyball. Men's: 10 teams,
Bracket A (AGKAYSA GUARDians, TRIFORCE BANNUARS, Agkaysa FOURce, THE CODE BLUES, EconoMIX) /
Bracket B (CODE RED, TEAM 4-MIDABLE, ELYUNITED HEALTH WARRIORS, ECO-AGKAYSA, PDRRMO HAZARD
BREAKERS); Women's: only 4 teams (CODE RED, TEAM 4-MIDABLE, Agkaysa FOURce, THE CODE BLUES),
single round robin. One interleaved fixture list for both divisions, Match # 1–26 (Men 20 RR =
2×C(5,2) all intra-bracket ✓; Women 6 RR = C(4,2) ✓), scores as final totals (SCORES Team A/B
columns). Venues: DMMMSU Gym (Nov 9), San Juan Gym (Nov 11–26). Semis Nov 25 (M G1 9:00, W G2
10:00, W G1 10:20, M G2 10:30), Bronze/Gold Nov 26. Sheet quirks: two women's starts read
"12:40 AM" inside a midday sequence → seeded as 12:40 PM; semifinal seeding not stated →
Men crossover A1vB2/B1vA2, Women 1v4/2v3 (assumptions, flagged).

### Pickleball (gid=2085680548) + Badminton (gid=590501769)
Same template as each other: entry matrix over 9 categories (Executive Boys/Girls/Mixed,
40 Boys/Girls/Mixed, 39 Boys/Girls/Mixed), then fixture lists for Nov 16 & 18 at
"Heritage 2500" printed in TWO parallel columns (= two courts; seeded as venues
"Heritage 2500 · Court 1/2"). The "Match #" column holds the CATEGORY, not a number.
15-minute grid, 8:00 AM–5:00 PM. Nov 18 adds playoffs for the 39 categories with TEXT slots
("Bracket 1 – Rank 1", "Loser Semifinal 1", "Winner Semifinal 2", ...). The RR pairings form
a SINGLE round robin per category (no bracket split exists in the pairings), so semifinal
slots are seeded as single-table ranks 1v4 / 2v3 (flagged assumption). Repeated pairings
occur (some pairs meet twice) — kept as listed. Badminton Executive categories have exactly
one entrant (TEAM 4-MIDABLE) and fixture rows with an empty Team B — not matches; skipped.
Badminton typo "PDRRMO HAZARD BREAKERSA" normalized. Pickleball 39 Boys lists its Semifinal 1
at Nov 18 5:00 PM but its Championship at 9:45 AM the same day (impossible order — kept as
listed, flagged for the organizers). Pickleball 39 Girls has NO playoff rows in the sheet.
Counts seeded: Pickleball 89 fixtures, Badminton 96 fixtures. Entry matrices: entries =
matrix ∪ fixture participants (5 discrepancies, all fixture-side additions).

### Bowling (gid=1667625131) — Nov 25
Entry matrix only: Executive Mixed / 40 Mixed / 39 Mixed. Cells "1" or "Incomplete" or blank.
Modeled as 3 placement_only divisions, one placement event each (entered teams as slots,
date known, time/venue not in sheet → starts_at NULL).

### Athletics (gid=1234658953) — Nov 9
Entry matrix only: 100 Boys/Girls, 200 Boys/Girls, 4X100 Mixed, 800 Boys/Girls, Shot Put
Boys/Girls (9 events). Modeled as 9 placement_only divisions, one placement event each.

### Mobile Games (gid=802742828) — Nov 9
Entry matrix only: ML (all 10 teams), CODM (6 teams). Modeled as 2 simple-scoring divisions
with entries and NO fixtures (coordinators create fixtures in-app).

### Chess (gid=1942970214) — Nov 9
Entry matrix only: Boys (9 teams — all but ELYUNITED), Girls (2 teams: ELYUNITED, EconoMIX).
Modeled as 2 simple-scoring divisions with entries and NO fixtures.

### Laro ng Lahi (gid=165154871) — Nov 9
Entry matrix only: Kadang-Kadang, Shatong, Sack Race, Patintero, Tumbang Preso.
Modeled as 5 placement_only divisions, one placement event each.

## Tab: Overall Tally (SUM, gid=2096581143)
Columns: ID | Team Name | GOLD | SILVER | BRONZE | POINTS | RANK
| ID | Team |
|----|------|
| 1 | AGKAYSA GUARDians |
| 2 | CODE RED |
| 3 | TRIFORCE BANNUARS |
| 4 | TEAM 4-MIDABLE |
| 5 | Agkaysa FOURce |
| 6 | ELYUNITED HEALTH WARRIORS |
| 7 | THE CODE BLUES |
| 8 | ECO-AGKAYSA |
| 9 | EconoMIX |
| 10 | PDRRMO HAZARD BREAKERS |
All medal counts 0, points 0, rank 1 (pre-event). Points formula not stated anywhere in the tab.

## Tab: VOLLEYBALL (gid=1301000070)
Title: "Round Robin Match Tracker & Standings"
Standings model per division: ID | Team Name | Played | Wins | Losses | Win Pct (grouped by bracket)
Scoring: per-set score columns (SCORES: Team A / Team B pairs), Winner column ("Enter Team #").

Teams (both divisions, same 9):
- Bracket A: CODE RED, ELYUNITED HEALTH WARRIORS, TRIFORCE BANNUARS, THE CODE BLUES, TEAM 4-MIDABLE
- Bracket B: Agkaysa FOURce, ECO-AGKAYSA, EconoMIX, PDRRMO HAZARD BREAKERS
(Note: AGKAYSA GUARDians is in the overall tally but NOT in volleyball.)

Venue (all fixtures): DMMMSU Covered Court

### Fixtures — MEN'S (Match # is per-division)
| # | Date | Time | Team A | Team B |
|---|------|------|--------|--------|
| 1 | Nov 9, 2026 | 1:00 PM | CODE RED | THE CODE BLUES |
| 2 | Nov 9, 2026 | 2:00 PM | ELYUNITED HEALTH WARRIORS | TRIFORCE BANNUARS |
| 3 | Nov 11, 2026 | 12:30 PM | ECO-AGKAYSA | Agkaysa FOURce |
| 4 | Nov 11, 2026 | 1:30 PM | TRIFORCE BANNUARS | CODE RED |
| 5 | Nov 11, 2026 | 2:30 PM | THE CODE BLUES | TEAM 4-MIDABLE |
| 6 | Nov 11, 2026 | 3:30 PM | EconoMIX | PDRRMO HAZARD BREAKERS |
| 7 | Nov 16, 2026 | 12:30 PM | PDRRMO HAZARD BREAKERS | ECO-AGKAYSA |
| 8 | Nov 16, 2026 | 1:30 PM | Agkaysa FOURce | EconoMIX |
| 9 | Nov 16, 2026 | 2:30 PM | TEAM 4-MIDABLE | TRIFORCE BANNUARS |
| 10 | Nov 16, 2026 | 3:30 PM | CODE RED | ELYUNITED HEALTH WARRIORS |
| 11 | Nov 18, 2026 | 9:00 AM | PDRRMO HAZARD BREAKERS | Agkaysa FOURce |
| 12 | Nov 18, 2026 | 10:00 AM | ECO-AGKAYSA | EconoMIX |
| 13 | Nov 18, 2026 | 11:00 AM | ELYUNITED HEALTH WARRIORS | TEAM 4-MIDABLE |
| 14 | Nov 18, 2026 | 12:00 PM | TRIFORCE BANNUARS | THE CODE BLUES |
| 15 | Nov 23, 2026 | 9:00 AM | THE CODE BLUES | ELYUNITED HEALTH WARRIORS |
| 16 | Nov 23, 2026 | 10:00 AM | TEAM 4-MIDABLE | CODE RED |
| Semis G1 | Nov 25, 2026 | 12:30 PM | TBD | TBD |
| Semis G2 | Nov 25, 2026 | 1:30 PM | TBD | TBD |
| Bronze | Nov 26, 2026 | 9:00 AM | TBD | TBD |
| Gold | Nov 26, 2026 | 10:00 AM | TBD | TBD |

### Fixtures — WOMEN'S
| # | Date | Time | Team A | Team B |
|---|------|------|--------|--------|
| 1 | Nov 9, 2026 | 3:00 PM | CODE RED | THE CODE BLUES |
| 2 | Nov 9, 2026 | 4:00 PM | ELYUNITED HEALTH WARRIORS | TRIFORCE BANNUARS |
| 3 | Nov 11, 2026 | 8:30 AM | TRIFORCE BANNUARS | CODE RED |
| 4 | Nov 11, 2026 | 9:30 AM | THE CODE BLUES | TEAM 4-MIDABLE |
| 5 | Nov 11, 2026 | 10:30 AM | ECO-AGKAYSA | Agkaysa FOURce |
| 6 | Nov 11, 2026 | 11:30 AM | EconoMIX | PDRRMO HAZARD BREAKERS |
| 7 | Nov 16, 2026 | 8:30 AM | PDRRMO HAZARD BREAKERS | ECO-AGKAYSA |
| 8 | Nov 16, 2026 | 9:30 AM | Agkaysa FOURce | EconoMIX |
| 9 | Nov 16, 2026 | 10:30 AM | CODE RED | ELYUNITED HEALTH WARRIORS |
| 10 | Nov 16, 2026 | 11:30 AM | TEAM 4-MIDABLE | TRIFORCE BANNUARS |
| 11 | Nov 18, 2026 | 1:00 PM | PDRRMO HAZARD BREAKERS | Agkaysa FOURce |
| 12 | Nov 18, 2026 | 2:00 PM | ECO-AGKAYSA | EconoMIX |
| 13 | Nov 18, 2026 | 3:00 PM | ELYUNITED HEALTH WARRIORS | TEAM 4-MIDABLE |
| 14 | Nov 18, 2026 | 4:00 PM | TRIFORCE BANNUARS | THE CODE BLUES |
| 15 | Nov 23, 2026 | 11:00 AM | THE CODE BLUES | ELYUNITED HEALTH WARRIORS |
| 16 | Nov 23, 2026 | 12:00 PM | TEAM 4-MIDABLE | CODE RED |
| Semis G1 | Nov 25, 2026 | 2:30 PM | TBD | TBD |
| Semis G2 | Nov 25, 2026 | 3:30 PM | TBD | TBD |
| Bronze | Nov 26, 2026 | 11:00 AM | TBD | TBD |
| Gold | Nov 26, 2026 | 12:00 PM | TBD | TBD |

Structure check: RR matches are intra-bracket only (A: 10 matches, B: 6 matches = 16). Semis pairing
not stated in sheet (assume crossover A1 vs B2 / B1 vs A2; must be configurable/manual override in app).
