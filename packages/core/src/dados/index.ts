import timesJson from "./times.json";
import nomesBotsJson from "./nomes-bots.json";

// Os JSONs são editados à mão pelo Samuel (cores, padrões, nomes). Estes tipos descrevem o formato (SPEC 9.1).

export type PadraoCamisa =
  | "liso"
  | "listras-verticais"
  | "listras-horizontais"
  | "faixa-diagonal"
  | "faixa-horizontal"
  | "metade-vertical"
  | "mangas-contraste";

/** Nome de uma cor do clube (`primaria`, `secundaria`, `terciaria`) ou um hexadecimal direto. */
export type CorRef = string;

export interface Uniforme {
  padrao: PadraoCamisa;
  cor1: CorRef;
  cor2: CorRef;
}

export interface Time {
  id: string;
  nomeOficial: string;
  nome: string;
  sigla: string;
  cidade: string;
  cores: { primaria: string; secundaria: string; terciaria?: string };
  camisa: Uniforme;
  reserva: Uniforme;
  calcao: CorRef;
  meiao: CorRef;
}

export interface NomesBots {
  primeiros: string[];
  sobrenomes: string[];
}

export const TIMES = timesJson.times as Time[];
export const NOMES_BOTS = nomesBotsJson as NomesBots;

export function acharTime(id: string): Time | undefined {
  return TIMES.find((t) => t.id === id);
}
