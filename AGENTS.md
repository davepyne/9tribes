## Codebase Navigation

Before reading source code, check for structured architecture data in `.slim/`:

1. **`.slim/symbols.json`** — every export: name, kind, line number, signature
2. **`.slim/imports.json`** — bidirectional dependency graph (imports + importedBy)
3. **`.slim/digest.md`** — rolling changelog of recent architectural changes

Use them *before* reading source files:
- "What does this file export?" → look up the file in symbols.json
- "Who calls this function?" → search imports.json for the name in `importedBy`
- "What's the blast radius of changing X?" → trace `importedBy` transitively
- "What changed recently?" → read digest.md

Only read source files after narrowing down from the structured data.

To refresh after code changes:
```bash
python3 ~/.openclaw-autoclaw/skills/cartography-v2/scripts/cartographer.py changes --root ./
python3 ~/.openclaw-autoclaw/skills/cartography-v2/scripts/cartographer.py extract --root ./ --changed-only
python3 ~/.openclaw-autoclaw/skills/cartography-v2/scripts/cartographer.py digest --root ./ --output .slim/digest.md
python3 ~/.openclaw-autoclaw/skills/cartography-v2/scripts/cartographer.py update --root ./
```

## Sound Effects

Gameplay sound effects are centralized in `web/src/app/audio/sfxManager.ts`.

Use this flow when adding a new sound:
- Put the browser-loadable asset under `web/public/assets/audio/sfx/`.
- Add the file path and playback mapping in `web/src/app/audio/sfxManager.ts`.
- If the sound is tied to combat initiation, trigger it from the React/Phaser bridge in `web/src/app/GameShell.tsx` using the pending attacker.
- If the sound is tied to a gameplay event outside combat, prefer driving it from state-delta detection in `web/src/app/audio/sfxManager.ts` instead of scattering `new Audio(...)` calls across the codebase.
- If the UI does not currently expose enough information to detect the event, add a small feedback field in `web/src/game/controller/GameSession.ts` and pass it through `web/src/game/controller/GameController.ts` into `playFeedback`.

Current pattern:
- Combat sounds are selected from the attacking unit during the 2-second battle animation.
- Non-combat sounds are inferred from play-state changes such as movement, city founding/capture, sacrifice, learned domains, research completion, unit capture, and victory/defeat.
