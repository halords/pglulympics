#!/usr/bin/env python3
"""Build seed.json v2 (all 9 sports) + migration 7 SQL from the extracted workbook data.
Sources: data/tabs/{pickleball,badminton}.txt (transcribed fixture lists) + the entry
matrices and basketball fixtures transcribed inline below from the 2026-11-07 tab pulls.
Entries for racket sports = entry matrix UNION fixture participants (fixtures are the
operative schedule; discrepancies are printed as warnings)."""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEAMS = ["AGKAYSA GUARDians", "CODE RED", "TRIFORCE BANNUARS", "TEAM 4-MIDABLE",
         "Agkaysa FOURce", "ELYUNITED HEALTH WARRIORS", "THE CODE BLUES",
         "ECO-AGKAYSA", "EconoMIX", "PDRRMO HAZARD BREAKERS"]
slugify = lambda s: re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

CATS = ["Executive Boys", "Executive Girls", "Executive Mixed", "40 Boys", "40 Girls",
        "40 Mixed", "39 Boys", "39 Girls", "39 Mixed"]

# ---------------- entry matrices (1 / Incomplete both = entered) ----------------
PICKLE_MATRIX = {
    "AGKAYSA GUARDians": {"Executive Mixed"},
    "CODE RED": {"40 Girls", "40 Mixed", "39 Boys", "39 Girls", "39 Mixed"},
    "TRIFORCE BANNUARS": {"39 Boys", "39 Girls", "39 Mixed"},
    "TEAM 4-MIDABLE": set(CATS),
    "Agkaysa FOURce": {"Executive Boys", "40 Boys", "40 Girls", "40 Mixed", "39 Boys", "39 Girls", "39 Mixed"},
    "ELYUNITED HEALTH WARRIORS": {"40 Boys", "39 Boys", "39 Mixed"},
    "THE CODE BLUES": {"40 Boys", "40 Mixed", "39 Boys", "39 Girls", "39 Mixed"},
    "ECO-AGKAYSA": {"40 Boys", "39 Mixed"},
    "EconoMIX": {"40 Girls", "39 Boys", "39 Girls", "39 Mixed"},
    "PDRRMO HAZARD BREAKERS": {"Executive Mixed", "39 Boys", "39 Girls", "39 Mixed"},
}
BADM_MATRIX = {
    "AGKAYSA GUARDians": {"39 Boys", "39 Girls", "39 Mixed"},
    "CODE RED": {"40 Girls", "40 Mixed", "39 Boys", "39 Girls", "39 Mixed"},
    "TRIFORCE BANNUARS": {"40 Boys", "40 Girls", "40 Mixed", "39 Boys", "39 Girls", "39 Mixed"},
    "TEAM 4-MIDABLE": set(CATS),
    "Agkaysa FOURce": {"40 Girls", "40 Mixed", "39 Boys", "39 Girls", "39 Mixed"},
    "ELYUNITED HEALTH WARRIORS": {"40 Boys", "40 Girls", "40 Mixed", "39 Boys", "39 Girls", "39 Mixed"},
    "THE CODE BLUES": {"40 Boys", "39 Boys", "39 Girls", "39 Mixed"},
    "ECO-AGKAYSA": {"40 Mixed", "39 Boys", "39 Mixed"},
    "EconoMIX": {"40 Girls", "39 Boys", "39 Girls", "39 Mixed"},
    "PDRRMO HAZARD BREAKERS": {"40 Boys", "39 Boys", "39 Girls", "39 Mixed"},
}
BOWLING_MATRIX = {  # Nov 25; cols: Executive Mixed, 40 Mixed, 39 Mixed
    "AGKAYSA GUARDians": {"40 Mixed", "39 Mixed"},
    "CODE RED": {"Executive Mixed", "40 Mixed", "39 Mixed"},
    "TRIFORCE BANNUARS": {"40 Mixed", "39 Mixed"},
    "TEAM 4-MIDABLE": {"Executive Mixed", "40 Mixed", "39 Mixed"},
    "Agkaysa FOURce": {"Executive Mixed", "40 Mixed", "39 Mixed"},
    "ELYUNITED HEALTH WARRIORS": {"Executive Mixed", "40 Mixed", "39 Mixed"},
    "THE CODE BLUES": {"Executive Mixed", "40 Mixed", "39 Mixed"},
    "ECO-AGKAYSA": {"40 Mixed", "39 Mixed"},
    "EconoMIX": {"40 Mixed", "39 Mixed"},
    "PDRRMO HAZARD BREAKERS": {"Executive Mixed", "40 Mixed", "39 Mixed"},
}
ATH_EVENTS = ["100 Boys", "100 Girls", "200 Boys", "200 Girls", "4X100 Mixed", "800 Boys", "800 Girls", "Shot Put Boys", "Shot Put Girls"]
ATH_MATRIX = {
    "AGKAYSA GUARDians": {"100 Boys", "200 Boys", "800 Boys"},
    "CODE RED": {"100 Boys", "100 Girls", "200 Girls", "4X100 Mixed", "800 Girls", "Shot Put Boys"},
    "TRIFORCE BANNUARS": set(ATH_EVENTS),
    "TEAM 4-MIDABLE": set(ATH_EVENTS),
    "Agkaysa FOURce": {"100 Boys", "100 Girls", "200 Boys", "4X100 Mixed", "800 Boys", "800 Girls", "Shot Put Boys", "Shot Put Girls"},
    "ELYUNITED HEALTH WARRIORS": {"100 Boys", "100 Girls", "200 Boys", "200 Girls", "800 Boys", "Shot Put Girls"},
    "THE CODE BLUES": {"100 Boys", "200 Boys", "4X100 Mixed", "Shot Put Boys"},
    "ECO-AGKAYSA": set(ATH_EVENTS),
    "EconoMIX": {"200 Boys", "4X100 Mixed", "800 Boys"},
    "PDRRMO HAZARD BREAKERS": set(ATH_EVENTS),
}
LARO_GAMES = ["Kadang-Kadang", "Shatong", "Sack Race", "Patintero", "Tumbang Preso"]
LARO_MATRIX = {
    "AGKAYSA GUARDians": set(LARO_GAMES), "CODE RED": set(LARO_GAMES),
    "TRIFORCE BANNUARS": {"Kadang-Kadang", "Sack Race", "Patintero", "Tumbang Preso"},
    "TEAM 4-MIDABLE": set(LARO_GAMES), "Agkaysa FOURce": set(LARO_GAMES),
    "ELYUNITED HEALTH WARRIORS": {"Kadang-Kadang", "Shatong", "Patintero"},
    "THE CODE BLUES": set(LARO_GAMES),
    "ECO-AGKAYSA": {"Shatong", "Sack Race", "Patintero", "Tumbang Preso"},
    "EconoMIX": set(LARO_GAMES), "PDRRMO HAZARD BREAKERS": set(LARO_GAMES),
}
ML_TEAMS = TEAMS[:]
CODM_TEAMS = ["CODE RED", "TRIFORCE BANNUARS", "TEAM 4-MIDABLE", "THE CODE BLUES", "EconoMIX", "PDRRMO HAZARD BREAKERS"]
CHESS_BOYS = [t for t in TEAMS if t != "ELYUNITED HEALTH WARRIORS"]
CHESS_GIRLS = ["ELYUNITED HEALTH WARRIORS", "EconoMIX"]

# ---------------- basketball fixtures ----------------
# (division, match#, date, time, venue, teamA, teamB) — times as listed; the sheet's two
# "12:40 AM" women's starts are normalized to 12:40 PM (midday sequence; flagged in STATE.md).
BB = [
    ("W", 1, "2026-11-09", "12:50", "DMMMSU Gym", "TEAM 4-MIDABLE", "CODE RED"),
    ("M", 2, "2026-11-09", "13:00", "DMMMSU Gym", "AGKAYSA GUARDians", "THE CODE BLUES"),
    ("M", 3, "2026-11-09", "14:00", "DMMMSU Gym", "CODE RED", "ECO-AGKAYSA"),
    ("W", 4, "2026-11-09", "15:10", "DMMMSU Gym", "Agkaysa FOURce", "THE CODE BLUES"),
    ("M", 5, "2026-11-09", "15:20", "DMMMSU Gym", "TRIFORCE BANNUARS", "Agkaysa FOURce"),
    ("M", 6, "2026-11-09", "16:20", "DMMMSU Gym", "TEAM 4-MIDABLE", "ELYUNITED HEALTH WARRIORS"),
    ("M", 7, "2026-11-11", "08:30", "San Juan Gym", "Agkaysa FOURce", "AGKAYSA GUARDians"),
    ("M", 8, "2026-11-11", "09:30", "San Juan Gym", "ECO-AGKAYSA", "PDRRMO HAZARD BREAKERS"),
    ("W", 9, "2026-11-11", "12:30", "San Juan Gym", "THE CODE BLUES", "TEAM 4-MIDABLE"),
    ("W", 10, "2026-11-11", "12:40", "San Juan Gym", "CODE RED", "Agkaysa FOURce"),
    ("M", 11, "2026-11-11", "10:30", "San Juan Gym", "ELYUNITED HEALTH WARRIORS", "CODE RED"),
    ("M", 12, "2026-11-11", "11:30", "San Juan Gym", "THE CODE BLUES", "EconoMIX"),
    ("M", 13, "2026-11-16", "10:30", "San Juan Gym", "PDRRMO HAZARD BREAKERS", "ELYUNITED HEALTH WARRIORS"),
    ("M", 14, "2026-11-16", "11:30", "San Juan Gym", "CODE RED", "TEAM 4-MIDABLE"),
    ("W", 15, "2026-11-16", "12:30", "San Juan Gym", "THE CODE BLUES", "CODE RED"),
    ("W", 16, "2026-11-16", "12:40", "San Juan Gym", "TEAM 4-MIDABLE", "Agkaysa FOURce"),
    ("M", 17, "2026-11-16", "08:30", "San Juan Gym", "EconoMIX", "Agkaysa FOURce"),
    ("M", 18, "2026-11-16", "09:30", "San Juan Gym", "AGKAYSA GUARDians", "TRIFORCE BANNUARS"),
    ("M", 19, "2026-11-18", "12:30", "San Juan Gym", "TEAM 4-MIDABLE", "PDRRMO HAZARD BREAKERS"),
    ("M", 20, "2026-11-18", "13:30", "San Juan Gym", "ELYUNITED HEALTH WARRIORS", "ECO-AGKAYSA"),
    ("M", 21, "2026-11-18", "14:30", "San Juan Gym", "TRIFORCE BANNUARS", "EconoMIX"),
    ("M", 22, "2026-11-18", "15:30", "San Juan Gym", "Agkaysa FOURce", "THE CODE BLUES"),
    ("M", 23, "2026-11-23", "09:00", "San Juan Gym", "THE CODE BLUES", "TRIFORCE BANNUARS"),
    ("M", 24, "2026-11-23", "10:00", "San Juan Gym", "EconoMIX", "AGKAYSA GUARDians"),
    ("M", 25, "2026-11-23", "11:00", "San Juan Gym", "ECO-AGKAYSA", "TEAM 4-MIDABLE"),
    ("M", 26, "2026-11-23", "12:00", "San Juan Gym", "PDRRMO HAZARD BREAKERS", "CODE RED"),
]
BB_MEN_A = ["AGKAYSA GUARDians", "TRIFORCE BANNUARS", "Agkaysa FOURce", "THE CODE BLUES", "EconoMIX"]
BB_MEN_B = ["CODE RED", "TEAM 4-MIDABLE", "ELYUNITED HEALTH WARRIORS", "ECO-AGKAYSA", "PDRRMO HAZARD BREAKERS"]
BB_WOMEN = ["CODE RED", "TEAM 4-MIDABLE", "Agkaysa FOURce", "THE CODE BLUES"]

# ---------------- racket-sport fixture parsing ----------------
def parse_racket(path):
    rows = []
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        day, time, court, cat, a, b = [p.strip() for p in line.split("|")]
        rows.append({"day": int(day), "time": time, "court": int(court), "cat": cat, "a": a, "b": b})
    return rows

def to24(t):
    hm, ap = t.split(" ")
    h, m = [int(x) for x in hm.split(":")]
    if ap == "PM" and h != 12: h += 12
    if ap == "AM" and h == 12: h = 0
    return f"{h:02d}:{m:02d}"

def racket_divisions(rows, matrix, warnings, sport_name):
    """Group rows into category divisions; map playoff text to slot sources.
    Semifinal seeding: the sheet labels say 'Bracket 1 Rank 1 vs Bracket 2 Rank 2' but the
    pairings form a single round robin (no bracket split exists) -> single-table 1v4 / 2v3."""
    cats = {}
    for r in rows:
        cats.setdefault(r["cat"], []).append(r)
    divisions = []
    for cat in CATS:
        if cat not in cats and not any(cat in v for v in matrix.values()):
            continue
        fixtures, counters = [], {}
        participants = set()
        semis = {}  # label -> match ref for outcome sources
        pending_outcomes = []
        for r in sorted(cats.get(cat, []), key=lambda x: (x["day"], to24(x["time"]), x["court"])):
            date = f"2026-11-{r['day']:02d}"
            venue = f"Heritage 2500 · Court {r['court']}"
            a, b = r["a"], r["b"]
            if a.startswith("SEMIFINAL") or a.startswith("THIRD") or a.startswith("CHAMPIONSHIP"):
                kind = "semifinal" if a.startswith("SEMIFINAL") else "bronze" if a.startswith("THIRD") else "gold"
                label = ("Semifinal 1" if "SEMIFINAL 1" in a else "Semifinal 2" if "SEMIFINAL 2" in a
                         else "Third-Place Match" if kind == "bronze" else "Championship")
                fx = {"label": label, "stage": kind, "group": None, "date": date,
                      "time": to24(r["time"]), "venue": venue, "teamA": None, "teamB": None}
                if kind == "semifinal":
                    ranks = (1, 4) if label == "Semifinal 1" else (2, 3)
                    fx["slotA"] = {"kind": "group_rank", "group": "Round Robin", "rank": ranks[0]}
                    fx["slotB"] = {"kind": "group_rank", "group": "Round Robin", "rank": ranks[1]}
                    semis[label] = fx
                else:
                    outcome = "loser" if kind == "bronze" else "winner"
                    fx["slotA"] = {"kind": "match_outcome", "matchLabel": "Semifinal 1", "outcome": outcome}
                    fx["slotB"] = {"kind": "match_outcome", "matchLabel": "Semifinal 2", "outcome": outcome}
                fixtures.append(fx)
                continue
            if not b:
                warnings.append(f"{sport_name} {cat}: walkover row with no opponent ({a}, Nov {r['day']} {r['time']}) — skipped, not a match")
                participants.add(a)
                continue
            counters[cat] = counters.get(cat, 0) + 1
            fixtures.append({"label": f"Match {counters[cat]}", "stage": "round_robin",
                             "group": "Round Robin", "date": date, "time": to24(r["time"]),
                             "venue": venue, "teamA": a, "teamB": b})
            participants.add(a); participants.add(b)
        entered = {t for t, cs in matrix.items() if cat in cs}
        for p in sorted(participants - entered):
            warnings.append(f"{sport_name} {cat}: {p} appears in fixtures but not in the entry matrix — entry added from fixtures")
        entries = sorted(entered | participants, key=TEAMS.index)
        divisions.append({"name": cat, "slug": slugify(cat),
                          "groups": [{"name": "Round Robin", "teams": entries}],
                          "fixtures": fixtures})
    return divisions

def placement_divisions(names, matrix, date):
    divs = []
    for name in names:
        entries = [t for t in TEAMS if name in matrix.get(t, set())]
        divs.append({"name": name, "slug": slugify(name), "groups": [],
                     "entries": entries,
                     "fixtures": [{"label": name, "stage": "placement", "group": None,
                                   "date": date, "time": None, "venue": None,
                                   "entries": entries}]})
    return divs

STANDINGS = {"order": ["win_pct", "wins", "head_to_head", "set_ratio", "point_ratio"],
             "show_draws": False, "standings_points": {"win": 3, "draw": 1, "loss": 0}}
MEDALS = {"place_to_medal": {"1": "gold", "2": "silver", "3": "bronze"},
          "max_per_medal": {"gold": 1, "silver": 1, "bronze": 1}, "shared_allowed": False}

def main():
    warnings = []
    seed = json.loads((ROOT / "data/seed.json").read_text())

    # --- volleyball: add per-division scoring fields + playoff slot descriptors ---
    vb = seed["sports"][0]
    vb["defaultDurationMinutes"] = 60
    vb["formatNote"] = "Round-robin brackets, then crossover semifinals, bronze and gold matches."
    for div in vb["divisions"]:
        div["scoringKind"] = "set_based"
        div["scoringConfig"] = {"best_of": 3, "set_target": 25, "deciding_set_target": 15,
                                "win_by": 2, "cap": None, "allow_forfeit": True, "provisional": True}
        for fx in div["fixtures"]:
            fx["group"] = {"A": "Bracket A", "B": "Bracket B"}.get(fx.get("group"), fx.get("group"))
            if fx["label"] == "Semis G1":
                fx["slotA"] = {"kind": "group_rank", "group": "Bracket A", "rank": 1}
                fx["slotB"] = {"kind": "group_rank", "group": "Bracket B", "rank": 2}
            elif fx["label"] == "Semis G2":
                fx["slotA"] = {"kind": "group_rank", "group": "Bracket B", "rank": 1}
                fx["slotB"] = {"kind": "group_rank", "group": "Bracket A", "rank": 2}
            elif fx["label"] == "Bronze Match":
                fx["slotA"] = {"kind": "match_outcome", "matchLabel": "Semis G1", "outcome": "loser"}
                fx["slotB"] = {"kind": "match_outcome", "matchLabel": "Semis G2", "outcome": "loser"}
            elif fx["label"] == "Gold Match":
                fx["slotA"] = {"kind": "match_outcome", "matchLabel": "Semis G1", "outcome": "winner"}
                fx["slotB"] = {"kind": "match_outcome", "matchLabel": "Semis G2", "outcome": "winner"}

    # --- basketball ---
    bb_fixtures = {"M": [], "W": []}
    for div_key, num, date, time, venue, a, b in BB:
        bb_fixtures[div_key].append({"label": f"Match {num}", "stage": "round_robin",
                                     "group": ("Bracket A" if a in BB_MEN_A else "Bracket B") if div_key == "M" else "Round Robin",
                                     "date": date, "time": time, "venue": venue, "teamA": a, "teamB": b})
    def bb_playoffs(semis_times):
        out = []
        for label, date, time in semis_times:
            out.append({"label": label, "stage": "semifinal", "group": None, "date": date, "time": time,
                        "venue": "San Juan Gym", "teamA": None, "teamB": None})
        return out
    men_play = bb_playoffs([("Semis G1", "2026-11-25", "09:00"), ("Semis G2", "2026-11-25", "10:30")])
    men_play[0].update(slotA={"kind": "group_rank", "group": "Bracket A", "rank": 1}, slotB={"kind": "group_rank", "group": "Bracket B", "rank": 2})
    men_play[1].update(slotA={"kind": "group_rank", "group": "Bracket B", "rank": 1}, slotB={"kind": "group_rank", "group": "Bracket A", "rank": 2})
    men_play += [
        {"label": "Bronze Match", "stage": "bronze", "group": None, "date": "2026-11-26", "time": "15:00", "venue": "San Juan Gym", "teamA": None, "teamB": None,
         "slotA": {"kind": "match_outcome", "matchLabel": "Semis G1", "outcome": "loser"}, "slotB": {"kind": "match_outcome", "matchLabel": "Semis G2", "outcome": "loser"}},
        {"label": "Gold Match", "stage": "gold", "group": None, "date": "2026-11-26", "time": "16:00", "venue": "San Juan Gym", "teamA": None, "teamB": None,
         "slotA": {"kind": "match_outcome", "matchLabel": "Semis G1", "outcome": "winner"}, "slotB": {"kind": "match_outcome", "matchLabel": "Semis G2", "outcome": "winner"}},
    ]
    women_play = bb_playoffs([("Semis G1", "2026-11-25", "10:20"), ("Semis G2", "2026-11-25", "10:00")])
    women_play[0].update(slotA={"kind": "group_rank", "group": "Round Robin", "rank": 1}, slotB={"kind": "group_rank", "group": "Round Robin", "rank": 4})
    women_play[1].update(slotA={"kind": "group_rank", "group": "Round Robin", "rank": 2}, slotB={"kind": "group_rank", "group": "Round Robin", "rank": 3})
    women_play += [
        {"label": "Bronze Match", "stage": "bronze", "group": None, "date": "2026-11-26", "time": "13:00", "venue": "San Juan Gym", "teamA": None, "teamB": None,
         "slotA": {"kind": "match_outcome", "matchLabel": "Semis G1", "outcome": "loser"}, "slotB": {"kind": "match_outcome", "matchLabel": "Semis G2", "outcome": "loser"}},
        {"label": "Gold Match", "stage": "gold", "group": None, "date": "2026-11-26", "time": "14:00", "venue": "San Juan Gym", "teamA": None, "teamB": None,
         "slotA": {"kind": "match_outcome", "matchLabel": "Semis G1", "outcome": "winner"}, "slotB": {"kind": "match_outcome", "matchLabel": "Semis G2", "outcome": "winner"}},
    ]
    basketball = {"name": "Basketball", "slug": "basketball", "defaultDurationMinutes": 60,
                  "formatNote": "Men: two brackets of five, crossover semifinals. Women: four-team round robin, top four to semifinals. Then bronze and gold matches.",
                  "divisions": [
                      {"name": "Men's", "slug": "mens", "scoringKind": "simple", "scoringConfig": {"allow_forfeit": True},
                       "groups": [{"name": "Bracket A", "teams": BB_MEN_A}, {"name": "Bracket B", "teams": BB_MEN_B}],
                       "fixtures": bb_fixtures["M"] + men_play},
                      {"name": "Women's", "slug": "womens", "scoringKind": "simple", "scoringConfig": {"allow_forfeit": True},
                       "groups": [{"name": "Round Robin", "teams": BB_WOMEN}],
                       "fixtures": bb_fixtures["W"] + women_play},
                  ]}

    # --- racket sports ---
    pickle_divs = racket_divisions(parse_racket(ROOT / "data/tabs/pickleball.txt"), PICKLE_MATRIX, warnings, "Pickleball")
    badm_divs = racket_divisions(parse_racket(ROOT / "data/tabs/badminton.txt"), BADM_MATRIX, warnings, "Badminton")
    for d in pickle_divs:
        d["scoringKind"] = "set_based"
        d["scoringConfig"] = {"best_of": 3, "set_target": 11, "win_by": 2, "cap": None, "allow_forfeit": True, "provisional": True}
    for d in badm_divs:
        d["scoringKind"] = "set_based"
        d["scoringConfig"] = {"best_of": 3, "set_target": 21, "win_by": 2, "cap": 30, "allow_forfeit": True, "provisional": True}
    pickleball = {"name": "Pickleball", "slug": "pickleball", "defaultDurationMinutes": 15,
                  "formatNote": "Nine age/executive categories on two courts at Heritage 2500 (Nov 16 & 18). Single round robin per category; 39 & under categories continue to semifinals, third-place and championship matches.",
                  "divisions": pickle_divs}
    badminton = {"name": "Badminton", "slug": "badminton", "defaultDurationMinutes": 15,
                 "formatNote": "Nine age/executive categories on two courts at Heritage 2500 (Nov 16 & 18). Single round robin per category; 39 & under categories continue to semifinals, third-place and championship matches.",
                 "divisions": badm_divs}

    # --- placement / matrix-only sports ---
    bowling = {"name": "Bowling", "slug": "bowling", "defaultDurationMinutes": 60,
               "formatNote": "One-day team event on November 25 — three mixed categories, results by final placement. The workbook lists team entries only (no fixtures).",
               "divisions": placement_divisions(["Executive Mixed", "40 Mixed", "39 Mixed"], BOWLING_MATRIX, "2026-11-25")}
    athletics = {"name": "Athletics", "slug": "athletics", "defaultDurationMinutes": 60,
                 "formatNote": "November 9 — nine track & field events, results by final placement. The workbook lists team entries only (no start lists or times).",
                 "divisions": placement_divisions(ATH_EVENTS, ATH_MATRIX, "2026-11-09")}
    laro = {"name": "Laro ng Lahi", "slug": "laro-ng-lahi", "defaultDurationMinutes": 60,
            "formatNote": "November 9 — five traditional games, results by final placement. The workbook lists team entries only.",
            "divisions": placement_divisions(LARO_GAMES, LARO_MATRIX, "2026-11-09")}
    for sp in (bowling, athletics, laro):
        for d in sp["divisions"]:
            d["scoringKind"] = "placement_only"
            d["scoringConfig"] = {"provisional": True}
    mobile = {"name": "Mobile Games", "slug": "mobile-games", "defaultDurationMinutes": 45,
              "formatNote": "November 9 — Mobile Legends (all 10 teams) and Call of Duty: Mobile (6 teams). The workbook lists entries only; fixtures are created in-app by the coordinator.",
              "divisions": [
                  {"name": "Mobile Legends", "slug": "ml", "scoringKind": "simple", "scoringConfig": {"allow_forfeit": True},
                   "groups": [{"name": "Round Robin", "teams": ML_TEAMS}], "fixtures": []},
                  {"name": "CODM", "slug": "codm", "scoringKind": "simple", "scoringConfig": {"allow_forfeit": True},
                   "groups": [{"name": "Round Robin", "teams": CODM_TEAMS}], "fixtures": []},
              ]}
    chess = {"name": "Chess", "slug": "chess", "defaultDurationMinutes": 60,
             "formatNote": "November 9 — Boys (9 teams) and Girls (2 teams). The workbook lists entries only; fixtures are created in-app by the coordinator.",
             "divisions": [
                 {"name": "Boys", "slug": "boys", "scoringKind": "simple", "scoringConfig": {"allow_forfeit": True},
                  "groups": [{"name": "Round Robin", "teams": CHESS_BOYS}], "fixtures": []},
                 {"name": "Girls", "slug": "girls", "scoringKind": "simple", "scoringConfig": {"allow_forfeit": True},
                  "groups": [{"name": "Round Robin", "teams": CHESS_GIRLS}], "fixtures": []},
             ]}

    seed["sports"] = [vb, basketball, pickleball, badminton, bowling, athletics, laro, mobile, chess]
    (ROOT / "data/seed.json").write_text(json.dumps(seed, indent=1))

    # ---- validation summary ----
    total_fx = 0
    for sp in seed["sports"]:
        n = sum(len(d["fixtures"]) for d in sp["divisions"])
        total_fx += n
        print(f"{sp['name']}: {len(sp['divisions'])} divisions, {n} fixtures")
    print(f"TOTAL fixtures: {total_fx}")
    print(f"WARNINGS ({len(warnings)}):")
    for w in warnings:
        print(" -", w)
    return seed

if __name__ == "__main__":
    main()
