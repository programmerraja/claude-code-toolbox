import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  clearComposerCache,
  discoverProjects,
  findProjectById,
  getHealth,
  listSessionsForProject,
  loadSession,
  loadSubagent,
} from "./lib/discover.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3001;
let projectCache = null;
let projectCacheTime = 0;
const CACHE_TTL_MS = 30_000;

function sendCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function serveStaticFile(res, urlPath) {
  const filePath = path.join(
    __dirname,
    "public",
    urlPath === "/" ? "index.html" : urlPath,
  );
  const ext = path.extname(filePath);
  let contentType = "text/html";
  if (ext === ".js") contentType = "text/javascript";
  if (ext === ".css") contentType = "text/css";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

async function getProjects(force = false) {
  const now = Date.now();
  if (!force && projectCache && now - projectCacheTime < CACHE_TTL_MS) {
    return projectCache;
  }
  projectCache = await discoverProjects();
  projectCacheTime = now;
  return projectCache;
}

const server = http.createServer(async (req, res) => {
  sendCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const { pathname } = url;

  try {
    if (pathname === "/api/health" && req.method === "GET") {
      sendJson(res, 200, getHealth());
      return;
    }

    if (pathname === "/api/projects" && req.method === "GET") {
      const force = url.searchParams.get("refresh") === "1";
      if (force) clearComposerCache();
      const projects = await getProjects(force);
      sendJson(
        res,
        200,
        projects.map((p) => ({
          id: p.id,
          slug: p.slug,
          label: p.label,
          workspacePath: p.workspacePath,
          sources: p.sources,
        })),
      );
      return;
    }

    if (pathname.startsWith("/api/projects/") && req.method === "GET") {
      const parts = pathname.split("/").filter(Boolean);
      const projectId = decodeURIComponent(parts[2] ?? "");

      if (parts.length === 3) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }

      const projects = await getProjects();
      const project = await findProjectById(projectId, projects);
      if (!project) {
        sendJson(res, 404, { error: "Project not found" });
        return;
      }

      if (parts.length === 4 && parts[3] === "sessions") {
        const sessions = await listSessionsForProject(project);
        sendJson(res, 200, sessions);
        return;
      }

      if (parts.length === 5 && parts[3] === "sessions") {
        const sessionId = parts[4];
        const source = url.searchParams.get("source") || "transcripts";
        const data = await loadSession(project, sessionId, source);
        sendJson(res, 200, data);
        return;
      }

      if (
        parts.length === 7 &&
        parts[3] === "sessions" &&
        parts[5] === "subagents"
      ) {
        const sessionId = parts[4];
        const agentId = parts[6];
        const source = url.searchParams.get("source") || "transcripts";
        const data = await loadSubagent(project, sessionId, agentId, source);
        sendJson(res, 200, data);
        return;
      }
    }

    serveStaticFile(res, pathname);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Cursor Session Viewer running at http://localhost:${PORT}`);
});
