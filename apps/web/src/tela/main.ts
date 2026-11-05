import { toDataURL } from "qrcode";
import { SERVIDOR, decodificarSnapshot, normalizarSala, type Lobby, type MensagemServidor } from "@b3d/core";
import { criarCliente, type Cliente, type EstadoCliente } from "../comum/cliente";
import { esquecerServidor, lembrarServidorDaUrl, servidorLembrado } from "../comum/config";
import { porId } from "../comum/dom";
import "../comum/estilo.css";
import "./tela.css";
import type { CenaJogo } from "./cena";
import { criarLobby } from "./lobby";
import { enderecoParaCelular } from "./rede";

const inicio = porId("inicio");
const lobbyEl = porId("lobby");
const jogoEl = porId("jogo");
const carregando = porId("carregando");
const reconectando = porId("reconectando");
const pingEl = porId("ping");
const avisoInicio = porId("aviso-inicio");
const campoCodigo = porId<HTMLInputElement>("codigo");

const lobby = criarLobby(lobbyEl);

/** Código da sala em que estamos. Vem da URL (recarregar a página volta para a mesma sala) ou do `bemvindo`. */
let sala: string | null = normalizarSala(new URLSearchParams(location.search).get("sala") ?? "") || null;
let cliente: Cliente | null = null;
let entradaMontadaPara: string | null = null;

// O 3D (Three.js) só é baixado quando a primeira partida começa, para o lobby abrir rápido.
// Tudo que mexe na cena passa por `naCena`, que mantém a ordem das mensagens mesmo antes de o módulo chegar.
let cenaPronta: Promise<CenaJogo> | null = null;
let emJogo = false;

function naCena(fn: (c: CenaJogo) => void | Promise<void>): void {
  if (!cenaPronta) {
    cenaPronta = import("./cena").then(({ CenaJogo }) => new CenaJogo(porId("canvas-host"), porId("hud")));
  }
  cenaPronta = cenaPronta.then(async (c) => {
    await fn(c);
    return c;
  });
}

type Cena = "inicio" | "carregando" | "lobby" | "jogo";

function mostrar(cena: Cena): void {
  inicio.hidden = cena !== "inicio";
  lobbyEl.hidden = cena !== "lobby";
  jogoEl.hidden = cena !== "jogo";
  carregando.hidden = cena !== "carregando";
  pingEl.hidden = cena === "inicio";
}

function voltarAoInicio(aviso: string): void {
  cliente?.fechar();
  cliente = null;
  sala = null;
  entradaMontadaPara = null;
  if (emJogo) {
    emJogo = false;
    naCena((c) => c.parar());
  }
  reconectando.hidden = true;
  history.replaceState(null, "", location.pathname + srvNaUrl());
  avisoInicio.textContent = aviso;
  mostrar("inicio");
}

/** Mantém o `?srv=` (se houver) ao mexer na URL. */
function srvNaUrl(): string {
  const srv = new URLSearchParams(location.search).get("srv");
  return srv ? `?srv=${encodeURIComponent(srv)}` : "";
}

function lembrarSala(codigo: string): void {
  const p = new URLSearchParams(location.search);
  p.set("sala", codigo);
  history.replaceState(null, "", `${location.pathname}?${p.toString()}`);
}

async function montarEntrada(codigo: string): Promise<void> {
  if (entradaMontadaPara === codigo) return;
  entradaMontadaPara = codigo;
  const { origem, srv } = await enderecoParaCelular();
  const link = `${origem}/controle.html?sala=${codigo}&srv=${encodeURIComponent(srv)}`;
  let qr: string | null = null;
  try {
    qr = await toDataURL(link, { margin: 1, width: 320, errorCorrectionLevel: "M" });
  } catch {
    qr = null;
  }
  if (entradaMontadaPara !== codigo) return; // mudou de sala enquanto montava
  lobby.definirEntrada(codigo, `${origem.replace(/^https?:\/\//, "")}/controle.html`, qr);
}

function aoMensagem(msg: MensagemServidor): void {
  switch (msg.t) {
    case "bemvindo":
      sala = msg.sala;
      lembrarSala(msg.sala);
      lobby.definirPrincipal(msg.principal === true);
      void montarEntrada(msg.sala);
      mostrar(emJogo ? "jogo" : "lobby");
      return;
    case "lobby":
      lobby.atualizar(msg as Lobby);
      if (emJogo && !msg.emPartida) {
        emJogo = false;
        naCena((c) => c.parar());
        mostrar("lobby");
      }
      return;
    case "partida":
      emJogo = true;
      mostrar("jogo");
      naCena((c) => c.iniciar(msg));
      return;
    case "evento":
      naCena((c) => c.evento(msg));
      return;
    case "fim":
      naCena((c) => c.fim(msg));
      return;
    case "principal":
      lobby.definirPrincipal(msg.valor);
      return;
    case "erro":
      voltarAoInicio(msg.msg);
      return;
    default:
      return;
  }
}

function aoEstado(estado: EstadoCliente): void {
  reconectando.hidden = estado !== "reconectando";
  if (estado === "reconectando") pingEl.textContent = "";
}

function aoPing(ms: number): void {
  const lento = ms > SERVIDOR.pingAvisoMs;
  pingEl.textContent = lento ? `Conexão lenta: ping ${ms} ms` : `ping ${ms} ms`;
  pingEl.classList.toggle("alto", lento);
}

function aoFechar(codigo: number): void {
  if (codigo === 4004) voltarAoInicio("A sala foi encerrada.");
}

function iniciar(): void {
  avisoInicio.textContent = "";
  mostrar("carregando");
  cliente = criarCliente({
    gerarOla: () => (sala ? { t: "ola", acao: "assistir", sala } : { t: "ola", acao: "criar" }),
    aoMensagem,
    aoBinario: (dados) => {
      const s = decodificarSnapshot(dados);
      if (s && emJogo) naCena((c) => c.receberSnapshot(s));
    },
    aoEstado,
    aoPing,
    aoFechar,
  });
}

porId("criar").addEventListener("click", () => {
  sala = null;
  iniciar();
});

porId("form-assistir").addEventListener("submit", (e) => {
  e.preventDefault();
  const codigo = normalizarSala(campoCodigo.value);
  if (codigo.length !== 4) {
    avisoInicio.textContent = "O código tem 4 letras.";
    return;
  }
  sala = codigo;
  iniciar();
});

campoCodigo.addEventListener("input", () => {
  campoCodigo.value = campoCodigo.value.toUpperCase().replace(/[^A-Z]/g, "");
});

// O servidor que veio no ?srv= fica lembrado; na tela inicial dá para voltar ao padrão.
lembrarServidorDaUrl();
const avisoServidor = porId("servidor-lembrado");
function mostrarServidorLembrado(): void {
  const s = servidorLembrado();
  avisoServidor.hidden = s === null;
  if (s !== null) porId("servidor-texto").textContent = s;
}
mostrarServidorLembrado();
porId("esquecer-servidor").addEventListener("click", () => {
  esquecerServidor();
  history.replaceState(null, "", location.pathname);
  location.reload();
});

// `tela.html?vitrine=1`: página que mostra todos os clubes e uniformes (para ajustar o times.json).
if (new URLSearchParams(location.search).get("vitrine") === "1") {
  inicio.hidden = true;
  porId("vitrine").hidden = false;
  void import("./vitrine").then((m) => m.abrirVitrine(porId("vitrine")));
} else if (sala) {
  // Página recarregada com ?sala=ABCD: volta a assistir sem pedir nada.
  iniciar();
} else {
  mostrar("inicio");
}
