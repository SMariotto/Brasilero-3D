// O que o menu da partida mostra e para quem (H7.4a). Lógica pura, sem DOM, com teste. Vale para o telão (o PC) e para o celular do líder, que
// desenham o mesmo conteúdo; fica em `comum/` porque o controle nunca importa nada de `src/tela/`. A permissão de verdade é do servidor: aqui só
// se decide o que aparece (um item escondido por engano não dá poder a ninguém).

import { podeRetomar, visaoDaPausa, type PapelNaPausa, type QuemPausou } from "./pausa";

/** O que cada item faz: `pausar` e `retomar` mandam `pausa`; `acabar` manda `lobby` (volta ao lobby). */
export type IdDoItem = "pausar" | "retomar" | "acabar";

export interface ItemDoMenu {
  id: IdDoItem;
  texto: string;
  /** Destrói alguma coisa (acaba a partida): pede o segundo toque (ou clique), como o "Expulsar" e o "Zerar campeonato". */
  confirmar: boolean;
  /** O texto do botão enquanto espera o segundo toque. Vazio se `confirmar` é falso. */
  textoConfirmar: string;
}

export interface EstadoDoMenu {
  /** Quem está olhando: só `pc` e `lider` têm menu nesta fase. */
  papel: PapelNaPausa;
  /** A tela do jogo está aberta (partida rolando, pausada ou na tela de fim). */
  noJogo: boolean;
  /** A partida acabou (tela de fim). */
  acabou: boolean;
  pausada: boolean;
  pausadaPor?: QuemPausou;
  /** `lobby.pausaSemPc`: o PC pausou e ficou 30 s sem sinal. */
  pcSemSinal: boolean;
}

export interface VisaoDoMenu {
  /** O botão que abre o menu aparece? */
  disponivel: boolean;
  itens: ItemDoMenu[];
  /** Uma frase de contexto sob os itens (por que não há "Retomar"), ou vazio. */
  nota: string;
}

const SEM_MENU: VisaoDoMenu = { disponivel: false, itens: [], nota: "" };

/**
 * O menu do PC fica na tela do jogo inteira, inclusive na tela de fim (onde ainda é o jeito de voltar ao lobby; a H7.6 põe Revanche e Lobby
 * ali). O do líder some na tela de fim: o celular dele já mostra Revanche e Lobby.
 */
export function menuDisponivel(papel: PapelNaPausa, noJogo: boolean, acabou: boolean): boolean {
  if (!noJogo) return false;
  return papel === "pc" || (papel === "lider" && !acabou);
}

/** Os itens do menu, na ordem em que aparecem, para quem está olhando e o estado de agora. */
export function visaoDoMenu(e: EstadoDoMenu): VisaoDoMenu {
  if (!menuDisponivel(e.papel, e.noJogo, e.acabou)) return SEM_MENU;
  const itens: ItemDoMenu[] = [];
  let nota = "";
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
  return { disponivel: true, itens, nota };
}
