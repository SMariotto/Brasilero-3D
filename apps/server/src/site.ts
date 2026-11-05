import { createReadStream, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

// Serve o site já compilado (apps/web/dist) pelo próprio servidor da partida. É o que deixa o `npm run festa` funcionar com
// UM túnel só: telão, controle e WebSocket ficam na mesma origem, sem depender da Vercel.

const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".glb": "model/gltf-binary",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * Responde o pedido com um arquivo da pasta do site e devolve `true`, ou devolve `false` se não achou (o servidor segue e dá 404).
 * Só GET e HEAD; nunca sai da pasta (`..` e caminhos absolutos não passam).
 */
export function servirSite(pasta: string, req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;

  let caminho: string;
  try {
    caminho = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  } catch {
    return false;
  }
  if (caminho.includes("\0")) return false;
  if (caminho.endsWith("/")) caminho += "index.html";

  const raiz = resolve(pasta);
  const arquivo = resolve(join(raiz, normalize(caminho)));
  if (arquivo !== raiz && !arquivo.startsWith(raiz + sep)) return false;

  let info;
  try {
    info = statSync(arquivo);
  } catch {
    return false;
  }
  if (!info.isFile()) return false;

  const tipo = TIPOS[extname(arquivo).toLowerCase()] ?? "application/octet-stream";
  // Os arquivos de /assets/ têm o hash no nome: podem ficar para sempre no cache. As páginas, não.
  const cache = caminho.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
  res.writeHead(200, { "content-type": tipo, "content-length": info.size, "cache-control": cache });
  if (req.method === "HEAD") {
    res.end();
  } else {
    createReadStream(arquivo).pipe(res);
  }
  return true;
}
