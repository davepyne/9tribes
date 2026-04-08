War-Civ

War-Civ is a turn-based strategy simulation focused on one thing:

How civilizations evolve through war.

This is not a traditional 4X game.
It is not about building the biggest economy or the richest culture.

It is about:

conflict
adaptation
military identity
survival under pressure
Design Philosophy

Most strategy games optimize for expansion and optimization.

War-Civ optimizes for:

Conflict-driven evolution
Military identity over economy
Emergent behavior over scripted factions
Simple systems that create complex outcomes

If a system does not meaningfully affect war, it does not belong.

What This Game Is
Ancient-era strategy only
Fast, strategic combat resolution (no tactical battle maps)
Persistent military units with history, experience, and identity
Civilizations that diverge based on:
terrain
combat outcomes
military specialization
Technology derived from environment + warfare, not linear trees
Units built from components and doctrines, not fixed tiers
What This Game Is NOT
Not a full Civ-style empire builder
Not economy-first
Not culture-first
Not diplomacy-first
Not a sandbox for “peaceful play”

Those systems may exist in minimal form, but only as they support war.

Core Pillars
1. Combat Drives Everything

Combat is the central loop.

Terrain matters
Positioning matters
Veteran units matter
Outcomes reshape civilizations

War is not a phase.
War is the system.

2. Military Identity Emerges

Civilizations are not predefined.

They become:

forest guerrilla fighters
hill fortress defenders
cavalry raiders
disciplined formations

Based on:

terrain
victories and losses
doctrine choices
prototype evolution
3. Technology Comes From Reality

No linear tech tree.

Knowledge is gained through:

environment interaction
combat experience
exploration

This unlocks:

new tactics
new equipment
new military capabilities
4. Units Are Persistent

Units are not disposable.

Each unit has:

experience and veteran levels
combat history
identity over time

Losing a veteran unit matters.

5. Prototypes Over Unit Tiers

No “Spearman → Pikeman → Rifleman” ladder.

Instead:

units are built from chassis + components
civilizations evolve equipment ecosystems

Example:

reinforced bows
heavy spear formations
mobility-focused cavalry kits
What Was Removed (Intentionally)

This project previously included deep simulation systems such as:

complex trade networks
multi-layer diplomacy
cultural identity systems
economic pressure modeling
city specialization depth
large-scale state capacity simulation

These systems were interesting.

They were also distracting from the core goal.

They have been removed or reduced because:

This is War-Civ. Not Everything-Civ.

Current Focus

The project is being rebuilt around a tighter core:

Keep
Combat engine
Terrain-driven warfare
Knowledge from environment + combat
Prototype-based unit design
Persistent units and veterancy
Reduce / Remove
Trade complexity
Culture systems
Overbuilt diplomacy layers
Economic simulation depth
Expand
Unit diversity
Military roles
Doctrine impact
Battlefield decision-making
Asymmetry between civilizations
Architecture (Reference)

The current codebase remains valuable as a reference architecture, not a finished product.

Key ideas worth preserving:

Data-driven systems (JSON-defined content)
Separation of:
game state
systems (rules)
content (definitions)
Deterministic simulation for testing
Modular systems (combat, movement, research, etc.)
core/       → shared types and utilities  
systems/    → rule execution (combat, movement, etc.)  
features/   → entities (factions, units, cities)  
design/     → prototype and unit construction  
world/      → map and terrain  
data/       → content loading  
Direction

This project is moving toward:

A focused, war-first strategy game with emergent military identity

Not:

a full civilization simulator
not a bloated systems experiment

The goal is clarity:

fewer systems
stronger interactions
clearer outcomes
Guiding Rule

When making decisions, ask:

Does this make war more interesting?

If the answer is no:

Cut it.

Long-Term Vision

A strategy game where:

every civilization fights differently
every war feels different
every unit tells a story
and outcomes are shaped by decisions, not tech trees
Status

Rebuilding from a previous overbuilt simulation.

Using the existing system ("C:\Users\fosbo\strategy-game-lab\war-civ") as:

a reference
a testbed
a source of proven mechanics

But not as the final design.