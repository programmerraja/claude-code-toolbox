import os from "os";
import path from "path";

export function getCursorPaths() {
  const home = os.homedir();
  const isDarwin = process.platform === "darwin";

  const workspaceStorage = isDarwin
    ? path.join(
        home,
        "Library/Application Support/Cursor/User/workspaceStorage",
      )
    : path.join(home, ".config/Cursor/User/workspaceStorage");

  const globalDb = isDarwin
    ? path.join(
        home,
        "Library/Application Support/Cursor/User/globalStorage/state.vscdb",
      )
    : path.join(home, ".config/Cursor/User/globalStorage/state.vscdb");

  const projectsDir = path.join(home, ".cursor/projects");

  return { workspaceStorage, globalDb, projectsDir, isDarwin };
}

export function decodeWorkspaceFolderUri(folderUri) {
  if (!folderUri) return "";
  try {
    const raw = folderUri.replace(/^file:\/\//, "");
    return decodeURIComponent(raw);
  } catch {
    return folderUri.replace(/^file:\/\//, "");
  }
}
