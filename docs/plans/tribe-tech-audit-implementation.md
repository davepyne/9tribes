# Tribe Identity & T1–T3 Tech Audit — Implementation Pass-Off

**Branch:** `claude/tribe-identity-implementation`
**Status:** Implementation in progress. 7 commits on branch. Builds green, tests green (4 pre-existing failures).
**Goal:** Align each tribe's *passive trait* (faction "base") and its *native domain* T1–T3 tech so they reinforce a single thematic identity, and fix several data-layer inconsistencies discovered during the audit.

---

## Implementation status

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

## Remaining work summary

**Combat hooks in `apply.ts` (4 items):**
1. Press gang capture (slaving_t1) — RNG-based capture on kill vs wounded
2. Greedy loot on kill (greedy passive) — add gold/supplies on kill
3. Poison detonate (venom_t3 native) — AoE poison on adjacent enemies after kill
4. Pursuit movement (foraging_riders) — restore movement on kill

**Combat hooks in `preview.ts` (2 items):**
1. Charge momentum (Savannah Lions) — +15% damage + strike first after ≥2 hexes moved
2. Cold hardened growth (Arctic Wardens) — +10% defense always, resist displacement at full HP

**End-of-turn hooks in `factionTurnEffects.ts` (1 item):**
1. Hill engineering dig-in — stack counter per unit, +5% defense per stack (cap 3)

**Unit type changes needed:**
- `digInStacks` on Unit for hill_engineering

---

## Branch: `claude/tribe-identity-implementation`

Commits (newest first):
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
