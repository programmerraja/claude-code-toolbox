import { execFileSync } from "child_process";
import { queryValue } from "./sqlite.js";
import { decodeWorkspaceFolderUri } from "./paths.js";
import fs from "fs";
import path from "path";

const TOOL_MAP = {
  run_terminal_command_v2: "Bash",
  run_terminal_cmd: "Bash",
  read_file_v2: "Read",
  read_file: "Read",
  edit_file_v2: "Edit",
  edit_file: "Edit",
  search_replace: "Edit",
  apply_patch: "Edit",
  reapply: "Edit",
  task_v2: "Task",
  task: "Task",
  ripgrep_raw_search: "Grep",
  grep_search: "Grep",
  grep: "Grep",
  glob_file_search: "Glob",
  file_search: "Glob",
  list_dir: "LS",
  web_search: "WebSearch",
  web_fetch: "WebFetch",
  delete_file: "Delete",
  write: "Write",
};

function canonToolName(name) {
  if (typeof name === "string" && name.length > 0) {
    return TOOL_MAP[name] || name;
  }
  return "tool";
}

function remapToolInput(toolName, params) {
  let p = params && typeof params === "object" ? { ...params } : {};
  delete p.streamingContent;
  if (toolName === "Read" && p.targetFile) {
    p = { ...p, file_path: p.targetFile };
  } else if (toolName === "Edit" && p.relativeWorkspacePath) {
    p = { ...p, file_path: p.relativeWorkspacePath };
  }
  return p;
}

function parseJsonSafe(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function msToIso(ms) {
  if (!ms) return new Date().toISOString();
  const n = Number(ms);
  if (!Number.isFinite(n)) return String(ms);
  return new Date(n).toISOString();
}

function normalizeThinking(thinking) {
  if (thinking == null) return "";
  if (typeof thinking === "string") return thinking;
  if (typeof thinking === "object") {
    return thinking.text ?? thinking.content ?? thinking.thinking ?? "";
  }
  return String(thinking);
}

function toolResultContent(result) {
  const parsed = parseJsonSafe(result);
  if (parsed && typeof parsed === "object") {
    const text = parsed.output ?? parsed.contents ?? parsed.result ?? result;
    return String(text).slice(0, 4000);
  }
  return String(result ?? "").slice(0, 4000);
}

export function bubbleToEntries(bubble, { timestamp, meta, bubbleId }) {
  const entries = [];
  const role =
    String(bubble.type) === "2" || bubble.type === 2 ? "assistant" : "user";
  const tfd = bubble.toolFormerData ?? null;
  const toolCallId = tfd?.toolCallId ?? null;

  if (role === "user" && !tfd) {
    const text = bubble.text ?? "";
    if (!text) return entries;
    const entry = {
      type: "user",
      message: { role: "user", content: text },
      timestamp,
      _bubbleId: bubbleId,
    };
    if (meta) entry._cursor_meta = meta;
    entries.push(entry);
    return entries;
  }

  const content = [];
  const thinkingText = normalizeThinking(bubble.thinking);
  if (thinkingText) {
    content.push({ type: "thinking", thinking: thinkingText });
  }
  if (bubble.text) {
    content.push({ type: "text", text: bubble.text });
  }
  if (tfd) {
    const params = parseJsonSafe(tfd.params) ?? tfd.params ?? {};
    const toolName = canonToolName(tfd.name);
    const toolUse = {
      type: "tool_use",
      name: toolName,
      input: remapToolInput(toolName, params),
    };
    if (toolCallId) toolUse.id = toolCallId;
    content.push(toolUse);
  }

  if (content.length === 0) return entries;

  const assistantEntry = {
    type: "assistant",
    message: { role: "assistant", content },
    timestamp,
    _bubbleId: bubbleId,
  };
  if (meta) assistantEntry._cursor_meta = meta;
  entries.push(assistantEntry);

  if (tfd && tfd.result) {
    const resultEntry = {
      type: "user",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            content: toolResultContent(tfd.result),
            ...(toolCallId ? { tool_use_id: toolCallId } : {}),
          },
        ],
      },
      timestamp,
      _bubbleId: bubbleId,
    };
    entries.push(resultEntry);
  }

  return entries;
}

export function getWorkspacePathFromJson(wsDir) {
  const wsJson = path.join(wsDir, "workspace.json");
  if (!fs.existsSync(wsJson)) return "";
  try {
    const data = JSON.parse(fs.readFileSync(wsJson, "utf8"));
    return decodeWorkspaceFolderUri(data.folder ?? "");
  } catch {
    return "";
  }
}

export function resolveSessionWorkspace(composerData, fallbackWorkspace) {
  let sessionWs =
    composerData.workspaceIdentifier?.uri?.fsPath ??
    composerData.workspaceIdentifier?.fsPath ??
    "";

  if (!sessionWs) {
    const filePaths = [];
    for (const sel of composerData.context?.fileSelections ?? []) {
      if (sel?.uri?.fsPath) filePaths.push(sel.uri.fsPath);
    }
    for (const uri of composerData.allAttachedFileCodeChunksUris ?? []) {
      if (typeof uri === "string") {
        filePaths.push(uri.replace(/^file:\/\//, ""));
      }
    }

    let candRoot = "";
    let agree = true;
    for (const filePath of filePaths) {
      if (!filePath) continue;
      const root = findGitRoot(filePath);
      if (!root) continue;
      if (!candRoot) candRoot = root;
      else if (candRoot !== root) {
        agree = false;
        break;
      }
    }
    if (agree && candRoot) sessionWs = candRoot;
  }

  return sessionWs || fallbackWorkspace || "";
}

function findGitRoot(startPath) {
  let p = startPath;
  let prev = "";
  while (p && p !== "/" && p !== "." && p !== prev) {
    if (fs.existsSync(path.join(p, ".git")) || fs.existsSync(path.join(p, ".jj"))) {
      return p;
    }
    prev = p;
    p = path.dirname(p);
  }
  return "";
}

export function listComposerSessions(dbPath, wsDir) {
  if (!fs.existsSync(dbPath)) return [];

  const count = Number(
    queryValue(
      dbPath,
      "SELECT COUNT(*) FROM cursorDiskKV WHERE key LIKE 'composerData:%'",
    ) ?? 0,
  );
  if (!count) return [];

  const fallbackWorkspace = wsDir ? getWorkspacePathFromJson(wsDir) : "";
  const raw = queryValue(
    dbPath,
    "SELECT group_concat(key || char(31) || value, char(30)) FROM cursorDiskKV WHERE key LIKE 'composerData:%'",
  );

  // group_concat may truncate; fall back to line-by-line export
  const rows = [];
  try {
    const out = execFileSync(
      "sqlite3",
      [
        dbPath,
        "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%'",
      ],
      { encoding: "utf8", maxBuffer: 1024 * 1024 * 512 },
    );
    const lines = out.split("\n").filter(Boolean);
    for (const line of lines) {
      const sep = line.indexOf("|");
      if (sep < 0) continue;
      const key = line.slice(0, sep);
      const value = line.slice(sep + 1);
      rows.push({ key, value });
    }
  } catch {
    if (raw) {
      for (const chunk of raw.split("\u001e")) {
        const sep = chunk.indexOf("\u001f");
        if (sep < 0) continue;
        rows.push({ key: chunk.slice(0, sep), value: chunk.slice(sep + 1) });
      }
    }
  }

  const sessions = [];
  for (const { value } of rows) {
    const composerData = parseJsonSafe(value);
    if (!composerData?.composerId) continue;
    const headers = composerData.fullConversationHeadersOnly ?? [];
    if (headers.length === 0) continue;

    const workspace = resolveSessionWorkspace(composerData, fallbackWorkspace);
    sessions.push({
      id: composerData.composerId,
      source: "composer",
      title: composerData.name || composerData.composerId,
      createdAt: composerData.createdAt
        ? new Date(Number(composerData.createdAt)).toISOString()
        : null,
      messageCount: headers.length,
      workspace,
      dbPath,
      dbKind: wsDir ? "workspace" : "global",
      wsHash: wsDir ? path.basename(wsDir) : "global",
    });
  }

  return sessions;
}

export function loadComposerSession(dbPath, composerId, wsDir) {
  const key = `composerData:${composerId}`;
  const value = queryValue(
    dbPath,
    `SELECT value FROM cursorDiskKV WHERE key = '${key.replace(/'/g, "''")}'`,
  );
  if (!value) return null;

  const composerData = parseJsonSafe(value);
  if (!composerData) return null;

  const fallbackWorkspace = wsDir ? getWorkspacePathFromJson(wsDir) : "";
  const workspace = resolveSessionWorkspace(composerData, fallbackWorkspace);
  const bubbleIds = (composerData.fullConversationHeadersOnly ?? []).map(
    (h) => h.bubbleId,
  );

  const meta = {
    composerId,
    workspace,
    agent_type: "cursor",
    source: "composer",
    dbPath,
  };

  const entries = [];
  let firstLine = true;

  for (const bubbleId of bubbleIds) {
    let bubbleValue = queryValue(
      dbPath,
      `SELECT value FROM cursorDiskKV WHERE key = 'bubbleId:${composerId}:${bubbleId}'`,
    );
    if (!bubbleValue) {
      bubbleValue = queryValue(
        dbPath,
        `SELECT value FROM cursorDiskKV WHERE key = 'bubbleId:${bubbleId}'`,
      );
    }
    if (!bubbleValue) continue;

    const bubble = parseJsonSafe(bubbleValue);
    if (!bubble) continue;

    const tsRaw =
      bubble.timingInfo?.clientEndTime ?? bubble.createdAt ?? Date.now();
    const timestamp = msToIso(tsRaw);
    const lineMeta = firstLine ? meta : null;

    entries.push(
      ...bubbleToEntries(bubble, {
        timestamp,
        meta: lineMeta,
        bubbleId,
      }),
    );
    firstLine = false;
  }

  return {
    id: composerId,
    source: "composer",
    title: composerData.name || composerId,
    workspace,
    createdAt: composerData.createdAt
      ? new Date(Number(composerData.createdAt)).toISOString()
      : null,
    entries,
    subagents: [],
    meta,
  };
}
