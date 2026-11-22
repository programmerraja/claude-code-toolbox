# claude-code-toolbox

A collection of skills, slash commands, and tools to get more out of Claude Code and Cursor across any repository.

## Setup (Use Skills & Commands in Any Repo)

Run the install script from this repo to symlink every skill in `skills/` and every slash command in `commands/` into your global Claude Code (`~/.claude/`) and/or Cursor (`~/.cursor/`) directories:

```bash
./install-skills.sh
```

The script asks whether to sync to **Claude Code**, **Cursor**, or **Both**. You can also pass a flag directly:

```bash
./install-skills.sh --claude
./install-skills.sh --cursor
./install-skills.sh --both
```

Because it creates symlinks pointing back to this repo:
- Edits to existing skills or commands take effect immediately everywhere.
- Whenever you **add, rename, or remove** a skill folder under `skills/` or a command file under `commands/`, re-run `./install-skills.sh` (it adds new links, skips non-symlink collisions safely, and cleans up stale symlinks from this repo).
- Start a new chat or reload the window after adding new entries so Claude Code / Cursor picks them up.

> **Note:** Cursor also scans `~/.claude/skills/` and `~/.claude/commands/` when Third-Party Imports are enabled. If you see duplicate entries in Cursor after syncing to both, sync to `--claude` only and remove the symlinks under `~/.cursor/{skills,commands}/`.

## Using Skills

Invoke a skill by name in any repository:

- `/dev-workflow I want to add webhook retries to the billing flow`

## Slash Commands (`commands/`)

Drop any command into a Claude Code or Cursor chat to steer how the agent behaves (append your prompt right after the command):

| Command | Effect |
|---|---|
| `/ask-me` | Stop exploring the codebase—ask me directly for the files or context needed first |
| `/clarify` | Never assume—list ambiguities and ask clarifying questions before acting |
| `/no-edit` | Read-only mode—no file edits or mutating commands |
| `/quick` | Fast and token-light—read only exact needed files/lines, concise answer |
| `/plain` | Simple, clean Markdown text only—no diagrams or heavy formatting |
| `/explain-ctx` | Explain with full surrounding context—flow, callers, rationale, gotchas |
| `/deep` | Multi-dimensional deep analysis and tradeoff comparison before proposing |
| `/unsure` | Concisely audit only low-confidence decisions and missed alternatives |
| `/ui-craft` | High-craft UI mode—clear point of view, reusable primitives, real-user critique |
