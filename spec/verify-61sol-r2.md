### 1) Blockers

| # | Status | Why |
|---|---|---|
| 1 | **RESOLVED** | §11 is complete: interval semantics, inclusion rules, warning acknowledgement, override rights, scoped disclosure and tests are specified. |
| 2 | **PARTIAL** | Scope cuts and hour budgets exist, but the early production gate is missing: Auth/scoring runs locally through H20, scheduling finishes H36, and admin/recovery rehearsal reaches H40. |
| 3 | **PARTIAL** | GitHub is now primary and production seeding is explicit; actual integration execution/target configuration, failure recovery and production approval remain unestablished. |
| 5 | **RESOLVED** | A private, event-wide SECURITY DEFINER checker is explicitly required, invoked through authorized RPCs, with direct public execution revoked. |
| 11 | **RESOLVED** | `frozen_entry_id` preserves started contestants; only audited reset clears it, and historical scoring uses frozen identities. |
| 32 | **RESOLVED** | The ten-phase expansion is replaced by hour-budgeted windows, H40 freeze and explicit cuts to the identified deadline traps. |
| 33 | **PARTIAL** | Ordered migrations, clean reset and security tests are required, but a deployed secure slice—including event-wide checker proof—is not an early gate. |
| 34 | **RESOLVED** | Frozen contestants, invalidity propagation, mandatory descendant reset and atomic confirmed-award replacement address the correction hazards. |
| 35 | **PARTIAL** | Scheduling coverage is substantially complete, but no event-wide serialization protects the check/save protocol: concurrent overlapping saves can both pass without acknowledgement. |

### 2) New issues

- **BLOCKER — Anonymous Realtime is denied by the access contract.** §2 denies anonymous SELECT on raw `event_updates`; §3 subscribes anonymous public clients directly to its Postgres Changes inserts. Projection-view access does not authorize those subscriptions. Expose the sanitized outbox with appropriate SELECT/RLS and publication filtering, or specify an authorized Broadcast path.
- **MAJOR — Direct configuration writes bypass the specified configuration lock.** §1 says division configuration becomes locked once play starts, specifically “RPC-enforced”; §§2/6 permit direct admin DML on divisions/configuration. Those writes bypass the RPC restriction. Route configuration mutations through an enforcing RPC or require database-trigger enforcement.

### 3) Verdict

**NOT CONVERGED.** Single most important remaining fix: **repair public Realtime authorization and prove anonymous score delivery on hosted Supabase**—the currently specified transport cannot satisfy the mandatory public `<1s` path.
