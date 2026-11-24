#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="$SCRIPT_DIR/skills"
COMMANDS_DIR="$SCRIPT_DIR/commands"
CLAUDE_BASE="$HOME/.claude"
CURSOR_BASE="$HOME/.cursor"

usage() {
  cat <<EOF
Usage: $(basename "$0") [--claude | --cursor | --both]

Symlinks every skill folder under skills/ (any depth, containing SKILL.md)
and every slash command in commands/ (*.md) into ~/.claude/{skills,commands}
and/or ~/.cursor/{skills,commands}. Safe to re-run whenever you add, rename,
or remove skills or commands.
EOF
}

clean_stale_links() {
  local source_prefix="$1"
  local target_dir="$2"
  local cleaned=0

  for existing in "$target_dir"/*; do
    [ -L "$existing" ] || continue
    local link_target
    link_target="$(readlink "$existing")"
    if [[ "$link_target" == "$source_prefix/"* && ! -e "$existing" ]]; then
      rm "$existing"
      cleaned=$((cleaned + 1))
    fi
  done

  echo "$cleaned"
}

link_skills() {
  local label="$1"
  local target_dir="$2/skills"
  local linked=0 skipped=0 cleaned=0

  mkdir -p "$target_dir"
  cleaned="$(clean_stale_links "$SKILLS_DIR" "$target_dir")"

  # Any depth: skills/engineering/foo/SKILL.md links as "foo".
  while IFS= read -r skill_file; do
    local skill_dir name dest
    skill_dir="$(dirname "$skill_file")"
    name="$(basename "$skill_dir")"
    dest="$target_dir/$name"

    if [ -e "$dest" ] && [ ! -L "$dest" ]; then
      echo "  [skip] $dest already exists and is not a symlink"
      skipped=$((skipped + 1))
      continue
    fi

    ln -sfn "${skill_dir%/}" "$dest"
    linked=$((linked + 1))
  done < <(find "$SKILLS_DIR" -name SKILL.md -type f | sort)

  echo "$label skills ($target_dir): linked $linked, skipped $skipped, cleaned $cleaned stale."
}

link_commands() {
  local label="$1"
  local target_dir="$2/commands"
  local linked=0 skipped=0 cleaned=0

  [ -d "$COMMANDS_DIR" ] || return 0
  mkdir -p "$target_dir"
  cleaned="$(clean_stale_links "$COMMANDS_DIR" "$target_dir")"

  for cmd_file in "$COMMANDS_DIR"/*.md; do
    [ -f "$cmd_file" ] || continue
    local name dest
    name="$(basename "$cmd_file")"
    dest="$target_dir/$name"

    if [ -e "$dest" ] && [ ! -L "$dest" ]; then
      echo "  [skip] $dest already exists and is not a symlink"
      skipped=$((skipped + 1))
      continue
    fi

    ln -sfn "$cmd_file" "$dest"
    linked=$((linked + 1))
  done

  echo "$label commands ($target_dir): linked $linked, skipped $skipped, cleaned $cleaned stale."
}

sync_target() {
  local label="$1"
  local base_dir="$2"
  link_skills "$label" "$base_dir"
  link_commands "$label" "$base_dir"
}

mode=""
case "${1:-}" in
  --claude) mode="claude" ;;
  --cursor) mode="cursor" ;;
  --both)   mode="both" ;;
  -h|--help) usage; exit 0 ;;
  "")
    echo "Sync skills and commands from $SCRIPT_DIR to:"
    echo "  1) Claude Code ($CLAUDE_BASE)"
    echo "  2) Cursor ($CURSOR_BASE)"
    echo "  3) Both [default]"
    printf "Choose [1/2/3]: "
    read -r choice
    case "${choice:-3}" in
      1) mode="claude" ;;
      2) mode="cursor" ;;
      3) mode="both" ;;
      *) echo "Invalid choice: $choice" >&2; exit 1 ;;
    esac
    ;;
  *)
    echo "Unknown option: $1" >&2
    usage >&2
    exit 1
    ;;
esac

case "$mode" in
  claude) sync_target "Claude Code" "$CLAUDE_BASE" ;;
  cursor) sync_target "Cursor" "$CURSOR_BASE" ;;
  both)
    sync_target "Claude Code" "$CLAUDE_BASE"
    sync_target "Cursor" "$CURSOR_BASE"
    ;;
esac
