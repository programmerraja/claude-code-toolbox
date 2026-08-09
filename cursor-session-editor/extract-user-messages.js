#!/usr/bin/env node
/**
 * One-shot: extract all user-typed messages from Cursor sessions across repos.
 * Output: { "repoName": ["message", ...], ... }
 *
 * Sources:
 *   1) ~/.cursor/projects/<slug>/agent-transcripts/<session>/<session>.jsonl
 *   2) Cursor state.vscdb composer bubbles (streamed via node:sqlite)
 *
 * Usage:
 *   node extract-user-messages.js [out.json]
 */
import fs from "fs";
import path from "path";
import readline from "readline";
import { DatabaseSync } from "node:sqlite";
import { getCursorPaths } from "./lib/paths.js";
import { findStateDbs, hasCursorDiskKv, hasSqlite3 } from "./lib/sqlite.js";
import {
  getWorkspacePathFromJson,
  resolveSessionWorkspace,
} from "./lib/extract.js";

const OUT =
  process.argv[2] || path.join(process.cwd(), "user-messages-by-repo.json");

function repoNameFromWorkspace(workspacePath, slug) {
  if (workspacePath) return path.basename(workspacePath);

  const s = slug || "unknown";
  for (const marker of [
    "-Documents-office-code-",
    "-Documents-code-",
    "-Documents-",
  ]) {
    const idx = s.indexOf(marker);
    if (idx >= 0) {
      const rest = s.slice(idx + marker.length);
      if (rest) return rest;
    }
  }
  return s;
}

function unwrapQuery(text) {
  const m = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/i);
  return (m ? m[1] : text).trim();
}

function textFromTranscriptContent(content) {
  if (content == null) return null;
  if (typeof content === "string") {
    const t = unwrapQuery(content);
    return t || null;
  }
  if (!Array.isArray(content)) return null;
  if (content.some((b) => b?.type === "tool_result")) return null;
  const parts = [];
  for (const block of content) {
    if (typeof block === "string") parts.push(block);
    else if (block?.type === "text" && block.text) parts.push(block.text);
  }
  const t = unwrapQuery(parts.join("\n"));
  return t || null;
}

function push(byRepo, repo, text) {
  if (!text) return false;
  if (!byRepo[repo]) byRepo[repo] = [];
  byRepo[repo].push(text);
  return true;
}

function parseJson(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function extractFromJsonl(filePath, byRepo, repo) {
  if (!fs.existsSync(filePath)) return { msgs: 0, lines: 0 };
  let msgs = 0;
  let lines = 0;
  const stream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    lines += 1;
    let raw;
    try {
      raw = JSON.parse(line);
    } catch {
      continue;
    }
    const role = raw.role || raw.type;
    if (role !== "user") continue;
    const text = textFromTranscriptContent(
      raw.message?.content ?? raw.content,
    );
    if (!text) continue;
    if (push(byRepo, repo, text)) msgs += 1;
  }
  return { msgs, lines };
}

async function extractTranscripts(byRepo, stats) {
  const { projectsDir } = getCursorPaths();
  if (!fs.existsSync(projectsDir)) return 0;

  let total = 0;
  const projects = fs
    .readdirSync(projectsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const proj of projects) {
    const transcriptsDir = path.join(
      projectsDir,
      proj.name,
      "agent-transcripts",
    );
    if (!fs.existsSync(transcriptsDir)) continue;

    const repo = repoNameFromWorkspace("", proj.name);
    const sessions = fs
      .readdirSync(transcriptsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory());

    stats.transcriptProjects += 1;
    stats.transcriptSessions += sessions.length;

    for (const session of sessions) {
      const jsonl = path.join(
        transcriptsDir,
        session.name,
        `${session.name}.jsonl`,
      );
      const { msgs } = await extractFromJsonl(jsonl, byRepo, repo);
      if (msgs > 0) stats.transcriptSessionsWithUserMsgs += 1;
      total += msgs;
    }
  }
  return total;
}

function isUserTypedBubble(bubble) {
  if (!bubble) return false;
  const isAssistant = String(bubble.type) === "2" || bubble.type === 2;
  if (isAssistant) return false;
  if (bubble.toolFormerData) return false;
  return Boolean(String(bubble.text ?? "").trim());
}

function extractComposerDb(db, byRepo, stats) {
  if (!fs.existsSync(db.dbPath)) return 0;
  if (!hasCursorDiskKv(db.dbPath)) return 0;

  const database = new DatabaseSync(db.dbPath, { readOnly: true });
  const fallbackWs = db.wsDir ? getWorkspacePathFromJson(db.wsDir) : "";

  try {
    // Pass 1: composers → repo + ordered bubble ids
    const composers = new Map(); // composerId -> { repo, bubbleIds }
    let composerRows = 0;

    for (const row of database
      .prepare(
        "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%'",
      )
      .iterate()) {
      composerRows += 1;
      const composerData = parseJson(row.value);
      if (!composerData?.composerId) continue;

      const headers = composerData.fullConversationHeadersOnly ?? [];
      if (headers.length === 0) continue;

      const workspace = resolveSessionWorkspace(composerData, fallbackWs);
      const repo = repoNameFromWorkspace(workspace, db.wsHash);
      const bubbleIds = headers.map((h) => h.bubbleId).filter(Boolean);

      composers.set(composerData.composerId, { repo, bubbleIds });
    }

    stats.composerSessions += composers.size;
    stats.composerDataRows += composerRows;

    // Pass 2: stream ALL bubbles once, keep only user-typed text
    // key: `${composerId}:${bubbleId}` and also bare bubbleId (fallback)
    const userText = new Map();
    let bubbleRows = 0;
    let userTyped = 0;

    for (const row of database
      .prepare(
        "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'",
      )
      .iterate()) {
      bubbleRows += 1;
      const bubble = parseJson(row.value);
      if (!isUserTypedBubble(bubble)) continue;

      const text = unwrapQuery(String(bubble.text).trim());
      if (!text) continue;

      const rest = row.key.slice("bubbleId:".length);
      userText.set(rest, text);
      // also index by trailing bubbleId for legacy keys
      const parts = rest.split(":");
      if (parts.length >= 2) {
        userText.set(parts[parts.length - 1], text);
      }
      userTyped += 1;
    }

    stats.composerBubbleRows += bubbleRows;
    stats.composerUserBubbles += userTyped;

    // Pass 3: emit in conversation order per composer
    let total = 0;
    const seen = new Set(); // avoid double-count if same bubble referenced twice

    for (const [composerId, { repo, bubbleIds }] of composers) {
      let got = 0;
      for (const bubbleId of bubbleIds) {
        const key = `${composerId}:${bubbleId}`;
        const text = userText.get(key) ?? userText.get(bubbleId);
        if (!text) continue;
        const dedupeKey = `${repo}\0${key}\0${text}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        push(byRepo, repo, text);
        total += 1;
        got += 1;
      }
      if (got > 0) stats.composerSessionsWithUserMsgs += 1;
    }

    return total;
  } finally {
    database.close();
  }
}

function extractComposer(byRepo, stats) {
  if (!hasSqlite3() && !DatabaseSync) {
    console.error("sqlite unavailable — skipping composer sessions");
    return 0;
  }

  const paths = getCursorPaths();
  const dbs = findStateDbs(paths.workspaceStorage, paths.globalDb);
  let total = 0;

  console.error(`Composer DBs: ${dbs.length}`);
  for (const db of dbs) {
    const label = path.basename(db.wsDir || "global");
    const n = extractComposerDb(db, byRepo, stats);
    console.error(`  ${label}: ${n} user msgs`);
    total += n;
  }
  return total;
}

async function main() {
  const byRepo = {};
  const stats = {
    transcriptProjects: 0,
    transcriptSessions: 0,
    transcriptSessionsWithUserMsgs: 0,
    composerDataRows: 0,
    composerSessions: 0,
    composerSessionsWithUserMsgs: 0,
    composerBubbleRows: 0,
    composerUserBubbles: 0,
  };

  console.error("Scanning agent-transcripts...");
  const t1 = await extractTranscripts(byRepo, stats);
  console.error(
    `  projects=${stats.transcriptProjects} sessions=${stats.transcriptSessions} withUserMsgs=${stats.transcriptSessionsWithUserMsgs} messages=${t1}`,
  );

  console.error("Scanning composer DBs (streamed)...");
  const t2 = extractComposer(byRepo, stats);
  console.error(
    `  composerDataRows=${stats.composerDataRows} sessionsWithHeaders=${stats.composerSessions} withUserMsgs=${stats.composerSessionsWithUserMsgs}`,
  );
  console.error(
    `  bubbleRows=${stats.composerBubbleRows} userTypedBubbles=${stats.composerUserBubbles} messages=${t2}`,
  );

  for (const key of Object.keys(byRepo)) {
    if (byRepo[key].length === 0) delete byRepo[key];
  }

  fs.writeFileSync(OUT, JSON.stringify(byRepo, null, 2));

  console.error("--- coverage ---");
  console.error(
    `transcripts: ${t1} msgs | composer: ${t2} msgs | combined: ${t1 + t2}`,
  );
  console.error(
    `repos: ${Object.keys(byRepo).length} → ${OUT}`,
  );
  console.error(
    "Note: agent chats can appear in BOTH sources; composer Chat/Composer sessions are composer-only.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
