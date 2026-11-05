import { PARTIDA, type Dificuldade } from "../constantes";
import { acharTime } from "../dados/index";

// Configuração da partida que o Dono escolhe no lobby (PROTOCOLO 2, mensagem `config`).

export type Modo = "campo" | "arena";
export type NLinha = 3 | 4 | 5;
export type Duracao = 2 | 4 | 6 | 8;

export interface Config {
  casa: string;
  visitante: string;
  modo: Modo;
  n: NLinha;
  duracao: Duracao;
  dificuldade: Dificuldade;
  faltas: boolean;
}

export const CONFIG_PADRAO: Config = {
  casa: "flamengo",
  visitante: "palmeiras",
  modo: "campo",
  n: PARTIDA.nLinhaPadrao,
  duracao: PARTIDA.duracaoPadraoMin,
  dificuldade: "medio",
  faltas: true,
};

const MODOS: readonly string[] = ["campo", "arena"];
const NS: readonly number[] = [3, 4, 5];
const DIFICULDADES: readonly string[] = ["facil", "medio", "dificil"];

/**
 * Valida só os campos que vieram (o Dono muda um de cada vez no celular).
 * Devolve os campos válidos, ou `null` se algum campo presente estiver errado (nada é aplicado nesse caso).
 */
export function lerConfigParcial(o: Record<string, unknown>): Partial<Config> | null {
  const r: Partial<Config> = {};

  if ("casa" in o) {
    if (typeof o["casa"] !== "string" || !acharTime(o["casa"])) return null;
    r.casa = o["casa"];
  }
  if ("visitante" in o) {
    if (typeof o["visitante"] !== "string" || !acharTime(o["visitante"])) return null;
    r.visitante = o["visitante"];
  }
  if ("modo" in o) {
    if (typeof o["modo"] !== "string" || !MODOS.includes(o["modo"])) return null;
    r.modo = o["modo"] as Modo;
  }
  if ("n" in o) {
    if (typeof o["n"] !== "number" || !NS.includes(o["n"])) return null;
    r.n = o["n"] as NLinha;
  }
  if ("duracao" in o) {
    if (typeof o["duracao"] !== "number" || !(PARTIDA.duracoesMin as readonly number[]).includes(o["duracao"])) return null;
    r.duracao = o["duracao"] as Duracao;
  }
  if ("dificuldade" in o) {
    if (typeof o["dificuldade"] !== "string" || !DIFICULDADES.includes(o["dificuldade"])) return null;
    r.dificuldade = o["dificuldade"] as Dificuldade;
  }
  if ("faltas" in o) {
    if (typeof o["faltas"] !== "boolean") return null;
    r.faltas = o["faltas"];
  }
  return r;
}
