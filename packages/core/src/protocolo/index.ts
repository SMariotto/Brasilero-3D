// Mensagens entre telão, controle e servidor (PROTOCOLO.md). A F0 só tem o necessário para o "olá": o resto entra na F1 e na F2.

export const VERSAO_PROTOCOLO = 1;

export type Papel = "tela" | "controle";

export type CodigoErro =
  | "VERSAO"
  | "SALA_NAO_EXISTE"
  | "SALA_CHEIA"
  | "LADO_CHEIO"
  | "TELAS_CHEIAS"
  | "SERVIDOR_CHEIO"
  | "APELIDO_INVALIDO"
  | "SEM_PERMISSAO"
  | "MENSAGEM_INVALIDA"
  | "TOKEN_EXPIRADO";

export interface OlaTela {
  t: "ola";
  versao: number;
  acao: "criar" | "assistir";
  sala?: string;
}

export interface OlaControle {
  t: "ola";
  versao: number;
  sala: string;
  apelido: string;
  token?: string;
}

export type Ola = OlaTela | OlaControle;

export interface Bemvindo {
  t: "bemvindo";
  papel: Papel;
  sala: string;
  principal?: boolean;
  id?: number;
  token?: string;
  dono?: boolean;
}

export interface Erro {
  t: "erro";
  codigo: CodigoErro;
  msg: string;
}

/** Diz se a mensagem recebida é um `ola` com a forma certa (não confere o conteúdo, só os tipos). */
export function pareceOla(m: unknown): m is Ola {
  if (typeof m !== "object" || m === null) return false;
  const o = m as Record<string, unknown>;
  if (o["t"] !== "ola" || typeof o["versao"] !== "number") return false;
  if ("apelido" in o) return typeof o["sala"] === "string" && typeof o["apelido"] === "string";
  return o["acao"] === "criar" || o["acao"] === "assistir";
}

/** Ola de telão ou de controle? Controle é quem manda `apelido`. */
export function papelDoOla(o: Ola): Papel {
  return "apelido" in o ? "controle" : "tela";
}
