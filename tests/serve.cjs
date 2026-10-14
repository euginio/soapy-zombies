const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8"
};

http
  .createServer((request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405).end();
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    } catch {
      response.writeHead(400).end();
      return;
    }

    let filePath = path.resolve(root, `.${pathname}`);
    if (filePath === root) {
      filePath = path.join(root, "index.html");
    }
    if (!filePath.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }

    fs.stat(filePath, (error, stats) => {
      if (error || !stats.isFile()) {
        response.writeHead(404).end();
        return;
      }

      response.writeHead(200, {
        "Content-Length": stats.size,
        "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream"
      });

      if (request.method === "HEAD") {
        response.end();
      } else {
        fs.createReadStream(filePath).pipe(response);
      }
    });
  })
  .listen(4173, "127.0.0.1");
