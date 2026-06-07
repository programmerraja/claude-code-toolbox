import fs from "fs";
import path from "path";
import readline from "readline";

async function loadJsonl(filePath) {
  const entries = [];
  if (!fs.existsSync(filePath)) return entries;

  const stream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let index = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const raw = JSON.parse(line);
      entries.push(normalizeTranscriptEntry(raw, index));
      index += 1;
    } catch (err) {
      console.error("Failed to parse transcript line:", filePath, err.message);
    }
  }
  return entries;
}

function normalizeTranscriptEntry(raw, index) {
  const role = raw.role || raw.type || "unknown";
  const type =
    role === "assistant" || role === "user" || role === "system"
      ? role
      : role;

  return {
    type,
    message: raw.message ?? { content: raw.content ?? "" },
    timestamp: raw.timestamp ?? null,
    _entryId: String(index),
    _source: "transcripts",
  };
}

export function listTranscriptProjects(projectsDir) {
  const projects = [];
  if (!fs.existsSync(projectsDir)) return projects;

  for (const entry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const transcriptsDir = path.join(
      projectsDir,
      entry.name,
      "agent-transcripts",
    );
    if (!fs.existsSync(transcriptsDir)) continue;

    const sessionIds = fs
      .readdirSync(transcriptsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    if (sessionIds.length === 0) continue;

    projects.push({
      id: entry.name,
      slug: entry.name,
      workspacePath: guessWorkspaceFromSlug(entry.name),
      sources: ["transcripts"],
      transcriptsDir,
      sessionCount: sessionIds.length,
    });
  }

  return projects;
}

function guessWorkspaceFromSlug(slug) {
  // Cursor encodes workspace paths into slugs (lossy). Keep slug as-is for display.
  return "";
}

export async function listTranscriptSessions(transcriptsDir) {
  const sessions = [];
  if (!fs.existsSync(transcriptsDir)) return sessions;

  for (const entry of fs.readdirSync(transcriptsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sessionId = entry.name;
    const jsonlPath = path.join(
      transcriptsDir,
      sessionId,
      `${sessionId}.jsonl`,
    );
    if (!fs.existsSync(jsonlPath)) continue;

    const stat = fs.statSync(jsonlPath);
    const subagents = listSubagentIds(transcriptsDir, sessionId);

    sessions.push({
      id: sessionId,
      source: "transcripts",
      title: sessionId,
      createdAt: stat.mtime.toISOString(),
      messageCount: await countJsonlLines(jsonlPath),
      size: stat.size,
      subagentCount: subagents.length,
    });
  }

  sessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return sessions;
}

async function countJsonlLines(filePath) {
  let count = 0;
  const stream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) count += 1;
  }
  return count;
}

function listSubagentIds(transcriptsDir, sessionId) {
  const subDir = path.join(transcriptsDir, sessionId, "subagents");
  if (!fs.existsSync(subDir)) return [];
  return fs
    .readdirSync(subDir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => f.replace(/\.jsonl$/, ""));
}

export async function loadTranscriptSession(transcriptsDir, sessionId) {
  const jsonlPath = path.join(transcriptsDir, sessionId, `${sessionId}.jsonl`);
  const entries = await loadJsonl(jsonlPath);
  const subagentIds = listSubagentIds(transcriptsDir, sessionId);

  const subagents = await Promise.all(
    subagentIds.map(async (id) => {
      const subPath = path.join(
        transcriptsDir,
        sessionId,
        "subagents",
        `${id}.jsonl`,
      );
      const stat = fs.existsSync(subPath) ? fs.statSync(subPath) : null;
      const description = await inferSubagentDescription(subPath);
      return {
        id,
        description,
        size: stat?.size ?? 0,
        mtime: stat?.mtime?.toISOString() ?? null,
      };
    }),
  );

  const stat = fs.existsSync(jsonlPath) ? fs.statSync(jsonlPath) : null;

  return {
    id: sessionId,
    source: "transcripts",
    title: sessionId,
    createdAt: stat?.mtime?.toISOString() ?? null,
    entries,
    subagents,
    meta: { source: "transcripts", sessionId },
  };
}

async function inferSubagentDescription(subPath) {
  if (!fs.existsSync(subPath)) return "";
  const stream = fs.createReadStream(subPath);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const raw = JSON.parse(line);
      const content = raw.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text" && block.text) {
            return block.text.slice(0, 120);
          }
        }
      }
    } catch {
      // ignore
    }
    break;
  }
  return "";
}

export async function loadTranscriptSubagent(transcriptsDir, sessionId, agentId) {
  const subPath = path.join(
    transcriptsDir,
    sessionId,
    "subagents",
    `${agentId}.jsonl`,
  );
  const entries = await loadJsonl(subPath);
  return { id: agentId, entries };
}
