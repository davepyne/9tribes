# /curate - Memory Maintenance

Keep the memory system accurate. Designed to run daily or on-demand.
Use `--verify` for deep staleness checking (expensive). Without it, uses cheap git-based detection.

## Phase 1: Sync Thinking-Machine Index

1. Scan `.thinking-machine/` for directories.
2. Compare against `thinkingMachineIndex.md`:
   - **New investigations** not in the index → read `final_report.md` or `findings.md`, add one-line summary with staleness status "UNKNOWN"
   - **Existing investigations** that gained a `final_report.md` → update from "Incomplete" to "Completed"
3. Do NOT copy detailed findings into memory. The index is pointers, not content.

## Phase 2: Staleness Detection

### Without --verify (cheap, git-based)

1. Run `git log --since="7 days ago" --name-only --pretty=format:` to get recently changed files.
2. For each thinking-machine entry in the index, check if its investigation directory contains files modified more recently than the index entry was last verified.
3. For each non-investigation memory, check its **Staleness Triggers** against the changed files list.
4. Flag entries as "potentially stale" if relevant files changed. Do NOT re-read source code.
5. Output a summary: which entries are potentially stale and why.

### With --verify (expensive, reads source)

For each entry flagged as potentially stale (or all entries if explicitly requested):

1. Read the investigation's `final_report.md` and extract specific code claims (parameter values, function names, file paths).
2. Verify those claims against current source code. Use `.slim/symbols.json` for lookups.
3. Classify: ACCURATE, PARTIALLY STALE (what changed), or STALE.
4. Update the index entry with the staleness verdict.

## Phase 3: Verify Non-Investigation Memories

For each memory file that isn't the thinking-machine index:

1. Check its **Staleness Triggers** against recent git changes.
2. If triggered, do a quick verification (read the relevant source file, check the claim).
3. If stale: update or delete. If accurate: skip.

## Phase 4: Capture Session Knowledge (if applicable)

Only when run interactively after a work session (not as a daily cron):

1. Identify what was done.
2. Ask: "Would forgetting this cause a wrong edit or wasted investigation?" If no, skip.
3. Ask: "Is this already in `.slim/`, `codemap.md`, or `.thinking-machine/`?" If yes, skip.
4. Only save if it's a **workflow trap**, **user correction**, or **architectural decision**.
5. Maximum 1 new memory per curation. Prefer 0.

## What NOT to Save

- Code-state facts (constant values, function signatures, caller lists) → `.slim/` and `codemap.md`
- Investigation findings → `.thinking-machine/`
- File inventories, import lists, architecture trees → filesystem and `.slim/`
- Temporary debugging state, one-off bugs with no reusable lesson

## Output

```
Curation Complete
Thinking-machine: N new, N updated, N potentially stale (run /curate --verify to check)
Memories: N accurate, N updated, N flagged
New memories: N
```
