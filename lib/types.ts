// PGLUlympics domain types (SPEC §1, §3.1) — shared by mock + Supabase providers.

export type MatchStatus = "scheduled" | "live" | "final" | "cancelled";
export type MatchStage = "round_robin" | "semifinal" | "bronze" | "gold" | "placement";
export type ScoringKind = "set_based" | "simple" | "placement_only";

export interface EventInfo {
  id: string; slug: string; name: string; organizer?: string;
  startDate: string; endDate: string;
  goldPoints: number; silverPoints: number; bronzePoints: number;
  pointsProvisional: boolean;
}
export interface TeamInfo { id: string; name: string; slug: string; color?: string | null }
export interface SportInfo {
  id: string; name: string; slug: string; iconKey?: string | null;
  defaultDurationMinutes: number;
}
export interface DivisionInfo {
  id: string; sportId: string; name: string; slug: string;
  scoringKind: ScoringKind;
  scoringConfig: Record<string, unknown>;
  standingsConfig: Record<string, unknown>;
  medalPolicy: Record<string, unknown>;
}
export interface GroupInfo { id: string; divisionId: string; name: string }
export interface EntryInfo {
  id: string; divisionId: string; teamId: string; groupId?: string | null;
  label?: string | null; rosterStatus: "unknown" | "verified";
}
export interface SlotInfo {
  slotNo: number; entryId?: string | null; teamName?: string | null;
  placeholder?: string | null;
  source?: {
    kind: "entry" | "group_rank" | "match_outcome";
    groupId?: string | null; rank?: number | null;
    matchId?: string | null; outcome?: "winner" | "loser" | null;
  };
  frozen?: boolean;
}
export interface SegmentInfo {
  segmentNo: number; kind: "set" | "period"; status: "open" | "closed";
  points: number[]; // index = slotNo - 1
}
export interface PlacementInfo { slotNo: number; place?: number | null; finish: string; note?: string | null }
export interface MatchInfo {
  id: string; divisionId: string; groupId?: string | null;
  stage: MatchStage; status: MatchStatus; label: string;
  startsAt?: string | null; // ISO instant
  durationMinutes?: number | null;
  venueId?: string | null; venue?: string | null;
  slots: SlotInfo[];
  segments: SegmentInfo[];
  totals?: number[] | null; // index = slotNo - 1 (simple kind)
  placements?: PlacementInfo[];
  winnerEntryId?: string | null;
  outcome?: string | null;
  needsReview?: boolean;
  revision: number;
  conflictAck?: { hash: string; by: string; at: string } | null;
}
export interface StandingRow {
  entryId: string; teamName: string; groupId?: string | null;
  played: number; wins: number; losses: number; draws: number;
  winPct: number; setsWon: number; setsLost: number;
  pointsFor: number; pointsAgainst: number; standingsPoints: number;
}
export interface TallyRow {
  teamId: string; teamName: string; gold: number; silver: number; bronze: number;
  points: number; rank: number;
}
export interface AwardInfo {
  divisionId: string; awardKey: string; medal: "gold" | "silver" | "bronze";
  entryId: string; teamName?: string; state: "draft" | "confirmed" | "void";
  source: string;
}
export interface PlayerInfo { id: string; name: string }
export interface VenueInfo { id: string; name: string }

export interface Snapshot {
  event: EventInfo;
  teams: TeamInfo[];
  sports: SportInfo[];
  divisions: DivisionInfo[];
  groups: GroupInfo[];
  entries: EntryInfo[];
  matches: MatchInfo[];
  awards: AwardInfo[]; // public: confirmed only; staff snapshot may include drafts
  players: PlayerInfo[];
  rosters: Record<string, string[]>; // entryId -> playerIds
  venues: VenueInfo[];
  revision: number; // event revision (monotonic; drives patch/gap logic)
}

// ---- commands (SPEC §3.1, §5, §11) ----
export interface ScorePayload {
  segments: { segmentNo: number; kind: "set" | "period"; status: "open" | "closed"; scores: Record<number, number> }[];
  totals?: Record<number, number> | null;
  placements?: { slotNo: number; place?: number | null; finish: string; note?: string | null }[] | null;
}
export interface PlayerClash {
  player_id: string; player_name: string; other_match_id: string; other_label: string;
  other_sport: string; other_starts_at: string; other_ends_at: string;
}
export interface VenueClash {
  venue_id: string; venue_name: string; other_match_id: string; other_label: string;
  other_sport: string; other_starts_at: string; other_ends_at: string;
}
export interface ConflictReport {
  playerClashes: PlayerClash[];
  venueClashes: VenueClash[];
  anomalies: { player_id: string; player_name: string; match_id: string }[];
  incomplete: string[];
}
export type FixtureResult =
  | { status: "ok"; matchId: string }
  | { status: "warning"; ackHash: string; conflicts: ConflictReport };

export interface FixtureInput {
  divisionId: string; label: string; stage: MatchStage; groupId?: string | null;
  startsAt: string; durationMinutes?: number | null;
  venueId?: string | null; venueText?: string | null;
  entryIds: string[];
}
export interface FixtureEditInput {
  startsAt: string; durationMinutes?: number | null;
  venueId?: string | null; venueText?: string | null; label?: string;
}

export interface ConflictRow {
  kind: "player" | "venue";
  playerId?: string | null; playerName?: string | null;
  matchId: string; label: string; sport: string; division: string;
  startsAt: string; endsAt: string;
  otherMatchId: string; otherLabel: string; otherSport: string;
  otherStartsAt: string; otherEndsAt: string;
  acked: boolean;
}

export interface DataProvider {
  listConflicts(): Promise<ConflictRow[]>;
  getSnapshot(): Promise<Snapshot>;
  subscribe(cb: (snap: Snapshot) => void): () => void;
  saveScore(matchId: string, expectedRevision: number, payload: ScorePayload): Promise<{ revision: number }>;
  setMatchStatus(matchId: string, status: MatchStatus, opts?: { outcome?: string; winnerEntryId?: string; reason?: string }): Promise<{ revision: number; status: MatchStatus }>;
  requestCorrection(matchId: string, reason: string): Promise<void>;
  createFixture(input: FixtureInput, ackHash?: string): Promise<FixtureResult>;
  updateFixture(matchId: string, input: FixtureEditInput, ackHash?: string): Promise<FixtureResult>;
  confirmAwards(divisionId: string, awards: { awardKey: string; medal: "gold" | "silver" | "bronze"; entryId: string; source?: string }[]): Promise<void>;
  resetMatch(matchId: string, reason?: string): Promise<void>;
  // admin facet (rosters + config values; SPEC §6 essentials)
  upsertPlayer(name: string): Promise<PlayerInfo>;
  setEntryRoster(entryId: string, playerIds: string[]): Promise<void>;
  setEntryRosterStatus(entryId: string, status: "unknown" | "verified"): Promise<void>;
  updateEventPoints(p: { goldPoints: number; silverPoints: number; bronzePoints: number; pointsProvisional: boolean }): Promise<void>;
  updateSportDuration(sportId: string, minutes: number): Promise<void>;
}
