import fs from "fs";
import path from "path";
import { getCursorPaths } from "./paths.js";
import {
  findStateDbs,
  hasCursorDiskKv,
  hasSqlite3,
} from "./sqlite.js";
import {
  getWorkspacePathFromJson,
  listComposerSessions,
  loadComposerSession,
} from "./extract.js";
import {
  listTranscriptProjects,
  listTranscriptSessions,
  loadTranscriptSession,
  loadTranscriptSubagent,
} from "./transcripts.js";

const sessionIndex = new Map();
const composerSessionsCache = new Map();

function addComposerDbPath(project, dbPath) {
  if (!project.composerDbPaths.includes(dbPath)) {
    project.composerDbPaths.push(dbPath);
  }
}

function getComposerSessions(dbPath, wsDir) {
  const cacheKey = `${dbPath}:${wsDir ?? ""}`;
  if (!composerSessionsCache.has(cacheKey)) {
    composerSessionsCache.set(
      cacheKey,
      listComposerSessions(dbPath, wsDir),
    );
  }
  return composerSessionsCache.get(cacheKey);
}

function stableHash(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function projectKey(workspacePath, slug) {
  if (workspacePath) return `ws:${workspacePath}`;
  if (slug) return `slug:${slug}`;
  return "unattributed";
}

function slugToLabel(slug) {
  if (!slug) return "Unknown";
  return slug.replace(/-/g, " / ");
}

function makeProjectId(workspacePath, slug) {
  if (slug) return slug;
  if (workspacePath) return `ws-${stableHash(workspacePath)}`;
  return "composer-unattributed";
}

export function clearComposerCache() {
  composerSessionsCache.clear();
}

export function getHealth() {
  const paths = getCursorPaths();
  return {
    sqlite3: hasSqlite3(),
    projectsDir: fs.existsSync(paths.projectsDir),
    workspaceStorage: fs.existsSync(paths.workspaceStorage),
    globalDb: fs.existsSync(paths.globalDb),
    platform: process.platform,
  };
}

export async function discoverProjects() {
  const paths = getCursorPaths();
  const byKey = new Map();

  for (const project of listTranscriptProjects(paths.projectsDir)) {
    const key = projectKey(project.workspacePath, project.slug);
    byKey.set(key, {
      id: project.slug,
      slug: project.slug,
      label: slugToLabel(project.slug),
      workspacePath: project.workspacePath,
      sources: ["transcripts"],
      transcriptsDir: project.transcriptsDir,
      composerDbPaths: [],
    });
  }

  if (hasSqlite3()) {
    const dbs = findStateDbs(paths.workspaceStorage, paths.globalDb);
    const seenComposer = new Set();

    // Workspace DBs first (they win over global per reference.sh dedup)
    const ordered = [
      ...dbs.filter((d) => d.kind === "workspace"),
      ...dbs.filter((d) => d.kind === "global"),
    ];

    for (const db of ordered) {
      if (!hasCursorDiskKv(db.dbPath)) continue;
      const sessions = getComposerSessions(db.dbPath, db.wsDir);
      for (const session of sessions) {
        if (seenComposer.has(session.id)) continue;
        seenComposer.add(session.id);

        sessionIndex.set(`composer:${session.id}`, {
          source: "composer",
          dbPath: db.dbPath,
          wsDir: db.wsDir ?? null,
          wsHash: db.wsHash,
        });

        const wsPath =
          session.workspace ||
          (db.wsDir ? getWorkspacePathFromJson(db.wsDir) : "");
        const key = projectKey(wsPath, db.wsHash);

        if (byKey.has(key)) {
          const existing = byKey.get(key);
          if (!existing.sources.includes("composer")) {
            existing.sources.push("composer");
          }
          addComposerDbPath(existing, db.dbPath);
        } else {
          byKey.set(key, {
            id: makeProjectId(wsPath, null),
            slug: db.wsHash,
            label: wsPath ? path.basename(wsPath) : "Unattributed composer",
            workspacePath: wsPath,
            sources: ["composer"],
            transcriptsDir: null,
            composerDbPaths: [db.dbPath],
          });
        }
      }
    }
  }

  return Array.from(byKey.values()).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
}

export async function listSessionsForProject(project) {
  const sessions = [];

  if (project.transcriptsDir) {
    const transcriptSessions = await listTranscriptSessions(
      project.transcriptsDir,
    );
    for (const s of transcriptSessions) {
      sessionIndex.set(`transcripts:${project.slug}:${s.id}`, {
        source: "transcripts",
        transcriptsDir: project.transcriptsDir,
        sessionId: s.id,
        projectSlug: project.slug,
      });
      sessions.push(s);
    }
  }

  if (hasSqlite3() && project.composerDbPaths?.length) {
    const seen = new Set(sessions.map((s) => s.id));
    const uniqueDbPaths = [...new Set(project.composerDbPaths)];
    for (const dbPath of uniqueDbPaths) {
      const wsDir =
        dbPath.includes("workspaceStorage") &&
        !dbPath.includes("globalStorage")
          ? path.dirname(dbPath)
          : null;
      const composerSessions = getComposerSessions(dbPath, wsDir);
      for (const s of composerSessions) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        sessionIndex.set(`composer:${s.id}`, {
          source: "composer",
          dbPath,
          wsDir,
        });
        sessions.push(s);
      }
    }
  }
  sessions.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });

  return sessions;
}

export async function loadSession(project, sessionId, source) {
  if (source === "transcripts") {
    if (!project.transcriptsDir) {
      throw new Error("Project has no agent-transcripts directory");
    }
    return loadTranscriptSession(project.transcriptsDir, sessionId);
  }

  if (source === "composer") {
    const indexed = sessionIndex.get(`composer:${sessionId}`);
    const dbPath = indexed?.dbPath ?? project.composerDbPaths?.[0];
    if (!dbPath) throw new Error("No composer database found for session");
    const data = loadComposerSession(dbPath, sessionId, indexed?.wsDir ?? null);
    if (!data) throw new Error("Composer session not found");
    return data;
  }

  throw new Error(`Unknown session source: ${source}`);
}

export async function loadSubagent(project, sessionId, agentId, source) {
  if (source !== "transcripts") {
    return { id: agentId, entries: [], error: "Subagents only available for agent-transcripts" };
  }
  if (!project.transcriptsDir) {
    throw new Error("Project has no agent-transcripts directory");
  }
  return loadTranscriptSubagent(project.transcriptsDir, sessionId, agentId);
}

export async function findProjectById(projectId, projects) {
  return projects.find((p) => p.id === projectId || p.slug === projectId) ?? null;
}
