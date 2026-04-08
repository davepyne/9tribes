# Web Client Modes

The web client supports two distinct modes:

## Play Mode

Play mode is the live interactive vertical slice.

What it does:
- boots a live `GameSession`
- allows unit selection
- allows legal movement
- allows `End Turn`
- uses the curated 2-faction playtest scenario by default

Default playtest scenario:
- `druid_circle`
- `steppe_clan`
- fixed opening layout
- intended for manual playtesting

Open it with:

```text
?mode=play
```

Example:

```text
http://localhost:5173/?mode=play
```

### Optional Play Mode Switch

To bypass the curated playtest slice and boot a fresh scenario build instead:

```text
?mode=play&bootstrap=fresh
```

Optional seed override:

```text
?mode=play&bootstrap=fresh&seed=42
```

Use this only for debugging or broader scenario checks. For actual playtesting, use the default curated play mode.

## Replay Mode

Replay mode is the non-authoritative viewer.

What it does:
- loads replay data from `web/public/replays/mvp-seed-42.json`
- allows timeline scrubbing
- allows state inspection
- does not use live gameplay authority
- does not support real movement commands

Open it with:

```text
?mode=replay
```

Example:

```text
http://localhost:5173/?mode=replay
```

## Default Behavior

If no mode is specified, the app falls back to replay mode.

That means this URL:

```text
http://localhost:5173/
```

behaves the same as:

```text
http://localhost:5173/?mode=replay
```

## Recommended Usage

Use play mode when:
- testing unit selection and movement
- testing turn flow
- reviewing new sprites in the playable slice
- validating HUD and interaction clarity

Use replay mode when:
- reviewing exported replay data
- checking timeline rendering
- validating replay UI regressions

## Current Implementation Notes

Play mode entry point:
- [PlayClient.tsx](/Users/fosbo/war-civ-v2/web/src/app/routes/PlayClient.tsx)

Replay mode entry point:
- [ReplayClient.tsx](/Users/fosbo/war-civ-v2/web/src/app/routes/ReplayClient.tsx)

Mode selection:
- [App.tsx](/Users/fosbo/war-civ-v2/web/src/App.tsx)
