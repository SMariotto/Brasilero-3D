import type { Corpo } from "../fisica/jogador";
import type { Comando } from "../protocolo/binario";
import type { VagaElenco } from "../protocolo/mensagens";

export type VagaPartida = VagaElenco;

export interface BotaoEstado {
  apertado: boolean;
  /** O jogador tinha a bola quando apertou? Só assim a ação ao soltar vale (PROTOCOLO 4). */
  comBola: boolean;
  desde: number;
  /** PASSE segurado sem a bola: o carrinho (segurar por `DEFESA.carrinho.segurarPasseS`) já foi tentado neste aperto (G1). */
  longoFeito?: boolean;
}

/** Deslize do carrinho (SPEC 6.6): começa a 9 m/s e freia até parar em 1 s. */
export interface Carrinho {
  desde: number;
  ate: number;
  dx: number;
  dz: number;
  /** Já encostou na bola? Depois disso encostar em adversário não é falta. */
  tocouBola: boolean;
}

/** Avanço curto do bote em direção à bola (SPEC 6.6). */
export interface Bote {
  ate: number;
  dx: number;
  dz: number;
}

/** Mergulho do goleiro: anda de lado até o ponto onde a bola vai passar. */
export interface Mergulho {
  ate: number;
  z0: number;
  zAlvo: number;
  desde: number;
}

/** Cobrador deslizando até a bola num reinício. */
export interface Desliza {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  desde: number;
  duracao: number;
}

/** Estado do "cérebro" de um bot (jogador de linha ou goleiro). */
export interface CerebroEstado {
  proximaDecisao: number;
  alvoX: number;
  alvoZ: number;
  correr: boolean;
  /** Posição base da formação (já deslocada pela bola) que o bot ocupa. */
  baseX: number;
  baseZ: number;
  papel: "pressionar" | "fechar" | "apoio";
  /** Goleiro: quando percebeu que a bola vai entrar no gol (para o atraso de reação). */
  detectadoEm: number | null;
  /** Quando passou a segurar a bola (goleiro e cobrador). */
  segurandoDesde: number | null;
}

export interface JogadorPartida {
  vaga: VagaPartida;
  corpo: Corpo;
  cmd: Comando;
  chute: BotaoEstado;
  passe: BotaoEstado;
  /** `null` até o primeiro pacote: assim uma ação velha que chega na reconexão não dispara. */
  acaoSeq: number | null;
  /** Não pode dominar a bola até esta hora (depois de chutar, passar ou levar a bola no corpo). */
  bloqueioAte: number;
  proximoToque: number;
  animAte: number;
  anim: number;
  /** Caído (levou falta, ou ficou no chão depois do carrinho) até esta hora. */
  caidoAte: number;
  carrinho: Carrinho | null;
  carrinhoProntoEm: number;
  /** Recepção da bola (H1): até quando a recepção em andamento puxa a bola, e a partir de quando pode começar outra. */
  recepcaoAte: number;
  recepcaoProntaEm: number;
  bote: Bote | null;
  boteProntoEm: number;
  mergulho: Mergulho | null;
  desliza: Desliza | null;
  /** Humano sem conexão: um bot joga por ele enquanto isso (SPEC 4.1). */
  ausente: boolean;
  cerebro: CerebroEstado;
}

export type TipoReinicio = "saida" | "lateral" | "escanteio" | "tiroDeMeta" | "falta";

/** Um reinício em andamento (bola parada, relógio parado). */
export interface Reinicio {
  tipo: TipoReinicio;
  /** Time que cobra. */
  time: 0 | 1;
  x: number;
  z: number;
  /** Slot de quem cobra (`null` na saída de bola, onde quem chegar primeiro cobra). */
  cobrador: number | null;
  /** O cobrador já chegou e está com a bola. */
  pronto: boolean;
  desde: number;
  prontoEm: number | null;
}

/** Quem controla o jogador: um humano conectado ou o bot (vaga de bot, ou humano ausente). */
export const controladoPorBot = (j: JogadorPartida): boolean => !j.vaga.humano || j.ausente;
