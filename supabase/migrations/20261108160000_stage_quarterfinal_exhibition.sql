-- PGLUlympics — migration 13: bracket stages for single-elimination play.
--
-- Mobile Games (ML / CODM) run single-elimination brackets: quarterfinals
-- feed semifinals, winners go up. The match_stage enum predates that and
-- has no 'quarterfinal'; the fixture form also already offered
-- 'exhibition', which the enum never had (creating one would fail).
-- Add both. Each ADD VALUE is a standalone statement; idempotent.

alter type match_stage add value if not exists 'quarterfinal';
alter type match_stage add value if not exists 'exhibition';
