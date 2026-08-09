import fs from "fs";
import path from "path";
import readline from "readline";
import { DatabaseSync } from "node:sqlite";
import { getCursorPaths } from "./paths.js";
import { findStateDbs, hasCursorDiskKv } from "./sqlite.js";
import {
  getWorkspacePathFromJson,
  resolveSessionWorkspace,
} from "./extract.js";

function snippetAround(text, query, radius = 80) {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0) return text.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + q.length + radius);
  let snip = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) snip = "…" + snip;
  if (end < text.length) snip = snip + "…";
  return snip;
}

function findProjectForWorkspace(projects, workspace, dbPath) {
  if (workspace) {
    const byWs = projects.find((p) => p.workspacePath === workspace);
    if (byWs) return byWs;
  }
  // Prefer a project that already lists this composer DB
  const byDb = projects.find((p) => p.composerDbPaths?.includes(dbPath));
  if (byDb) return byDb;
  // Unattributed composer bucket
  return (
    projects.find((p) => p.id === "composer-unattributed") ||
    projects.find((p) => !p.workspacePath && p.sources?.includes("composer")) ||
    null
  );
}

function searchComposerDb(db, query, projects, limit, results, seen) {
  if (!fs.existsSync(db.dbPath) || !hasCursorDiskKv(db.dbPath)) return;

  const database = new DatabaseSync(db.dbPath, { readOnly: true });
  const fallbackWs = db.wsDir ? getWorkspacePathFromJson(db.wsDir) : "";

  try {
    const like = `%${query.replace(/%/g, "").replace(/_/g, "")}%`;
    const rows = database
      .prepare(
        `SELECT key, value FROM cursorDiskKV
         WHERE key LIKE 'bubbleId:%' AND value LIKE ? COLLATE NOCASE
         LIMIT ?`,
      )
      .all(like, Math.max(limit * 20, 200));

    const composerCache = new Map();
    const getComposer = database.prepare(
      "SELECT value FROM cursorDiskKV WHERE key = ?",
    );

    for (const row of rows) {
      if (results.length >= limit) break;

      let bubble;
      try {
        bubble = JSON.parse(row.value);
      } catch {
        continue;
      }

      const text = String(bubble.text ?? "");
      if (!text.toLowerCase().includes(query.toLowerCase())) continue;

      // bubbleId:<composerId>:<bubbleId>
      const rest = row.key.slice("bubbleId:".length);
      const sep = rest.indexOf(":");
      if (sep < 0) continue;
      const composerId = rest.slice(0, sep);
      const bubbleId = rest.slice(sep + 1);

      const dedupe = `composer:${composerId}`;
      // Keep first hit per session, but allow multiple if still under limit
      // Prefer one result per session so UI isn't flooded
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      let composerData = composerCache.get(composerId);
      if (composerData === undefined) {
        const crow = getComposer.get(`composerData:${composerId}`);
        try {
          composerData = crow?.value ? JSON.parse(crow.value) : null;
        } catch {
          composerData = null;
        }
        composerCache.set(composerId, composerData);
      }

      const workspace = composerData
        ? resolveSessionWorkspace(composerData, fallbackWs)
        : fallbackWs;
      const project = findProjectForWorkspace(projects, workspace, db.dbPath);
      if (!project) continue;

      const isAssistant =
        String(bubble.type) === "2" || bubble.type === 2;
      const role = isAssistant ? "assistant" : "user";

      results.push({
        projectId: project.id,
        projectLabel: project.label,
        workspace: workspace || project.workspacePath || "",
        sessionId: composerId,
        source: "composer",
        title: composerData?.name || composerId,
        bubbleId,
        role,
        snippet: snippetAround(text, query),
      });
    }
  } finally {
    database.close();
  }
}

async function searchTranscripts(query, projects, limit, results, seen) {
  const { projectsDir } = getCursorPaths();
  if (!fs.existsSync(projectsDir)) return;

  const q = query.toLowerCase();

  for (const project of projects) {
    if (results.length >= limit) break;
    if (!project.transcriptsDir || !fs.existsSync(project.transcriptsDir)) {
      continue;
    }

    let sessions;
    try {
      sessions = fs
        .readdirSync(project.transcriptsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory());
    } catch {
      continue;
    }

    for (const session of sessions) {
      if (results.length >= limit) break;
      const dedupe = `transcripts:${project.id}:${session.name}`;
      if (seen.has(dedupe)) continue;

      const jsonl = path.join(
        project.transcriptsDir,
        session.name,
        `${session.name}.jsonl`,
      );
      if (!fs.existsSync(jsonl)) continue;

      const hit = await scanJsonlForQuery(jsonl, q);
      if (!hit) continue;

      seen.add(dedupe);
      results.push({
        projectId: project.id,
        projectLabel: project.label,
        workspace: project.workspacePath || "",
        sessionId: session.name,
        source: "transcripts",
        title: session.name,
        bubbleId: null,
        role: hit.role,
        snippet: snippetAround(hit.text, query),
      });
    }
  }
}

async function scanJsonlForQuery(filePath, qLower) {
  const stream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      // Fast reject before JSON.parse
      if (!line.toLowerCase().includes(qLower)) continue;

      let raw;
      try {
        raw = JSON.parse(line);
      } catch {
        continue;
      }

      const role = raw.role || raw.type || "unknown";
      const content = raw.message?.content ?? raw.content;
      let text = "";
      if (typeof content === "string") text = content;
      else if (Array.isArray(content)) {
        text = content
          .map((b) =>
            typeof b === "string" ? b : b?.text || b?.thinking || "",
          )
          .join("\n");
      }
      if (text.toLowerCase().includes(qLower)) {
        return { role, text };
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }
  return null;
}

/**
 * Search user/assistant message text across composer DBs + agent transcripts.
 * @param {string} query
 * @param {object[]} projects - from discoverProjects()
 * @param {{ limit?: number }} [opts]
 */
export async function searchSessions(query, projects, opts = {}) {
  const q = (query || "").trim();
  if (q.length < 2) {
    return { query: q, results: [], error: "Query too short (min 2 chars)" };
  }

  const limit = Math.min(Math.max(Number(opts.limit) || 30, 1), 100);
  const results = [];
  const seen = new Set();

  const paths = getCursorPaths();
  const dbs = findStateDbs(paths.workspaceStorage, paths.globalDb);

  // Global first — that's where most composer data lives
  const ordered = [
    ...dbs.filter((d) => d.kind === "global"),
    ...dbs.filter((d) => d.kind === "workspace"),
  ];

  for (const db of ordered) {
    if (results.length >= limit) break;
    try {
      searchComposerDb(db, q, projects, limit, results, seen);
    } catch (err) {
      console.error("composer search failed:", db.dbPath, err.message);
    }
  }

  if (results.length < limit) {
    await searchTranscripts(q, projects, limit, results, seen);
  }

  return { query: q, results, count: results.length };
}
