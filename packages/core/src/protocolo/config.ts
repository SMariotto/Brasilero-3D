import { PARTIDA, type Dificuldade } from "../constantes";
import { TIMES, acharTime } from "../dados/index";
import type { Rng } from "../util/rng";

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

/** Valor de `casa` ou `visitante` que pede um clube sorteado quando a partida começa (F5). */
export const CLUBE_ALEATORIO = "aleatorio";

const clubeValido = (v: unknown): v is string => typeof v === "string" && (v === CLUBE_ALEATORIO || acharTime(v) !== undefined);

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
    if (!clubeValido(o["casa"])) return null;
    r.casa = o["casa"];
  }
  if ("visitante" in o) {
    if (!clubeValido(o["visitante"])) return null;
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

/**
 * Troca os "aleatorio" por clubes de verdade, sempre dois clubes diferentes (e respeitando o lado que já foi escolhido).
 * Sem nenhum "aleatorio" devolve a config como veio.
 */
export function sortearClubes(config: Config, rng: Rng): Config {
  if (config.casa !== CLUBE_ALEATORIO && config.visitante !== CLUBE_ALEATORIO) return config;
  const ids = TIMES.map((t) => t.id);
  const escolher = (proibido: string | null): string => {
    const livres = ids.filter((id) => id !== proibido);
    return rng.escolher(livres);
  };
  const casa = config.casa === CLUBE_ALEATORIO ? escolher(config.visitante === CLUBE_ALEATORIO ? null : config.visitante) : config.casa;
  const visitante = config.visitante === CLUBE_ALEATORIO ? escolher(casa) : config.visitante;
  return { ...config, casa, visitante };
}
