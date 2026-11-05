// Depois do build: confere que o controle ficou leve (ARQUITETURA 2 e SPEC 7.4).
// Soma o tamanho de tudo que controle.html carrega (JS e CSS, inclusive blocos compartilhados) e falha se passar de 300 KB.
// Também falha se algum desses arquivos tiver cara de Three.js.
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LIMITE_KB = 300;
const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(raiz, "apps", "web", "dist");
const paginaControle = join(dist, "controle.html");

if (!existsSync(paginaControle)) {
  console.error(`Não achei ${paginaControle}. Rode o build do site antes (npm run build).`);
  process.exit(1);
}

const html = readFileSync(paginaControle, "utf8");
const referencias = new Set();
for (const m of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css|mjs))"/g)) {
  if (!m[1].startsWith("http")) referencias.add(m[1]);
}

let total = 0;
let achouThree = false;
for (const ref of referencias) {
  const arquivo = join(dist, ref.replace(/^\.?\//, ""));
  if (!existsSync(arquivo)) {
    console.error(`controle.html aponta para ${ref}, que não existe no dist.`);
    process.exit(1);
  }
  total += statSync(arquivo).size;
  if (arquivo.endsWith(".js") && /REVISION\s*=\s*"\d+"|WebGLRenderer/.test(readFileSync(arquivo, "utf8"))) achouThree = true;
}

const kb = total / 1024;
console.log(`Controle: ${referencias.size} arquivo(s), ${kb.toFixed(1)} KB (limite ${LIMITE_KB} KB).`);

if (achouThree) {
  console.error("O controle está carregando Three.js. Ele nunca pode importar nada de src/tela/.");
  process.exit(1);
}
if (kb > LIMITE_KB) {
  console.error(`O controle passou do limite de ${LIMITE_KB} KB.`);
  process.exit(1);
}
