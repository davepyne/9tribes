## Task: Fix Polar Bear Flee and Druid Forest Mending

### Change 1: Polar Bears Never Flee

**File:** `src/systems/combatSystem.ts`
**Location:** Lines 212-215

Polar bears have the `beast` movement class, which makes them flee at 35% HP (elephant threshold). This is wrong — summoned bears should fight to the death. They're magical frost guardians, not skittish animals.

**Fix:** In the `defenderFled` and `attackerFled` calculations (lines 212-215), add a check for the `summon` tag. Units tagged with `summon` should never flee.

Current code:
```typescript
const defenderFled = !defenderDestroyed && !defenderRouted
    && (defenderMovementClass === 'cavalry' || defenderMovementClass === 'camel' || defenderMovementClass === 'beast') && defenderNewHp <= defender.maxHp * defenderElephantFleeThreshold;
const attackerFled = !attackerDestroyed && !attackerRouted
    && (attackerMovementClass === 'cavalry' || attackerMovementClass === 'camel' || attackerMovementClass === 'beast') && attackerNewHp <= attacker.maxHp * attackerElephantFleeThreshold;
```

Add before each line a check that excludes summoned units:
```typescript
const defenderIsSummoned = defenderPrototype.tags?.includes('summon') ?? false;
const attackerIsSummoned = attackerPrototype.tags?.includes('summon') ?? false;
```

Then modify the `defenderFled`/`attackerFled` conditions to add `&& !defenderIsSummoned` / `&& !attackerIsSummoned`.

The polar_bear_frame chassis already has `"tags": ["beast", "summon", "frost"]` in `src/content/base/chassis.json:118`, so this will work immediately.

### Change 2: Forest Mending Works Universally

**File:** `src/systems/warEcologySimulation.ts`
**Location:** Lines 1200-1204

Current code:
```typescript
    // Forest Mending (Druid Circle): Extra healing on forest/jungle terrain
    if (factionId === 'druid_circle' && (terrainId === 'forest' || terrainId === 'jungle')) {
      const forestHealBonus = registry.getSignatureAbility('druid_circle')?.forestHealRate ?? 3;
      healRate += forestHealBonus;
    }
```

Remove the terrain gate. Druid Circle's healing bonus should apply to ALL their units regardless of terrain — it's a faction identity ability, not a terrain-specific buff.

Change to:
```typescript
    // Nature's Blessing (Druid Circle): Extra healing for all units
    if (factionId === 'druid_circle') {
      const forestHealBonus = registry.getSignatureAbility('druid_circle')?.forestHealRate ?? 3;
      healRate += forestHealBonus;
    }
```

### Verification
Run `npx tsc --noEmit` to verify zero new TypeScript errors, then run a quick sim to confirm both fixes work:
```
node --import tsx --no-warnings -e "
import { loadRulesRegistry } from './src/data/loader/loadRulesRegistry.js';
import { runWarEcologySimulation, createSimulationTrace } from './src/systems/warEcologySimulation.js';
import { buildMvpScenario } from './src/game/buildMvpScenario.js';
const registry = loadRulesRegistry();
const state = buildMvpScenario(registry);
const trace = createSimulationTrace(true);
const result = runWarEcologySimulation(state, registry, 50, trace);

// Check bears don't flee
const bearFlees = trace.lines.filter(l => l.includes('Polar Bear') && l.includes('routed and fled'));
console.log('Bear flee events (should be 0):', bearFlees.length);

// Check druid healing fires
const druidHeals = trace.lines.filter(l => l.includes('Druid') && (l.includes('heal') || l.includes('Nature')));
console.log('Druid heal events (should be >0):', druidHeals.length);

// Check frost polar bear lifecycle
const frost = result.factions.get('frost_wardens');
console.log('Frost polarBearState:', JSON.stringify(frost?.polarBearState));
console.log('Frost living units:', frost?.unitIds.filter(id => result.units.has(id as any)).length);
"
```
