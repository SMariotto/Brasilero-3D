import { normalizarSala, validarApelido, type Lobby, type MensagemServidor } from "@b3d/core";
import { criarCliente, type Cliente, type EstadoCliente } from "../comum/cliente";
import { porId } from "../comum/dom";
import "../comum/estilo.css";
import "./controle.css";
import "../comum/marca.css";
import { identificadorDoAparelho, type ArmazenamentoDoAparelho } from "./aparelho";
import { dadosDoNavegador, deveMostrarDicaDeInstalar, dicaJaDispensada, dispensarDica, TEXTO_DICA_IPHONE } from "./dicas";
import { JogoControle } from "./jogo";
import { criarLobbyControle } from "./lobby";
import { TelaAcesa } from "./tela-acesa";

// Este arquivo nunca importa Three.js nem nada de src/tela/ (o build confere o tamanho).

const entrarEl = porId("entrar");
const lobbyEl = porId("lobby");
const jogoEl = porId("jogo");
const reconectando = porId("reconectando");
const toast = porId("toast");
const aviso = porId("aviso-entrar");
const campoCodigo = porId<HTMLInputElement>("codigo");
const campoApelido = porId<HTMLInputElement>("apelido");

let sala = "";
let apelido = "";
let meuId = -1;
let cliente: Cliente | null = null;
let timerToast: ReturnType<typeof setTimeout> | undefined;
let emJogo = false;
let ultimoLobby: Lobby | null = null;
/** Mantém a tela do celular acesa enquanto estamos numa sala (o celular é o controle: ninguém encosta nele sem querer). */
const telaAcesa = new TelaAcesa();

// --- armazenamento (pode falhar em aba privada: sempre com try/catch) -----

const chaveToken = (s: string): string => `b3d.token.${s}`;

function lerTexto(storage: "local" | "sessao", chave: string): string {
  try {
    return (storage === "local" ? localStorage : sessionStorage).getItem(chave) ?? "";
  } catch {
    return "";
  }
}

function guardarTexto(storage: "local" | "sessao", chave: string, valor: string | null): void {
  try {
    const s = storage === "local" ? localStorage : sessionStorage;
    if (valor === null) s.removeItem(chave);
    else s.setItem(chave, valor);
  } catch {
    // sem armazenamento: o jogo funciona, só não lembra
  }
}

/**
 * O identificador deste aparelho (H7.2), sorteado uma vez e guardado no `localStorage`: vai em todo `ola` e é o que deixa a sala bloquear
 * o aparelho se o líder ou o PC expulsarem este jogador. Calculado uma vez por página (vale mesmo que o navegador não guarde nada).
 */
const aparelho = identificadorDoAparelho(
  (() => {
    try {
      return localStorage as ArmazenamentoDoAparelho;
    } catch {
      return null; // o acesso ao localStorage pode até lançar erro (aba anônima)
    }
  })(),
);

// --- telas -----------------------------------------------------------------

function mostrar(cena: "entrar" | "lobby" | "jogo"): void {
  entrarEl.hidden = cena !== "entrar";
  lobbyEl.hidden = cena !== "lobby";
  jogoEl.hidden = cena !== "jogo";
}

function avisar(texto: string): void {
  toast.textContent = texto;
  toast.hidden = false;
  clearTimeout(timerToast);
  timerToast = setTimeout(() => (toast.hidden = true), 3000);
}

function voltarAEntrar(mensagem: string): void {
  telaAcesa.desligar();
  jogoUI.parar();
  emJogo = false;
  cliente?.fechar();
  cliente = null;
  reconectando.hidden = true;
  aviso.textContent = mensagem;
  mostrar("entrar");
}

const lobbyUI = criarLobbyControle(lobbyEl, {
  lado: (lado) => cliente?.enviar({ t: "lado", lado }),
  pronto: (valor) => cliente?.enviar({ t: "pronto", valor }),
  config: (mudanca) => cliente?.enviar({ t: "config", ...mudanca }),
  comecar: () => cliente?.enviar({ t: "comecar" }),
  zerar: () => cliente?.enviar({ t: "zerar" }),
});

const jogoUI = new JogoControle(jogoEl, {
  mandar: (dados) => cliente?.enviarBinario(dados),
  revanche: () => cliente?.enviar({ t: "revanche" }),
  lobby: () => cliente?.enviar({ t: "lobby" }),
});

const souDono = (): boolean => ultimoLobby?.jogadores.find((j) => j.id === meuId)?.dono === true;

// --- rede ------------------------------------------------------------------

function aoMensagem(msg: MensagemServidor): void {
  switch (msg.t) {
    case "bemvindo":
      sala = msg.sala;
      meuId = msg.id ?? -1;
      guardarTexto("sessao", chaveToken(sala), msg.token ?? null);
      history.replaceState(null, "", `${location.pathname}?${paramsDaUrl(sala)}`);
      mostrar(emJogo ? "jogo" : "lobby");
      return;
    case "lobby":
      ultimoLobby = msg;
      lobbyUI.atualizar(msg, meuId);
      if (emJogo && !msg.emPartida) {
        emJogo = false;
        jogoUI.parar();
        mostrar("lobby");
      }
      return;
    case "partida":
      emJogo = true;
      jogoUI.setNome(apelido);
      jogoUI.iniciar(msg, meuId);
      mostrar("jogo");
      return;
    case "campeonato":
      lobbyUI.definirCampeonato(msg.partidas);
      return;
    case "voce":
      jogoUI.voce(msg);
      return;
    case "mira":
      jogoUI.mira(msg.miras); // quem recebe o passe de quem está mirando (H1)
      return;
    case "evento":
      jogoUI.evento(msg);
      return;
    case "fim":
      jogoUI.fim(msg, souDono());
      return;
    case "aviso":
      avisar(msg.texto); // quem virou líder e por quê (H7)
      return;
    case "erro":
      tratarErro(msg.codigo, msg.msg);
      return;
    default:
      return;
  }
}

/** Mantém `?srv=` (se houver) e põe `?sala=` na URL, para recarregar a página voltar para a mesma sala. */
function paramsDaUrl(codigo: string): string {
  const p = new URLSearchParams(location.search);
  p.set("sala", codigo);
  return p.toString();
}

function tratarErro(codigo: string, texto: string): void {
  switch (codigo) {
    case "EXPULSO":
      // O líder ou o PC tiraram este aparelho da sala (H7.2): esquece a vaga e volta à entrada, sem reconectar nem entrar sozinho
      guardarTexto("sessao", chaveToken(sala), null);
      voltarAEntrar(texto);
      return;
    case "TOKEN_EXPIRADO":
      // A vaga venceu: esquece o token e entra de novo como jogador novo, na mesma conexão.
      guardarTexto("sessao", chaveToken(sala), null);
      cliente?.reolar();
      return;
    case "SALA_NAO_EXISTE":
      guardarTexto("sessao", chaveToken(sala), null);
      voltarAEntrar(texto);
      return;
    case "VERSAO":
    case "SALA_CHEIA":
    case "SERVIDOR_CHEIO":
    case "APELIDO_INVALIDO":
      voltarAEntrar(texto);
      return;
    default:
      avisar(texto); // LADO_CHEIO, SEM_PERMISSAO, MENSAGEM_INVALIDA
  }
}

function aoEstado(estado: EstadoCliente): void {
  reconectando.hidden = estado !== "reconectando";
}

function aoFechar(codigo: number): void {
  if (codigo === 4002) voltarAEntrar("Você entrou nessa sala por outro aparelho.");
  else if (codigo === 4004) voltarAEntrar("A sala foi encerrada.");
  else if (codigo === 4005) {
    // Expulso (H7.2). O `erro` EXPULSO costuma chegar antes e já fez isto; o fechamento 4005 garante o mesmo se só ele chegar.
    guardarTexto("sessao", chaveToken(sala), null);
    voltarAEntrar("Você foi removido da sala.");
  }
}

function entrar(): void {
  aviso.textContent = "";
  telaAcesa.ligar();
  cliente = criarCliente({
    gerarOla: () => {
      const token = lerTexto("sessao", chaveToken(sala));
      return { t: "ola", sala, apelido, aparelho, ...(token ? { token } : {}) };
    },
    aoMensagem,
    aoEstado,
    aoPing: (ms) => {
      lobbyUI.definirPing(ms);
      jogoUI.definirPing(ms);
    },
    aoFechar,
  });
}

// --- formulário --------------------------------------------------------------

campoCodigo.addEventListener("input", () => {
  campoCodigo.value = campoCodigo.value.toUpperCase().replace(/[^A-Z]/g, "");
});

porId("form-entrar").addEventListener("submit", (e) => {
  e.preventDefault();
  const codigo = normalizarSala(campoCodigo.value);
  const limpo = validarApelido(campoApelido.value);
  if (codigo.length !== 4) {
    aviso.textContent = "O código da sala tem 4 letras.";
    return;
  }
  if (limpo === null) {
    aviso.textContent = "Escolha um apelido de 1 a 12 letras.";
    return;
  }
  sala = codigo;
  apelido = limpo;
  guardarTexto("local", "b3d.apelido", limpo);
  cliente?.fechar();
  entrar();
});

// Chegou pelo QR (?sala=ABCD) ou recarregou a página: preenche o que dá e, se ainda tem a vaga, volta sozinho.
const salaDaUrl = normalizarSala(new URLSearchParams(location.search).get("sala") ?? "");
campoCodigo.value = salaDaUrl;
campoApelido.value = lerTexto("local", "b3d.apelido");
mostrar("entrar");

if (salaDaUrl.length === 4 && validarApelido(campoApelido.value) !== null && lerTexto("sessao", chaveToken(salaDaUrl))) {
  sala = salaDaUrl;
  apelido = validarApelido(campoApelido.value) ?? "";
  entrar();
} else if (salaDaUrl.length === 4) {
  campoApelido.focus();
}

// O navegador só aceita o pedido de "tela acesa" depois de um toque em alguns aparelhos: no primeiro toque, pede de novo.
window.addEventListener("pointerdown", () => {
  if (cliente) telaAcesa.ligar();
}, { passive: true });

// iPhone no Safari: sem "Adicionar à Tela de Início" não existe tela cheia.
const dicaIos = porId("dica-ios");
if (deveMostrarDicaDeInstalar(dadosDoNavegador(), dicaJaDispensada())) {
  porId("dica-ios-texto").textContent = TEXTO_DICA_IPHONE;
  dicaIos.hidden = false;
}
porId("dica-ios-ok").addEventListener("click", () => {
  dispensarDica();
  dicaIos.hidden = true;
});
