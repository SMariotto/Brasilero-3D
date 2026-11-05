import { toDataURL } from "qrcode";
import { normalizarSala, type Lobby, type MensagemServidor } from "@b3d/core";
import { criarCliente, type Cliente, type EstadoCliente } from "../comum/cliente";
import { porId } from "../comum/dom";
import "../comum/estilo.css";
import "./tela.css";
import { criarLobby } from "./lobby";
import { enderecoParaCelular } from "./rede";

const inicio = porId("inicio");
const lobbyEl = porId("lobby");
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

type Cena = "inicio" | "carregando" | "lobby";

function mostrar(cena: Cena): void {
  inicio.hidden = cena !== "inicio";
  lobbyEl.hidden = cena !== "lobby";
  carregando.hidden = cena !== "carregando";
  pingEl.hidden = cena === "inicio";
}

function voltarAoInicio(aviso: string): void {
  cliente?.fechar();
  cliente = null;
  sala = null;
  entradaMontadaPara = null;
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
      mostrar("lobby");
      return;
    case "lobby":
      lobby.atualizar(msg as Lobby);
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
  pingEl.textContent = `ping ${ms} ms`;
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

// Página recarregada com ?sala=ABCD: volta a assistir sem pedir nada.
if (sala) iniciar();
else mostrar("inicio");
