# Tribe Identity & T1–T3 Tech Audit — Pass-Off / Remaining Work

**Branch:** `claude/tribe-identity-implementation`
**Repo:** `/home/frank/repos/9tribes`
**Status:** 8 commits done. Builds green, tests green (4 pre-existing failures in rendezvous/strategicAi).

**Goal:** Finish the remaining combat hooks, passive trait helpers, and end-of-turn wiring so each tribe's passive trait aligns with its native domain T1–T3 tech.

**Execution mode:** Direct file edits (patch, read_file, write_file) + terminal for verification. Do NOT use Claude Code CLI — it times out on large prompts. Work incrementally: implement one item, verify, commit, move to the next.

**Key conventions:**
- JSON sync: every change to `src/content/base/*.json` MUST mirror to `web/src/data/*.json`
- Verify after each phase: `npm run build`, `npm run web:build`, `npm test`
- 4 pre-existing test failures in rendezvous/strategicAi suites — ignore unless new changes add more
- Commit each phase with descriptive one-line messages

---

## ✅ DONE (8 commits)

### ✅ DONE — §1 Cross-file consistency bugs

| Task | Commit | Status |
|------|--------|--------|
| §1.1 slaving native-only | `4e29331` | Removed foreign `description` from slaving_t3 |
| §1.2 tidal_warfare → Pirate Lords | `536aa07` | Reassigned `nativeFaction` to coral_people |
| §1.3 venom_t3 rework (data) | `dfe345b` | Data changed, flag added. Combat wiring 🔶 TODO |
| §1.4 startingLearnedDomains | `e61cbab` | heavy_hitter + tidal_warfare replacing dead strings |
| §1.5 hill_clan researchRate | — | Kept at 3, noted as intentional |

Type fix: made `qualitativeEffect.description` optional (`7bb55ec`).

### ✅ DONE — §2 T1 reflavors (data + ResearchDoctrine flags)

| Task | Commit | Data | Flags | Combat wiring |
|------|--------|------|-------|---------------|
| §2.1 river_stealth_t1 → wetland stealth | `dfe345b` | ✅ | ✅ | ✅ (end-of-turn) |
| §2.2 hitrun_t1 → skirmish step | `dfe345b` | ✅ | ✅ | ✅ (preview.ts) |
| §2.3 slaving_t1 → press gang | `dfe345b` | ✅ | ✅ | 🔶 TODO (apply.ts capture hook) |

### 🔶 PARTIAL — §3 Passive traits

| Task | Commit | Helpers exported | Combat wiring | End-of-turn wiring |
|------|--------|-----------------|---------------|-------------------|
| §3.1 jungle_stalkers poison | `dfe345b` / `3acb6b1` | ✅ | ✅ | n/a |
| §3.2 greedy loot on kill | `dfe345b` | ✅ | 🔶 TODO | — |
| §3.3 charge_momentum | — | 🔶 TODO | 🔶 TODO | — |
| §3.4 cold_hardened_growth | — | 🔶 TODO | 🔶 TODO | — |
| §3.5 river_assault stealth | `dfe345b` | ✅ | — | ✅ |
| §3.5 river_assault rough terrain | `dfe345b` | ✅ | — | — |
| §3.6 foraging_riders exhaustion | `dfe345b` | ✅ | — | ✅ |
| §3.6 foraging_riders pursuit | `dfe345b` | ✅ | 🔶 TODO | — |
| §3.7 hill_engineering dig-in | — | 🔶 TODO | 🔶 TODO | 🔶 TODO |
| §3.8 healing_druids | — | No changes needed | — | — |
| §3.9 desert_logistics | — | No changes needed | — | — |

### 🔶 TODO — §1.3 venom_t3 combat wiring
- `nativePoisonDetonateEnabled` flag exists in ResearchDoctrine
- Need: kill handler in apply.ts that detonates poison on adjacent enemies

### 🔶 TODO — §4 Optional polish
- §4.1 nature_healing_t3 rework
- §4.2 tidal_warfare_t3 audit (already good after reassignment)

---

## Remaining work — implementation guide

### PHASE A: Combat hooks in `src/systems/combat-action/apply.ts` (4 items)

**Context:** `apply.ts` handles combat resolution. Find the kill/death resolution section — existing patterns: jungle stalkers poison and venom_t1 are already wired there. Follow the same pattern.

1. **Press gang capture (`slaving_t1`)** — On kill, if killer has `pressGangCaptureEnabled`, roll RNG (e.g. 30% chance). If target was wounded (not dead from other causes), convert to captured unit for killer faction. Use existing capture mechanic if present.
2. **Greedy loot on kill (`greedy` passive)** — On kill, if killer faction is `pirate_lords`, call `getGreedyLootOnKill()` from factionIdentitySystem. Add returned gold/supplies to faction resources.
3. **Poison detonate (`venom_t3` native)** — On kill, if killer has `nativePoisonDetonateEnabled`, apply AoE poison stacks to adjacent enemy units. Same poison application pattern as jungle stalkers, just triggered by kill event and targeting adjacent hexes.
4. **Pursuit movement (`foraging_riders`)** — On kill, if killer faction is `plains_runners`, call `getPursuitMovementOnKill()` and restore that many movement points to the killer unit.

### PHASE B: Combat hooks in `src/systems/combat-action/preview.ts` (2 items)

**Context:** `preview.ts` calculates damage previews and situational modifiers. Existing pattern: skirmish step (+10% damage multiplier when `skirmishStepEnabled` and attacker moved) is already wired. Follow that pattern.

5. **Charge momentum (Savannah Lions)** — Add +15% damage multiplier when attacker faction is `savannah_lions` and moved ≥2 hexes this turn (`movesRemaining` significantly less than `maxMoves`). Also apply "strike first" by setting attacker's initiative higher.
6. **Cold hardened growth (Arctic Wardens)** — Add +10% defense multiplier when defender faction is `arctic_wardens`. At full HP, also resist displacement (return false or override displacement effect).

### PHASE C: New helpers + end-of-turn (2 items)

7. **charge_momentum + cold_hardened_growth helpers** — Add `getChargeMomentumBonus()` and `getColdHardenedDefense()` to `src/systems/factionIdentitySystem.ts`. Export them.
8. **Hill engineering dig-in** — Add `digInStacks: number` to Unit type. In `factionTurnEffects.ts` end-of-turn, increment dig-in stacks for stationary `hill_clan` units (cap 3). Each stack = +5% defense. Decrement on movement. Wire defense bonus in preview.ts.

### §4 Optional polish (do last if time)
- §4.1 nature_healing_t3 rework
- §4.2 tidal_warfare_t3 audit (already good after reassignment)

---

## Branch: `claude/tribe-identity-implementation`

Commits (newest first):
- `72fe00f` docs: update implementation status tracking
- `3acb6b1` feat: wire jungle stalkers poison passive
- `10edbb1` feat: wire skirmish step damage bonus (hitrun_t1)
- `dfe345b` feat: T1 reflavors (data), ResearchDoctrine flags, wetland stealth, rough terrain bonus, foraging riders exhaustion
- `7bb55ec` fix: make qualitativeEffect.description optional for native-only domains
- `e61cbab` fix: replace dead startingLearnedDomains with real domains
- `536aa07` fix: reassign tidal_warfare nativeFaction from river_people to coral_people
- `4e29331` fix: remove misleading foreign description from slaving_t3

---

## Original audit (preserved for reference)

[Full original plan preserved below — see PR #21 diff for complete text]
