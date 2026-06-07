import { execFileSync, spawnSync } from "child_process";
import fs from "fs";
import path from "path";

export function hasSqlite3() {
  const result = spawnSync("which", ["sqlite3"], { encoding: "utf8" });
  return result.status === 0 && Boolean(result.stdout.trim());
}

function runQuery(dbPath, sql) {
  return execFileSync("sqlite3", [dbPath, sql], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 256,
  });
}

export function getTables(dbPath) {
  try {
    return runQuery(dbPath, ".tables");
  } catch {
    return "";
  }
}

export function hasCursorDiskKv(dbPath) {
  return getTables(dbPath).includes("cursorDiskKV");
}

export function queryValue(dbPath, sql) {
  const out = runQuery(dbPath, sql).trim();
  return out === "" ? null : out;
}

export function findStateDbs(workspaceStorage, globalDb) {
  const dbs = [];
  if (globalDb && fs.existsSync(globalDb)) {
    dbs.push({ dbPath: globalDb, kind: "global", wsHash: "global" });
  }

  try {
    for (const entry of fs.readdirSync(workspaceStorage, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const wsDir = path.join(workspaceStorage, entry.name);
      const dbPath = path.join(wsDir, "state.vscdb");
      if (fs.existsSync(dbPath)) {
        dbs.push({
          dbPath,
          kind: "workspace",
          wsHash: entry.name,
          wsDir,
        });
      }
    }
  } catch {
    // workspace storage missing
  }

  return dbs;
}
