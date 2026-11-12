// O que o menu mostra e para quem (H7.4a e H7.4b). Lógica pura, sem DOM, com teste. Vale para o telão (o PC) e para o celular, que desenham o
// mesmo conteúdo; fica em `comum/` porque o controle nunca importa nada de `src/tela/`. A permissão de verdade é do servidor: aqui só se decide o
// que aparece (um item escondido por engano não dá poder a ninguém, e um item mostrado por engano só recebe `SEM_PERMISSAO`).

import type { ExpulsoLobby, JogadorLobby } from "@b3d/core";
import { podeRetomar, visaoDaPausa, type PapelNaPausa, type QuemPausou } from "./pausa";

/** O que cada item faz: `pausar` e `retomar` mandam `pausa`; `acabar` manda `lobby`; `trancar` e `destrancar` mandam `trancar`. */
export type IdDoItem = "pausar" | "retomar" | "acabar" | "trancar" | "destrancar";

/** Onde a pessoa está: fora da sala (entrada, conectando), no lobby ou na tela do jogo (rolando, pausado ou na tela de fim). */
export type LugarDoMenu = "fora" | "lobby" | "jogo";

export interface ItemDoMenu {
  id: IdDoItem;
  texto: string;
  /** Destrói alguma coisa (acaba a partida): pede o segundo toque (ou clique), como o "Expulsar" e o "Zerar campeonato". */
  confirmar: boolean;
  /** O texto do botão enquanto espera o segundo toque. Vazio se `confirmar` é falso. */
  textoConfirmar: string;
}

export interface EstadoDoMenu {
  /** Quem está olhando: o PC e o líder gerenciam; o jogador comum só convida; o telão que só assiste não tem menu. */
  papel: PapelNaPausa;
  lugar: LugarDoMenu;
  /** A partida acabou (tela de fim). */
  acabou: boolean;
  pausada: boolean;
  pausadaPor?: QuemPausou;
  /** `lobby.pausaSemPc`: o PC pausou e ficou 30 s sem sinal. */
  pcSemSinal: boolean;
  /** `lobby.trancada`. */
  trancada: boolean;
  /** `lobby.jogadores` e `lobby.expulsos`, como vieram. */
  jogadores: readonly JogadorLobby[];
  expulsos: readonly ExpulsoLobby[];
  /** O id deste celular na sala, para não oferecer "Expulsar" contra si mesmo; o PC não é jogador e passa `null`. */
  meuId: number | null;
}

export interface LinhaDeJogador {
  id: number;
  apelido: string;
  lider: boolean;
  semSinal: boolean;
  /** É a própria pessoa (só no celular). */
  voce: boolean;
  /** O botão "Expulsar" aparece. O servidor não deixa o líder se expulsar, então a própria linha nunca tem o botão. */
  podeExpulsar: boolean;
}

export interface LinhaDeRemovido {
  id: number;
  apelido: string;
  /** O botão "Perdoar" aparece. */
  podePerdoar: boolean;
}

export interface VisaoDoMenu {
  /** O botão que abre o menu aparece? */
  disponivel: boolean;
  titulo: string;
  itens: ItemDoMenu[];
  /** Uma frase de contexto sob os itens (por que não há "Retomar"), ou vazio. */
  nota: string;
  /** O bloco "Convidar": `livre` mostra o código e o QR ou o link; `trancado` mostra só o código e explica. `null` sem menu. */
  convite: "livre" | "trancado" | null;
  /** A lista de jogadores com "Expulsar" (só para quem gerencia: o PC e o líder). */
  jogadores: LinhaDeJogador[];
  /** Os removidos, cada um com "Perdoar" (só para quem gerencia). */
  removidos: LinhaDeRemovido[];
}

const SEM_MENU: VisaoDoMenu = { disponivel: false, titulo: "", itens: [], nota: "", convite: null, jogadores: [], removidos: [] };

/** O PC e o líder gerenciam a sala (pausar, acabar, trancar, expulsar, perdoar). */
export function podeGerir(papel: PapelNaPausa): boolean {
  return papel === "pc" || papel === "lider";
}

/**
 * Quem tem o botão do menu, e onde.
 *  - O PC tem no lobby e na tela do jogo inteira, inclusive na tela de fim (onde ainda é o jeito de voltar ao lobby; a H7.6 põe Revanche e
 *    Lobby ali).
 *  - O celular (líder ou não) tem no lobby e no jogo rolando; na tela de fim some, porque ela já tem Revanche e Lobby.
 *  - O telão que só assiste não tem menu.
 */
export function menuDisponivel(papel: PapelNaPausa, lugar: LugarDoMenu, acabou: boolean): boolean {
  if (lugar === "fora" || papel === "telao") return false;
  if (papel === "pc") return true;
  return lugar === "lobby" || !acabou;
}

/** O que o menu mostra, na ordem em que aparece, para quem está olhando e o estado de agora. */
export function visaoDoMenu(e: EstadoDoMenu): VisaoDoMenu {
  if (!menuDisponivel(e.papel, e.lugar, e.acabou)) return SEM_MENU;
  const gerencia = podeGerir(e.papel);
  const itens: ItemDoMenu[] = [];
  let nota = "";

  // Pausar, retomar e acabar a partida são de quem gerencia (o jogador comum só convida)
  if (e.lugar === "jogo" && gerencia) {
    if (!e.acabou) {
      if (!e.pausada) {
        itens.push({ id: "pausar", texto: "Pausar o jogo", confirmar: false, textoConfirmar: "" });
      } else if (podeRetomar(e.papel, e.pausadaPor, e.pcSemSinal)) {
        itens.push({ id: "retomar", texto: "Retomar o jogo", confirmar: false, textoConfirmar: "" });
      } else {
        nota = visaoDaPausa(true, e.pausadaPor, e.papel, e.pcSemSinal).detalhe;
      }
    }
    itens.push(
      e.acabou
        ? { id: "acabar", texto: "Voltar ao lobby", confirmar: false, textoConfirmar: "" }
        : { id: "acabar", texto: "Acabar a partida", confirmar: true, textoConfirmar: "Confirmar: acabar a partida" },
    );
  }
  if (gerencia) {
    itens.push(
      e.trancada
        ? { id: "destrancar", texto: "Destrancar a sala", confirmar: false, textoConfirmar: "" }
        : { id: "trancar", texto: "Trancar a sala", confirmar: false, textoConfirmar: "" },
    );
  }

  const jogadores: LinhaDeJogador[] = gerencia
    ? e.jogadores.map((j) => ({
        id: j.id,
        apelido: j.apelido,
        lider: j.dono,
        semSinal: !j.conectado,
        voce: j.id === e.meuId,
        podeExpulsar: j.id !== e.meuId,
      }))
    : [];
  const removidos: LinhaDeRemovido[] = gerencia ? e.expulsos.map((x) => ({ id: x.id, apelido: x.apelido, podePerdoar: true })) : [];

  return {
    disponivel: true,
    titulo: e.lugar === "lobby" ? "Menu da sala" : "Menu da partida",
    itens,
    nota,
    convite: e.trancada ? "trancado" : "livre",
    jogadores,
    removidos,
  };
}
