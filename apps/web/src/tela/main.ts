import { toDataURL } from "qrcode";
import { SERVIDOR, decodificarSnapshot, normalizarSala, type Lobby, type MensagemCliente, type MensagemServidor } from "@b3d/core";
import { criarCliente, type Cliente, type EstadoCliente } from "../comum/cliente";
import { esquecerServidor, lembrarServidorDaUrl, servidorLembrado } from "../comum/config";
import type { Convite } from "../comum/convite";
import { porId } from "../comum/dom";
import "../comum/estilo.css";
import "./tela.css";
import "../comum/marca.css";
import type { CenaJogo } from "./cena";
import { visaoDoMenu, type LugarDoMenu } from "../comum/menu";
import { PainelDoMenu } from "../comum/menu-dom";
import { visaoDaPausa, type QuemPausou } from "../comum/pausa";
import { esquecerChave, guardarChave, lerChave, type Armazenamento } from "./chave";
import { AVISO_DO_TELAO_MS, reacaoAoErro } from "./erros";
import { criarLobby } from "./lobby";
import { enderecoParaCelular } from "./rede";
import { Som } from "./som";
import { PainelTabela } from "./tabela";

const inicio = porId("inicio");
const lobbyEl = porId("lobby");
const jogoEl = porId("jogo");
const carregando = porId("carregando");
const reconectando = porId("reconectando");
const pingEl = porId("ping");
const avisoInicio = porId("aviso-inicio");
const avisoTelao = porId("aviso-telao");
const pausaEl = porId("pausa");
const pausaTitulo = porId("pausa-titulo");
const pausaDetalhe = porId("pausa-detalhe");
const pausaRetomar = porId("pausa-retomar");
const botaoMenu = porId("botao-menu");
const campoCodigo = porId<HTMLInputElement>("codigo");

/** Mostra por alguns segundos o texto de uma recusa do servidor (erro não fatal), sem sair da sala. */
let timerAvisoTelao: ReturnType<typeof setTimeout> | undefined;
function avisarNoTelao(texto: string, grande = false): void {
  avisoTelao.textContent = texto;
  avisoTelao.classList.toggle("grande", grande);
  avisoTelao.hidden = false;
  clearTimeout(timerAvisoTelao);
  timerAvisoTelao = setTimeout(() => (avisoTelao.hidden = true), AVISO_DO_TELAO_MS);
}

// O PC escolhe o líder e expulsa pelo lobby (só o telão mestre vê os botões; o servidor confere a permissão de novo)
const lobby = criarLobby(lobbyEl, {
  lider: (id) => cliente?.enviar({ t: "lider", id }),
  expulsar: (id) => cliente?.enviar({ t: "expulsar", id }),
});

// Som (SPEC 8): só o telão principal toca por padrão. O navegador libera o áudio no primeiro clique, toque ou tecla.
const som = new Som();
const botaoSom = porId("botao-som");
let comprimentoDoCampo = 100;

// Campeonato da sala (F8a): tabela que abre com a tecla T depois da primeira partida terminar
const tabela = new PainelTabela(porId("tabela"));
const botaoTabela = porId("botao-tabela");
function mostrarBotaoTabela(): void {
  botaoTabela.hidden = !tabela.temDados || cenaAtual === "inicio" || cenaAtual === "carregando";
}
let cenaAtual: "inicio" | "carregando" | "lobby" | "jogo" = "inicio";
tabela.aoMudarDados(mostrarBotaoTabela);
botaoTabela.addEventListener("click", () => tabela.alternar());
window.addEventListener("keydown", (e) => {
  if ((e.key === "t" || e.key === "T") && !(e.target instanceof HTMLInputElement)) {
    if (!menu.aberto) tabela.alternar(); // com o menu aberto a tabela não abre por cima dele
  } else if (e.key === "Escape") {
    // Esc fecha primeiro a tabela, se estiver aberta; senão abre e fecha o menu da partida (H7.4a)
    if (tabela.aberto) tabela.fechar();
    else menu.alternar();
  }
});

function desenharBotaoSom(): void {
  if (som.mudo) botaoSom.textContent = "🔇 Som desligado";
  else if (som.travado) botaoSom.textContent = "🔈 Clique para ativar o som";
  else botaoSom.textContent = "🔊 Som ligado";
  botaoSom.classList.toggle("mudo", som.mudo);
  botaoSom.classList.toggle("travado", som.travado);
}
som.aoMudarEstado(desenharBotaoSom);
desenharBotaoSom();
// Se o botão diz "Clique para ativar", esse clique só destrava o áudio (que o listener da janela já fez); não pode também mudar o som.
let travadoNoToque = false;
botaoSom.addEventListener("pointerdown", () => {
  travadoNoToque = som.travado;
});
botaoSom.addEventListener("click", () => {
  if (travadoNoToque) {
    travadoNoToque = false;
    return;
  }
  som.alternarMudo();
});
for (const tipo of ["pointerdown", "keydown"] as const) window.addEventListener(tipo, () => som.destravar(), { passive: true });
window.addEventListener("keydown", (e) => {
  if ((e.key === "m" || e.key === "M") && !(e.target instanceof HTMLInputElement)) som.alternarMudo();
});

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

// --- pausa (H7.3) e menu da partida (H7.4a) ------------------------------------------------------------------------------------
/** Este telão é o mestre (o PC)? Só ele pausa, retoma e tem o menu; os outros telões só veem a tela de pausa. */
let ehMestre = false;
let pausadaAtual = false;
let pausadaPor: QuemPausou | undefined;
/** `lobby.pausaSemPc`: o PC pausou e ficou 30 s sem sinal (visto por um telão que não é o PC). */
let pcSemSinal = false;
/** A partida terminou (tela de fim): o menu do PC passa a ter só "Voltar ao lobby". */
let partidaAcabou = false;
/** O último `lobby`: o menu mostra a lista de jogadores, os removidos e se a sala está trancada a partir dele (H7.4b). */
let ultimoLobby: Lobby | null = null;
/** O convite do menu (H7.4b): o código, o endereço e o QR que `montarEntrada` calcula. `null` até ficar pronto. */
let convite: Convite | null = null;

/** O PC manda uma ação ao servidor (o servidor confere a permissão de novo). */
function pedirComoPC(msg: Extract<MensagemCliente, { t: "trancar" | "expulsar" | "perdoar" | "lobby" }>): void {
  if (ehMestre) cliente?.enviar(msg);
}

/**
 * O menu (H7.4): Esc ou o botão "☰ Menu" abrem e fecham. Só o PC tem, no lobby e na tela do jogo: Pausar/Retomar, Acabar a partida, Trancar a
 * sala, Convidar (código e QR) e a lista de jogadores com Expulsar e Perdoar. Troca o botão "Pausar (P)" da H7.3.
 */
const menu = new PainelDoMenu(
  porId("menu"),
  {
    pausar: (valor) => pedirPausa(valor),
    acabar: () => pedirComoPC({ t: "lobby" }),
    trancar: (valor) => pedirComoPC({ t: "trancar", valor }),
    expulsar: (id) => pedirComoPC({ t: "expulsar", id }),
    perdoar: (id) => pedirComoPC({ t: "perdoar", id }),
  },
  {
    atalhos: { pausar: "P", retomar: "P" },
    textoFechar: "Fechar (Esc)",
    aoMudarAberto: (aberto) => naCena((c) => c.definirTeclas(!aberto)),
  },
);
botaoMenu.addEventListener("click", () => menu.alternar());

/** Mostra (ou esconde) a tela de pausa, o botão "☰ Menu" e o conteúdo do menu, conforme o estado de agora. Só aparecem com a partida na tela. */
function desenharPausa(): void {
  const noJogo = cenaAtual === "jogo";
  const papel = ehMestre ? "pc" : "telao";
  const v = visaoDaPausa(pausadaAtual && noJogo, pausadaPor, papel, pcSemSinal);
  pausaEl.hidden = !v.visivel;
  pausaTitulo.textContent = v.titulo;
  pausaDetalhe.textContent = v.detalhe;
  pausaRetomar.hidden = !v.botaoRetomar;
  const lugar: LugarDoMenu = cenaAtual === "jogo" || cenaAtual === "lobby" ? cenaAtual : "fora";
  const m = visaoDoMenu({
    papel,
    lugar,
    acabou: partidaAcabou,
    pausada: pausadaAtual,
    pausadaPor,
    pcSemSinal,
    trancada: ultimoLobby?.trancada === true,
    jogadores: ultimoLobby?.jogadores ?? [],
    expulsos: ultimoLobby?.expulsos ?? [],
    meuId: null, // o PC não é um jogador da lista
  });
  botaoMenu.hidden = !m.disponivel;
  menu.definirVisao(m); // fecha o menu se este telão deixou de ser o PC ou saiu da sala
}

/** O `lobby` do servidor diz se a partida está pausada. Só quando muda é que a cena e o som são avisados. */
function aplicarPausa(pausada: boolean, por: QuemPausou | undefined, semPc = false): void {
  const mudou = pausada !== pausadaAtual;
  pausadaAtual = pausada;
  pausadaPor = pausada ? por : undefined;
  pcSemSinal = pausada && semPc;
  desenharPausa();
  if (!mudou) return;
  naCena((c) => c.definirPausa(pausada));
  if (pausada) som.parar(); // parado, o ambiente da torcida e o resto param; ao retomar voltam com os snapshots
}

/** O PC pausa ou retoma (o servidor confere a permissão de novo). */
function pedirPausa(valor: boolean): void {
  if (ehMestre) cliente?.enviar({ t: "pausa", valor });
}

pausaRetomar.addEventListener("click", () => pedirPausa(false));
window.addEventListener("keydown", (e) => {
  if ((e.key === "p" || e.key === "P") && !(e.target instanceof HTMLInputElement) && cenaAtual === "jogo") pedirPausa(!pausadaAtual);
});

function mostrar(cena: Cena): void {
  inicio.hidden = cena !== "inicio";
  lobbyEl.hidden = cena !== "lobby";
  jogoEl.hidden = cena !== "jogo";
  carregando.hidden = cena !== "carregando";
  pingEl.hidden = cena === "inicio";
  botaoSom.hidden = cena === "inicio" || cena === "carregando";
  cenaAtual = cena;
  mostrarBotaoTabela();
  desenharPausa();
  if (cena !== "jogo") som.parar();
}

/** O `localStorage` do PC e, de reserva, o `sessionStorage` (cada um pode falhar até no acesso, em aba anônima). */
function armazenamentos(): Armazenamento[] {
  const locais: Armazenamento[] = [];
  try {
    locais.push(localStorage);
  } catch {
    // sem localStorage
  }
  try {
    locais.push(sessionStorage);
  } catch {
    // sem sessionStorage
  }
  return locais;
}

function voltarAoInicio(aviso: string): void {
  if (sala) esquecerChave(sala, armazenamentos()); // sala que acabou ou que não existe: a chave não serve mais
  ehMestre = false;
  partidaAcabou = false;
  ultimoLobby = null;
  convite = null;
  menu.definirConvite(null);
  aplicarPausa(false, undefined);
  tabela.atualizar({ t: "campeonato", partidas: 0, clubes: [], jogadores: [] });
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
  const endereco = `${origem.replace(/^https?:\/\//, "")}/controle.html`;
  lobby.definirEntrada(codigo, endereco, qr);
  convite = { codigo, endereco, qr, link: null }; // o menu mostra o mesmo código, endereço e QR do lobby (e os esconde se a sala estiver trancada)
  menu.definirConvite(convite);
}

function aoMensagem(msg: MensagemServidor): void {
  switch (msg.t) {
    case "bemvindo":
      sala = msg.sala;
      lembrarSala(msg.sala);
      // H7: o telão que criou a sala recebe a chave e o navegador a guarda: recarregar a página volta como mestre (o PC). Chave
      // guardada que o servidor não aceitou (sala nova com o mesmo código, por exemplo) é esquecida.
      if (msg.chave !== undefined) {
        if (!guardarChave(msg.sala, msg.chave, armazenamentos())) {
          avisarNoTelao("Este navegador não guarda a chave do telão: se recarregar a página, este telão só assiste.");
        }
      } else if (msg.mestre !== true && lerChave(msg.sala, armazenamentos()) !== null) {
        esquecerChave(msg.sala, armazenamentos());
      }
      ehMestre = msg.mestre === true;
      lobby.definirMestre(ehMestre);
      desenharPausa();
      lobby.definirPrincipal(msg.principal === true);
      som.definirPrincipal(msg.principal === true);
      void montarEntrada(msg.sala);
      mostrar(emJogo ? "jogo" : "lobby");
      return;
    case "lobby":
      ultimoLobby = msg as Lobby;
      lobby.atualizar(msg as Lobby);
      aplicarPausa(msg.emPartida && msg.pausada, msg.pausadaPor, msg.pausaSemPc === true);
      if (emJogo && !msg.emPartida) {
        emJogo = false;
        partidaAcabou = false;
        naCena((c) => c.parar());
        mostrar("lobby");
      }
      return;
    case "partida":
      emJogo = true;
      partidaAcabou = false; // (a revanche manda `partida` de novo)
      comprimentoDoCampo = msg.campo.comp;
      mostrar("jogo");
      naCena((c) => c.iniciar(msg));
      return;
    case "donos":
      naCena((c) => c.donos(msg.donos)); // quem controla qual jogador mudou (G1)
      return;
    case "mira":
      naCena((c) => c.mira(msg.miras)); // quem recebe o passe de quem está mirando (H1)
      return;
    case "evento":
      som.evento(msg);
      naCena((c) => c.evento(msg));
      return;
    case "fim":
      som.parar();
      partidaAcabou = true;
      desenharPausa(); // o menu do PC passa a ser só "Voltar ao lobby"
      naCena((c) => c.fim(msg));
      return;
    case "campeonato":
      tabela.atualizar(msg);
      return;
    case "principal":
      lobby.definirPrincipal(msg.valor);
      som.definirPrincipal(msg.valor);
      return;
    case "aviso":
      avisarNoTelao(msg.texto, true); // quem virou líder e por quê (H7)
      return;
    case "erro":
      // Só o erro fatal tira o telão da sala; uma recusa de ação (H7) vira aviso e o jogo continua
      if (reacaoAoErro(msg.codigo) === "voltar") voltarAoInicio(msg.msg);
      else avisarNoTelao(msg.msg);
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
    // Com a chave guardada (H7) o telão entra como mestre, também ao recarregar a página ou depois de uma queda de rede
    gerarOla: () => {
      if (!sala) return { t: "ola", acao: "criar" };
      const chave = lerChave(sala, armazenamentos());
      return { t: "ola", acao: "assistir", sala, ...(chave !== null ? { chave } : {}) };
    },
    aoMensagem,
    aoBinario: (dados) => {
      const s = decodificarSnapshot(dados);
      if (s && emJogo) {
        som.ambiente(s.bola.x, comprimentoDoCampo);
        naCena((c) => c.receberSnapshot(s));
      }
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
} else if (new URLSearchParams(location.search).get("poses") === "1") {
  // `tela.html?poses=1`: o jogador feito por código fazendo cada animação (G3)
  inicio.hidden = true;
  porId("vitrine").hidden = false;
  void import("./vitrinePoses").then((m) => m.abrirVitrinePoses(porId("vitrine")));
} else if (new URLSearchParams(location.search).get("boneco") === "1") {
  // `tela.html?boneco=1`: o boneco novo (rig-v1) em cada estado do jogo, com as skins dos clubes (H5)
  inicio.hidden = true;
  porId("vitrine").hidden = false;
  void import("./vitrineBoneco").then((m) => m.abrirVitrineBoneco(porId("vitrine")));
} else if (sala) {
  // Página recarregada com ?sala=ABCD: volta a assistir sem pedir nada.
  iniciar();
} else {
  mostrar("inicio");
}
