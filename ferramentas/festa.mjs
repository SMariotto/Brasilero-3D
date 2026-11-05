// npm run festa: joga com amigos de outras casas usando o seu PC como servidor.
//
// 1. compila o site;
// 2. sobe o servidor da partida em modo produção, servindo o site (telão, controle e WebSocket na mesma origem);
// 3. abre um túnel da Cloudflare (Quick Tunnel, grátis, sem conta) e lê o endereço https://....trycloudflare.com;
// 4. imprime os links e um QR no terminal.
//
// Variáveis (opcionais): PORT (padrão 8787), SITE_URL (o site da Vercel, para imprimir também o link por lá e liberar em ORIGENS),
// ORIGENS (já existentes), SEM_BUILD=1 (pula a compilação do site).
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AJUDA_CLOUDFLARED, extrairUrlDoTunel, montarLinks, origensDaFesta } from "./festa-util.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const porta = Number(process.env.PORT ?? 8787);
const siteExterno = process.env.SITE_URL ? process.env.SITE_URL.trim() : undefined;
const dist = join(raiz, "apps", "web", "dist");
const windows = process.platform === "win32";

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const filhos = [];

function encerrar(codigo = 0) {
  for (const f of filhos) {
    try {
      f.kill();
    } catch {
      // já saiu
    }
  }
  process.exit(codigo);
}
process.on("SIGINT", () => {
  console.log("\nEncerrando a festa...");
  encerrar(0);
});
process.on("SIGTERM", () => encerrar(0));

// --- 0. o cloudflared existe? -----------------------------------------------------------------
const versao = spawnSync("cloudflared", ["--version"], { encoding: "utf8", shell: windows });
if (versao.error || versao.status !== 0) {
  console.log(AJUDA_CLOUDFLARED);
  process.exit(0);
}
console.log(`Usando ${versao.stdout.trim().split("\n")[0]}`);

// --- 1. compila o site -----------------------------------------------------------------------
if (process.env.SEM_BUILD !== "1" || !existsSync(join(dist, "index.html"))) {
  console.log("Compilando o site...");
  const build = spawnSync("npm", ["run", "build", "-w", "@b3d/web"], { cwd: raiz, stdio: "inherit", shell: windows });
  if (build.status !== 0) {
    console.error("Não consegui compilar o site. Rode `npm run build` para ver o erro.");
    process.exit(1);
  }
}

// --- 2. servidor em modo produção, servindo o site -------------------------------------------
const require = createRequire(import.meta.url);
let tsx;
try {
  tsx = require.resolve("tsx/cli");
} catch {
  console.error("Não achei o tsx. Rode `npm install` na pasta do projeto.");
  process.exit(1);
}

const servidor = spawn(process.execPath, [tsx, join("apps", "server", "src", "index.ts")], {
  cwd: raiz,
  stdio: ["ignore", "inherit", "inherit"],
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(porta),
    SITE_DIR: dist,
    ORIGENS: origensDaFesta(siteExterno, process.env.ORIGENS),
  },
});
filhos.push(servidor);
servidor.on("exit", (codigo) => {
  console.error(`O servidor parou (código ${codigo}). Encerrando.`);
  encerrar(1);
});

let servidorNoAr = false;
for (let i = 0; i < 40 && !servidorNoAr; i++) {
  try {
    servidorNoAr = (await fetch(`http://127.0.0.1:${porta}/saude`)).ok;
  } catch {
    await dorme(250);
  }
}
if (!servidorNoAr) {
  console.error(`O servidor não respondeu em http://127.0.0.1:${porta}/saude. A porta ${porta} está em uso?`);
  encerrar(1);
}

// --- 3. túnel ---------------------------------------------------------------------------------
console.log("Abrindo o túnel da Cloudflare (leva alguns segundos)...");
const tunelProc = spawn("cloudflared", ["tunnel", "--url", `http://127.0.0.1:${porta}`, "--no-autoupdate"], { stdio: ["ignore", "pipe", "pipe"], shell: windows });
filhos.push(tunelProc);
tunelProc.on("exit", (codigo) => {
  console.error(`O cloudflared parou (código ${codigo}). Encerrando.`);
  encerrar(1);
});

const tunel = await new Promise((resolver) => {
  let texto = "";
  const fim = setTimeout(() => resolver(null), 45_000);
  const ler = (d) => {
    texto += d.toString();
    const url = extrairUrlDoTunel(texto);
    if (url) {
      clearTimeout(fim);
      resolver(url);
    }
  };
  tunelProc.stdout.on("data", ler);
  tunelProc.stderr.on("data", ler);
});

if (!tunel) {
  console.error("O cloudflared não devolveu um endereço em 45 s. Confira a internet e tente de novo.");
  encerrar(1);
}

// O endereço aparece antes de o DNS propagar: espera o túnel responder de verdade.
let alcancavel = false;
for (let i = 0; i < 40 && !alcancavel; i++) {
  try {
    alcancavel = (await fetch(`${tunel}/saude`)).ok;
  } catch {
    await dorme(1000);
  }
}

// --- 4. links ---------------------------------------------------------------------------------
const links = montarLinks({ tunel, siteExterno });
console.log("\n==================== FESTA NO AR ====================");
if (!alcancavel) console.log("(aviso: o túnel ainda não respondeu; se o link não abrir, espere uns segundos e tente de novo)");
console.log(`\nTELÃO (abra no PC ligado na TV, e é aqui que cria a sala):\n  ${links.telao}`);
if (links.telaoNoSite) console.log(`\nTelão pelo site da Vercel (mesmo servidor):\n  ${links.telaoNoSite}`);
console.log(`\nControle (para quem prefere digitar o código no celular):\n  ${links.controle}`);
console.log(`
Como jogar:
  1. Abra o link do TELÃO e clique em "Criar sala". Aparece o código de 4 letras e o QR.
  2. Quem está com você aponta a câmera do celular para o QR.
  3. Amigo de outra casa: abre o mesmo link do telão no PC dele, escolhe "Assistir uma sala" e digita o código
     (assim ele vê o jogo na tela dele) e joga pelo celular, entrando pelo link do controle ou pelo QR (você manda por mensagem).
  4. Para encerrar a festa, aperte Ctrl+C aqui.
`);

try {
  const qrcode = require("qrcode");
  console.log("QR do link do telão:");
  console.log(await qrcode.toString(links.telao, { type: "terminal", small: true }));
} catch {
  // sem QR no terminal: os links acima bastam
}
console.log("====================================================\n");
