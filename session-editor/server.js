import http from "http";
import fs from "fs";
import path from "path";
import os from "os";
import readline from "readline";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fsp = fs.promises;

const configHome = path.join(os.homedir(), ".claude", "projects");

const PORT = 3000;

function sendCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "OPTIONS, GET, POST, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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

// Logic to load entire jsonl file
async function loadJsonl(filePath) {
  const entries = [];
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch (e) {
      console.error("Failed to parse line:", line);
    }
  }
  return entries;
}

async function walkDir(dir, fileList = [], baseDir = dir) {
  try {
    const files = await fsp.readdir(dir, { withFileTypes: true });
    for (const file of files) {
      if (file.isDirectory()) {
        await walkDir(path.join(dir, file.name), fileList, baseDir);
      } else if (
        file.isFile() &&
        (file.name.endsWith(".md") || file.name.endsWith(".txt"))
      ) {
        const fullPath = path.join(dir, file.name);
        fileList.push(path.relative(baseDir, fullPath));
      }
    }
  } catch (err) {
    // dir might not exist
  }
  return fileList;
}

const server = http.createServer(async (req, res) => {
  sendCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  try {
    if (pathname === "/api/projects" && req.method === "GET") {
      const dirs = await fsp.readdir(configHome, { withFileTypes: true });
      const projects = dirs.filter((d) => d.isDirectory()).map((d) => d.name);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(projects));
      return;
    }

    if (pathname.startsWith("/api/projects/") && req.method === "GET") {
      const parts = pathname.split("/");
      const projectDirName = decodeURIComponent(parts[3]);

      if (
        parts.length === 4 ||
        (parts[4] === "sessions" && parts.length === 5)
      ) {
        // List sessions
        const projectPath = path.join(configHome, projectDirName);
        const files = await fsp.readdir(projectPath, { withFileTypes: true });

        const sessions = [];
        for (let file of files) {
          if (file.isFile() && file.name.endsWith(".jsonl")) {
            const sessionId = file.name.replace(".jsonl", "");
            const stat = await fsp.stat(path.join(projectPath, file.name));
            sessions.push({
              id: sessionId,
              size: stat.size,
              mtime: stat.mtime,
            });
          }
        }
        sessions.sort((a, b) => b.mtime - a.mtime); // Newest first

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(sessions));
        return;
      }

      if (parts.length === 6 && parts[4] === "sessions") {
        const sessionId = parts[5];
        const sessionPath = path.join(
          configHome,
          projectDirName,
          `${sessionId}.jsonl`,
        );

        let entries = [];
        try {
          entries = await loadJsonl(sessionPath);
        } catch (e) {
          // ignore error, handled mostly by UI length
        }

        // Check for subagents
        let subagents = [];
        const subagentsDir = path.join(
          configHome,
          projectDirName,
          sessionId,
          "subagents",
        );
        try {
          const files = await fsp.readdir(subagentsDir, {
            withFileTypes: true,
          });
          for (let file of files) {
            if (file.isFile() && file.name.endsWith(".meta.json")) {
              const metaContent = await fsp.readFile(
                path.join(subagentsDir, file.name),
                "utf8",
              );
              const aid = file.name.replace(".meta.json", "");
              try {
                subagents.push(
                  Object.assign({ id: aid }, JSON.parse(metaContent)),
                );
              } catch (e) {}
            }
          }
        } catch (e) {
          // ignoring if no subagents dir
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ entries, subagents }));
        return;
      }

      if (
        parts.length === 8 &&
        parts[4] === "sessions" &&
        parts[6] === "subagents"
      ) {
        const sessionId = parts[5];
        const agentId = parts[7];
        const sessionPath = path.join(
          configHome,
          projectDirName,
          sessionId,
          "subagents",
          `${agentId}.jsonl`,
        );
        const entries = await loadJsonl(sessionPath);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ entries }));
        return;
      }

      if (parts.length === 5 && parts[4] === "memory") {
        const memoryDir = path.join(configHome, projectDirName, "memory");
        const files = await walkDir(memoryDir);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(files));
        return;
      }

      if (parts.length === 6 && parts[4] === "memory" && parts[5] === "file") {
        const targetFile = url.searchParams.get("path");
        const filePath = path.join(
          configHome,
          projectDirName,
          "memory",
          targetFile,
        );
        // Security boundary
        if (
          !filePath.startsWith(path.join(configHome, projectDirName, "memory"))
        ) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }
        try {
          const content = await fsp.readFile(filePath, "utf8");
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end(content);
        } catch (e) {
          res.writeHead(404);
          res.end("Not Found");
        }
        return;
      }
    }

    // Very basic truncation API to delete nodes from the graph
    if (pathname.startsWith("/api/projects/") && req.method === "POST") {
      const parts = pathname.split("/");
      const projectDirName = decodeURIComponent(parts[3]);
      const sessionId = parts[5];

      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const { entries } = JSON.parse(body);
          const sessionPath = path.join(
            configHome,
            projectDirName,
            `${sessionId}.jsonl`,
          );
          // Overwrite with trimmed entries
          const data = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
          await fsp.writeFile(sessionPath, data);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // Serve static assets
    serveStaticFile(res, pathname);
  } catch (err) {
    console.error(err);
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`Claude Session Editor running at http://localhost:${PORT}`);
});
