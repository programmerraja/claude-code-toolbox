const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const url = require("url");
const https = require("https");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const axios = require("axios");

const app = express();
const port = 3000;

const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Config Management with Fallbacks
const configPath = path.join(__dirname, "config.json");
if (!fs.existsSync(configPath)) {
  fs.writeFileSync(configPath, JSON.stringify({
    MASTER_USER_ID: "d1a55f9a-1111-2222-3333-e98765432101",
    USERS: {
      "Friend-1-Secret-Key": "Alice",
      "Friend-2-Secret-Key": "Bob"
    }
  }, null, 2));
}
let config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const VALID_USERS = config.USERS || {};
const MASTER_USER_ID = config.MASTER_USER_ID || "unknown-master-id";

const credentialsPath = path.join(__dirname, ".credentials.json");
if (!fs.existsSync(credentialsPath)) {
  fs.writeFileSync(credentialsPath, JSON.stringify({
    accessToken: "sk-ant-oauth-...",
    refreshToken: "...",
    expiresAt: Date.now() + 1000 * 60 * 60 * 24, // 1 day
    scopes: []
  }, null, 2));
}
let activeTokens = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));

// Constants for Token Auth
const CLAUDE_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";

async function ensureValidToken() {
  const now = Date.now();
  const bufferTime = 5 * 60 * 1000; // 5 mins buffer

  if (now + bufferTime >= activeTokens.expiresAt) {
    console.log("🔄 Token expiring soon, attempting refresh...");
    try {
      const response = await axios.post(
        TOKEN_URL,
        {
          grant_type: "refresh_token",
          refresh_token: activeTokens.refreshToken,
          client_id: CLAUDE_CLIENT_ID,
          scope: "user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload",
        },
        { headers: { "Content-Type": "application/json" } }
      );

      activeTokens.accessToken = response.data.access_token;
      activeTokens.refreshToken = response.data.refresh_token || activeTokens.refreshToken;
      activeTokens.expiresAt = now + response.data.expires_in * 1000;

      fs.writeFileSync(credentialsPath, JSON.stringify(activeTokens, null, 2));
      console.log("✅ Token successfully refreshed and saved.");
    } catch (error) {
      console.error("❌ Token refresh failed:", error.response?.data || error.message);
    }
  }
  return activeTokens.accessToken;
}

function saveToFile(data, userName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `proxy-log-${timestamp}.json`;
  
  let targetDir = logsDir;
  if (userName) {
    targetDir = path.join(logsDir, userName);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
  }

  const filepath = path.join(targetDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

// Serve static files for the dashboard
app.use("/dashboard", express.static(path.join(__dirname, "public")));

// Recursive log fetching
app.get("/api/logs", async (req, res) => {
  try {
    const logs = [];
    async function traverseDir(dir) {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await traverseDir(fullPath);
        } else if (entry.name.endsWith(".json")) {
          try {
            const content = await fs.promises.readFile(fullPath, "utf8");
            logs.push(JSON.parse(content));
          } catch (e) {
            // ignore malformed logs
          }
        }
      }
    }
    await traverseDir(logsDir);
    // Sort logs by start time descending
    logs.sort((a, b) => b.startTime - a.startTime);
    res.json(logs);
  } catch (err) {
    console.error("Error reading logs:", err);
    res.status(500).json({ error: "Failed to read logs" });
  }
});

// Middleware to parse and modify request body before proxying
app.use("/", express.json({ limit: "50mb" }));

// Pre-Proxy Interception for Auth
app.use(async (req, res, next) => {
  // Sinkhole for telemetry!
  if (req.path.includes("/api/event_logging/batch") || req.path.includes("/api/event_logging")) {
    console.log("⚡ Bypassing proxy for telemetry request:", req.path);
    return res.status(200).json({ success: true, message: "Sinkholed event logged" });
  }

  // Handle Anthropic specific checks dynamically
  if (req.path.startsWith("/v1/")) {
    const friendKey = req.headers["x-api-key"] || req.headers["authorization"]?.replace('Bearer ', '');
    const userName = VALID_USERS[friendKey];

    if (userName) {
      req.userName = userName;
      console.log(`👤 Authorized request from: ${userName}`);
      await ensureValidToken();
    } else if (req.headers["x-api-key"]) {
      console.warn(`⚠️ Warning: unrecognized x-api-key: ${friendKey}`);
      // return res.status(401).json({ error: "Unauthorized: Invalid Proxy Key" });
    }
  }

  next();
});

// Main proxy
app.use("/", (req, res, next) => {
  let targetUrl = req.query.url;

  // Fallback nicely if no url is given but it looks like anthropic path
  if (!targetUrl) {
    if (req.path.startsWith("/v1/")) {
      targetUrl = "https://api.anthropic.com";
    } else {
      return next(); // pass along if someone hit / randomly
    }
  }

  const fullTargetUrl = `${targetUrl}`;
  console.log(`➡️ Proxying request to: ${fullTargetUrl} (Path: ${req.path}, Target: ${targetUrl})`);

  const logData = {
    timestamp: new Date().toISOString(),
    startTime: Date.now(),
    userName: req.userName || "anonymous",
    request: {
      method: req.method,
      url: fullTargetUrl + req.path,
      headers: { ...req.headers },
      body: req.body,
    },
    response: {
      status: null,
      headers: null,
      body: null,
      responseTimeSeconds: null,
    },
  };

  createProxyMiddleware({
    // Explicitly target the URL requested
    target: targetUrl,
    changeOrigin: true, // It is critical for external APIs to act truthfully
    secure: true,
    selfHandleResponse: true,
    
    // http-proxy-middleware will automatically append req.url (which is the path) to the target

    on: {
      /* ---------- REQUEST LOGGING & ANONYMIZATION ---------- */
      proxyReq: (proxyReq, request) => {
        // Only strip and spoof keys if we are explicitly acting as the Anthropic Proxy
        if (targetUrl === "https://api.anthropic.com" && request.userName) {
             proxyReq.setHeader("authorization", `Bearer ${activeTokens.accessToken}`);
             proxyReq.removeHeader("x-api-key");
             
             // Strip user identities
             proxyReq.setHeader("User-Agent", "claude-code/1.0.0 (Macintosh; Intel Mac OS X 10_15_7)");
             proxyReq.removeHeader("anthropic-client-id");

             if (request.body && request.body.metadata && request.body.metadata.user_id) {
                 request.body.metadata.user_id = JSON.stringify({
                     device_id: MASTER_USER_ID,
                    //  account_uuid: MASTER_USER_ID,
                    //  session_id: MASTER_USER_ID
                 });
             }
        }
        
        // Rewrite the body for the proxy request since we parsed it in express.json()
        if (request.body && Object.keys(request.body).length > 0) {
          const bodyData = JSON.stringify(request.body);
          proxyReq.setHeader("Content-Type", "application/json");
          proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
        }
      },

      /* ---------- RESPONSE HANDLING ---------- */
      proxyRes: (proxyRes, req, res) => {
        logData.response.status = proxyRes.statusCode;
        logData.response.headers = proxyRes.headers;

        const contentType = proxyRes.headers["content-type"] || "";
        const isSSE = contentType.includes("text/event-stream");
        const isGzip = proxyRes.headers["content-encoding"] === "gzip";

        let stream = proxyRes;
        if (isGzip) stream = proxyRes.pipe(zlib.createGunzip());

        // Forward headers
        Object.entries(proxyRes.headers).forEach(([k, v]) => {
          if (!["content-encoding", "transfer-encoding"].includes(k)) {
            res.setHeader(k, v);
          }
        });
        res.statusCode = proxyRes.statusCode;

        /* ========== SSE MODE ========== */
        if (isSSE) {
          res.setHeader("Content-Type", contentType);

          let buffer = "";
          let finalText = "";

          stream.on("data", (chunk) => {
            const text = chunk.toString("utf8");
            res.write(text);
            buffer += text;

            const frames = buffer.split("\n\n");
            buffer = frames.pop();

            for (const frame of frames) {
              for (const line of frame.split("\n")) {
                if (line.startsWith("data:")) {
                  try {
                    const payload = JSON.parse(line.slice(5).trim());
                    if (
                      payload?.type === "content_block_delta" &&
                      payload.delta?.type === "text_delta"
                    ) {
                      finalText += payload.delta.text;
                    }
                  } catch {
                    // ignore non-JSON lines
                  }
                }
              }
            }
          });

          stream.on("end", () => {
             for (const line of buffer.split("\n")) {
                 if (line.startsWith("data:")) {
                   try {
                     const payload = JSON.parse(line.slice(5).trim());
                     if (payload?.type === "content_block_delta" && payload.delta?.type === "text_delta") {
                       finalText += payload.delta.text;
                     }
                   } catch {}
                 }
             }

            logData.response.body = finalText;
            logData.response.responseTimeSeconds = (
              (Date.now() - logData.startTime) /
              1000
            ).toFixed(3);
            res.end();
            saveToFile(logData, req.userName);
          });

          stream.on("error", (err) => {
            console.error("SSE error:", err.message);
            res.end();
          });

          return;
        }

        /* ========== NON-STREAMING MODE ========== */
        let body = "";
        stream.on("data", (chunk) => (body += chunk.toString("utf8")));

        stream.on("end", () => {
          try {
            logData.response.body = contentType.includes("application/json")
              ? JSON.parse(body)
              : body;
          } catch {
            logData.response.body = body;
          }
          logData.response.responseTimeSeconds = (
            (Date.now() - logData.startTime) /
            1000
          ).toFixed(3);
          res.end(body);
          saveToFile(logData, req.userName);
        });
      },
    },
  })(req, res, next);
});

app.listen(port, () => {
  console.log(`🚀 Proxy server listening at http://localhost:${port}`);
  console.log(`Loaded Identities:`, Object.keys(VALID_USERS).length, "users configured.");
});
