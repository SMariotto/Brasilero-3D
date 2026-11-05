// Teste de carga: N controles e M telões falsos entram numa sala, mexem no lobby e ficam por alguns segundos.
//
//   npm run carga                                    (sobe um servidor próprio: 6 controles, 8 telões, 30 s)
//   npm run carga -- --controles 6 --telas 8 --seg 30
//   npm run carga -- --url ws://localhost:8787/ws    (usa um servidor que já está rodando)
//
// Imprime as mensagens recebidas, o ping medido e o pior tempo de passo do servidor (/saude). Sai com código 1 se algo deu errado.
import { WebSocket } from "ws";
import { VERSAO_PROTOCOLO, type Lado, type MensagemServidor } from "@b3d/core";
import { criarServidor, type ServidorB3D } from "../servidor";

function numero(nome: string, padrao: number): number {
  const i = process.argv.indexOf(`--${nome}`);
  const valor = i >= 0 ? Number(process.argv[i + 1]) : padrao;
  if (!Number.isFinite(valor) || valor < 0) throw new Error(`--${nome} precisa ser um número`);
  return valor;
}

function texto(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

interface Falso {
  nome: string;
  ws: WebSocket;
  sala: string;
  mensagens: number;
  lobbies: number;
  erros: string[];
  pings: number[];
}

/** Abre um aparelho falso e espera o `bemvindo`. */
function conectar(url: string, nome: string, ola: Record<string, unknown>): Promise<Falso> {
  return new Promise((resolve, reject) => {
    const f: Falso = { nome, ws: new WebSocket(url), sala: "", mensagens: 0, lobbies: 0, erros: [], pings: [] };
    let entrou = false;
    f.ws.on("open", () => f.ws.send(JSON.stringify({ t: "ola", versao: VERSAO_PROTOCOLO, ...ola })));
    f.ws.on("message", (d) => {
      f.mensagens++;
      const m = JSON.parse(d.toString()) as MensagemServidor;
      if (m.t === "bemvindo") {
        entrou = true;
        f.sala = m.sala;
        resolve(f);
      } else if (m.t === "lobby") f.lobbies++;
      else if (m.t === "pong") f.pings.push(Date.now() - m.c);
      else if (m.t === "erro") {
        f.erros.push(m.codigo);
        if (!entrou) reject(new Error(`${nome} não entrou: ${m.codigo}`));
      }
    });
    f.ws.on("error", reject);
    f.ws.on("close", () => {
      if (!entrou) reject(new Error(`${nome}: a conexão fechou antes de entrar`));
    });
  });
}

const nControles = numero("controles", 6);
const nTelas = numero("telas", 8);
const segundos = numero("seg", 30);
const urlExterna = texto("url");

let servidor: ServidorB3D | undefined;
let url = urlExterna;
if (!url) {
  servidor = await criarServidor({ porta: 0 });
  url = `ws://127.0.0.1:${servidor.porta()}/ws`;
}
const base = url.replace(/^ws/, "http").replace(/\/ws$/, "");

console.log(`Carga: ${nControles} controles e ${nTelas} telões por ${segundos} s em ${url}`);

const todos: Falso[] = [];
let saida = 0;

try {
  if (nTelas < 1) throw new Error("--telas precisa ser pelo menos 1 (é o telão que cria a sala)");
  const principal = await conectar(url, "tela 1", { acao: "criar" });
  todos.push(principal);
  const sala = principal.sala;
  console.log(`Sala ${sala} criada.`);

  for (let i = 2; i <= nTelas; i++) todos.push(await conectar(url, `tela ${i}`, { acao: "assistir", sala }));
  const controles: Falso[] = [];
  for (let i = 1; i <= nControles; i++) controles.push(await conectar(url, `controle ${i}`, { sala, apelido: `Falso${i}` }));
  todos.push(...controles);
  console.log(`Todos entraram (${todos.length} conexões). Rodando...`);

  // Cada controle escolhe um lado e marca pronto de vez em quando, e todo mundo manda ping a cada 2 s.
  const lados: Lado[] = ["casa", "visitante", "tanto"];
  const timers = [
    setInterval(() => {
      for (const f of todos) if (f.ws.readyState === WebSocket.OPEN) f.ws.send(JSON.stringify({ t: "ping", c: Date.now() }));
    }, 2000),
    setInterval(() => {
      controles.forEach((c, i) => {
        if (c.ws.readyState !== WebSocket.OPEN) return;
        c.ws.send(JSON.stringify({ t: "lado", lado: lados[(i + Math.floor(Date.now() / 3000)) % 3] }));
        c.ws.send(JSON.stringify({ t: "pronto", valor: Math.random() < 0.5 }));
      });
    }, 1000),
  ];

  await new Promise((r) => setTimeout(r, segundos * 1000));
  for (const t of timers) clearInterval(t);

  const saude = (await (await fetch(`${base}/saude`)).json()) as { salas: number; conexoes: number; piorPassoMs: number };
  const aindaAbertas = todos.filter((f) => f.ws.readyState === WebSocket.OPEN).length;

  const total = todos.reduce((s, f) => s + f.mensagens, 0);
  const lobbies = todos.reduce((s, f) => s + f.lobbies, 0);
  const pings = todos.flatMap((f) => f.pings);
  const erros = todos.flatMap((f) => f.erros.map((e) => `${f.nome}: ${e}`));

  console.log("");
  console.log(`Conexões abertas no fim: ${aindaAbertas} de ${todos.length}`);
  console.log(`Mensagens recebidas:     ${total} (${lobbies} lobbies, ${(total / segundos).toFixed(0)} por segundo no total)`);
  if (pings.length > 0) {
    console.log(`Ping medido:             médio ${(pings.reduce((a, b) => a + b, 0) / pings.length).toFixed(1)} ms, pior ${Math.max(...pings)} ms`);
  }
  console.log(`Servidor (/saude):       ${saude.salas} sala(s), ${saude.conexoes} conexões, pior passo ${saude.piorPassoMs} ms (sem laço de jogo ainda)`);
  console.log(`Erros recebidos:         ${erros.length === 0 ? "nenhum" : erros.join(", ")}`);

  if (aindaAbertas !== todos.length || erros.length > 0 || saude.conexoes !== todos.length) saida = 1;
  console.log(saida === 0 ? "\nOK" : "\nFALHOU");
} catch (e) {
  console.error(`Erro: ${e instanceof Error ? e.message : String(e)}`);
  saida = 1;
} finally {
  for (const f of todos) f.ws.close();
  await servidor?.fechar();
}

process.exit(saida);
