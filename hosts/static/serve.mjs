// Zero-dependency static server for the demo and the static e2e hosts.
// Serves the repo root, so pages import ../../src/elephant-combo.js directly.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const port = Number(process.env.PORT || 8765);
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json" };

const { serverSearch, searchRefusal } = await import("./data.js");

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api/options") {
    const refused = searchRefusal(url.searchParams);
    if (refused) { res.writeHead(refused.status, { "content-type": "application/json" }).end(JSON.stringify(refused.body)); return; }
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(serverSearch(url.searchParams)));
    return;
  }
  let path = normalize(decodeURIComponent(url.pathname));
  if (path.includes("..")) { res.writeHead(400).end(); return; }
  let file = join(root, path);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}/demo/`));
