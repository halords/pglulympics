-- PGLUlympics — migration 14: PHRMDO Lobby venue.
--
-- Mobile Legends and CODM are played in the PHRMDO Lobby (user, 2026-11-08).
-- Add it as a proper venue so session matches carry it in the venue
-- dropdown, on match cards, and in the schedule — same insert pattern as
-- migrations 5 and 7. Idempotent.

insert into venues(event_id, name)
values ((select id from events where slug='pglulympics-2026'), 'PHRMDO Lobby')
on conflict (event_id, name) do nothing;
