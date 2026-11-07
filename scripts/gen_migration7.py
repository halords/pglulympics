#!/usr/bin/env python3
"""Generate supabase/migrations/20261107100000_more_sports.sql from data/seed.json
(sports 2..9; volleyball already ships in migration 6). Idempotent, natural-key
lookups scoped by sport (division slugs repeat across sports)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
seed = json.loads((ROOT / "data/seed.json").read_text())
q = lambda s: "'" + str(s).replace("'", "''") + "'"
tslug = lambda s: __import__("re").sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

def div_sel(sp, dv):
    return (f"(select d.id from divisions d join sports s on s.id = d.sport_id "
            f"where s.slug = {q(sp['slug'])} and d.slug = {q(dv['slug'])})")

lines = [
    "-- PGLUlympics — migration 7: remaining sports (IDEMPOTENT) — Phase 0 completion 2026-11-07",
    "-- Source: data/seed.json v2, extracted from the official workbook tabs (see data/sheet-extract.md).",
    "-- Adds Basketball, Pickleball, Badminton, Bowling, Athletics, Laro ng Lahi, Mobile Games, Chess.",
    "-- Volleyball + event + teams already ship in migration 6. Division lookups are sport-scoped",
    "-- because division slugs (mens, 39-boys, ...) repeat across sports.",
    "",
]
venues = sorted({fx["venue"] for sp in seed["sports"][1:] for dv in sp["divisions"]
                  for fx in dv["fixtures"] if fx.get("venue")})
for v in venues:
    lines.append(f"insert into venues(event_id, name) values ((select id from events where slug='pglulympics-2026'), {q(v)}) on conflict (event_id, name) do nothing;")
lines.append("")

order = 1
for sp in seed["sports"][1:]:
    order += 1
    lines.append(f"insert into sports(event_id, name, slug, icon_key, display_order, default_duration_minutes) values "
                 f"((select id from events where slug='pglulympics-2026'), {q(sp['name'])}, {q(sp['slug'])}, {q(sp['slug'])}, {order}, {sp['defaultDurationMinutes']}) "
                 f"on conflict (event_id, slug) do update set name = excluded.name, default_duration_minutes = excluded.default_duration_minutes;")
    for di, dv in enumerate(sp["divisions"], 1):
        ds = div_sel(sp, dv)
        lines.append(
            f"insert into divisions(sport_id, name, slug, scoring_kind, scoring_config, standings_config, medal_policy, display_order) values "
            f"((select id from sports where slug={q(sp['slug'])}), {q(dv['name'])}, {q(dv['slug'])}, {q(dv['scoringKind'])}, "
            f"{q(json.dumps(dv['scoringConfig']))}::jsonb, {q(json.dumps({'order': ['win_pct', 'wins', 'head_to_head', 'set_ratio', 'point_ratio'], 'show_draws': False, 'standings_points': {'win': 3, 'draw': 1, 'loss': 0}}))}::jsonb, "
            f"{q(json.dumps({'place_to_medal': {'1': 'gold', '2': 'silver', '3': 'bronze'}, 'max_per_medal': {'gold': 1, 'silver': 1, 'bronze': 1}, 'shared_allowed': False}))}::jsonb, {di}) "
            f"on conflict (sport_id, slug) do update set name = excluded.name;")
        for gi, g in enumerate(dv.get("groups", []), 1):
            lines.append(f"insert into groups(division_id, name, display_order) values ({ds}, {q(g['name'])}, {gi}) on conflict (division_id, name) do nothing;")
            for t in g["teams"]:
                lines.append(
                    f"insert into division_entries(division_id, team_id, group_id) select {ds}, t.id, g.id from teams t "
                    f"join groups g on g.division_id = {ds} and g.name = {q(g['name'])} where t.slug = {q(tslug(t))} "
                    f"and not exists (select 1 from division_entries e where e.division_id = {ds} and e.team_id = t.id);")
        for t in dv.get("entries", []):
            lines.append(
                f"insert into division_entries(division_id, team_id) select {ds}, t.id from teams t where t.slug = {q(tslug(t))} "
                f"and not exists (select 1 from division_entries e where e.division_id = {ds} and e.team_id = t.id);")
        for fi, fx in enumerate(dv["fixtures"], 1):
            grp = fx.get("group")
            grp_sel = f"(select id from groups where division_id = {ds} and name = {q(grp)})" if grp else "null"
            starts = (f"('{fx['date']} {fx['time']}:00'::timestamp at time zone 'Asia/Manila')"
                      if fx.get("time") else "null")
            ven = fx.get("venue")
            ven_sel = f"(select id from venues where name = {q(ven)})" if ven else "null"
            lines.append(
                f"insert into matches(division_id, group_id, stage, label, starts_at, venue_id, venue_text, display_order) values "
                f"({ds}, {grp_sel}, {q(fx['stage'])}, {q(fx['label'])}, {starts}, {ven_sel}, {q(ven) if ven else 'null'}, {fi}) "
                f"on conflict (division_id, label) do nothing;")
            msel = f"(select id from matches where division_id = {ds} and label = {q(fx['label'])})"
            def entry_slot(no, team):
                return (f"insert into match_slots(match_id, slot_no, source, source_entry_id, resolved_entry_id) "
                        f"select m.id, {no}, 'entry', e.id, e.id from matches m join division_entries e on e.division_id = m.division_id "
                        f"join teams t on t.id = e.team_id and t.slug = {q(tslug(team))} "
                        f"where m.division_id = {ds} and m.label = {q(fx['label'])} on conflict (match_id, slot_no) do nothing;")
            if fx.get("entries"):
                for no, t in enumerate(fx["entries"], 1):
                    lines.append(entry_slot(no, t))
            elif fx.get("teamA"):
                lines.append(entry_slot(1, fx["teamA"]))
                lines.append(entry_slot(2, fx["teamB"]))
            for no, key in ((1, "slotA"), (2, "slotB")):
                src = fx.get(key)
                if not src:
                    continue
                if src["kind"] == "group_rank":
                    lines.append(
                        f"insert into match_slots(match_id, slot_no, source, source_group_id, source_rank, source_match_id, source_outcome) values "
                        f"({msel}, {no}, 'group_rank', (select id from groups where division_id = {ds} and name = {q(src['group'])}), {src['rank']}, null, null) "
                        f"on conflict (match_id, slot_no) do nothing;")
                else:
                    lines.append(
                        f"insert into match_slots(match_id, slot_no, source, source_group_id, source_rank, source_match_id, source_outcome) values "
                        f"({msel}, {no}, 'match_outcome', null, null, (select id from matches where division_id = {ds} and label = {q(src['matchLabel'])}), {q(src['outcome'])}) "
                        f"on conflict (match_id, slot_no) do nothing;")
    lines.append("")

out = ROOT / "supabase/migrations/20261107100000_more_sports.sql"
out.write_text("\n".join(lines))
print(f"wrote {out.name}: {len(lines)} statements")
