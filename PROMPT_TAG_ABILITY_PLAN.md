Invoke the war-civ-balance skill for context, then produce a build-ready execution brief for implementing the Tag-Driven Ability System as described in docs/design/tag-driven-abilities.md.

The implementation priority from the design doc is:
1. Tag-Driven Combat Abilities — Refactor the 6 faction-gated combat bonuses to tag checks
2. Ability Domain Knowledge System — New data structure tracking learned domains, exposure progress, and prototype mastery per faction
3. Knowledge Acquisition Logic — Combat exposure, city capture, proximity
4. Prototype Cost Scaling — Multiply production cost by domain familiarity modifier

Read docs/design/tag-driven-abilities.md and the codemap first. Focus on Step 1 (tag-driven combat abilities) as the foundation — produce a concrete execution brief with exact file:line changes for refactoring the faction-gated ability checks in warEcologySimulation.ts to tag-based checks.
