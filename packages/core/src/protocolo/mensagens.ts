import { SERVIDOR, CONTROLE } from "../constantes";
import { lerConfigParcial, type Config } from "./config";

// Mensagens JSON entre telão, controle e servidor (PROTOCOLO 2 e 3). Ficam aqui os tipos e a validação,
// usados pelo servidor e pelo site. `partida`, `voce`, `evento` e `fim` entram na F2.

export const VERSAO_PROTOCOLO = 1;

export type Papel = "tela" | "controle";
export type Lado = "casa" | "visitante" | "tanto";

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

/** Erros depois dos quais o aparelho não deve tentar de novo sozinho. */
export const ERROS_FATAIS: readonly CodigoErro[] = [
  "VERSAO",
  "SALA_NAO_EXISTE",
  "SALA_CHEIA",
  "TELAS_CHEIAS",
  "SERVIDOR_CHEIO",
  "APELIDO_INVALIDO",
];

// ---------------------------------------------------------------------------
// Aparelho -> servidor
// ---------------------------------------------------------------------------

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

export type MensagemCliente =
  | Ola
  | { t: "lado"; lado: Lado }
  | { t: "pronto"; valor: boolean }
  | ({ t: "config" } & Partial<Config>)
  | { t: "comecar" }
  | { t: "revanche" }
  | { t: "lobby" }
  | { t: "camera"; modo: "tv" | "aerea" }
  | { t: "ping"; c: number };

// ---------------------------------------------------------------------------
// Servidor -> aparelho
// ---------------------------------------------------------------------------

export interface Bemvindo {
  t: "bemvindo";
  papel: Papel;
  sala: string;
  /** Só para telão. */
  principal?: boolean;
  /** Só para controle. */
  id?: number;
  token?: string;
  dono?: boolean;
}

export interface JogadorLobby {
  id: number;
  apelido: string;
  lado: Lado;
  pronto: boolean;
  dono: boolean;
  conectado: boolean;
}

export interface Lobby {
  t: "lobby";
  sala: string;
  config: Config;
  jogadores: JogadorLobby[];
  /** Quantos telões estão olhando a sala. */
  telas: number;
  /** Há uma partida rolando (ou acabada, esperando Revanche ou Lobby). Telão e controle trocam de tela por isto. */
  emPartida: boolean;
}

export interface Pong {
  t: "pong";
  c: number;
  s: number;
}

/** Avisa o telão quando ele passa a ser (ou deixa de ser) o telão principal. */
export interface Principal {
  t: "principal";
  valor: boolean;
}

export interface Erro {
  t: "erro";
  codigo: CodigoErro;
  msg: string;
}

/** Medidas do campo que o telão desenha. `areaComp` é a profundidade da área (em X) e `areaLarg` a largura (em Z). */
export interface CampoMsg {
  comp: number;
  larg: number;
  golLarg: number;
  golAlt: number;
  areaComp: number;
  areaLarg: number;
  paredes: boolean;
}

export interface VagaElenco {
  slot: number;
  time: 0 | 1;
  numero: number;
  nome: string;
  humano: boolean;
  idControle?: number;
  goleiro: boolean;
}

/** Começo da partida. Reenviada a quem entra no meio e sempre que o elenco muda. */
export interface PartidaMsg {
  t: "partida";
  /** Número da partida na sala. Reenvio com o mesmo `id` é só mudança de elenco (humano entrou, saiu ou assumiu vaga de bot). */
  id: number;
  /** A config que vale de verdade (na F2 o modo é sempre "arena"). */
  config: Config;
  campo: CampoMsg;
  elenco: VagaElenco[];
  /** Cor da camisa de cada time, em hexadecimal: [Casa, Visitante]. */
  cores: [string, string];
  tickHz: number;
  snapHz: number;
  tick0: number;
}

export type SituacaoJogador = "normal" | "lateral" | "escanteio" | "falta" | "caido" | "espera";

/** Estado do próprio jogador, só para o celular dele. */
export interface Voce {
  t: "voce";
  slot: number;
  time: 0 | 1;
  numero: number;
  cor: string;
  comBola: boolean;
  /** 0 a 100. */
  energia: number;
  situacao: SituacaoJogador;
}

export type EventoJogo =
  | { tipo: "apito"; dados: { motivo: "inicio" | "fim" | "falta" | "reinicio" } }
  | { tipo: "saida"; dados: { time: 0 | 1 } }
  | { tipo: "chute"; dados: { slot: number; forca: number } }
  | { tipo: "passe"; dados: { de: number; para?: number; alto: boolean } }
  | { tipo: "roubo"; dados: { slot: number; de: number; jeito: "bote" | "carrinho" } }
  | { tipo: "falta"; dados: { de: number; em: number; x: number; z: number } }
  | { tipo: "lateral" | "escanteio" | "tiroDeMeta"; dados: { time: 0 | 1; x: number; z: number } }
  | { tipo: "defesa"; dados: { slot: number; encaixou: boolean } }
  | { tipo: "trave"; dados: { x: number; y: number; z: number } }
  | { tipo: "gol"; dados: { time: 0 | 1; slot: number; assistencia?: number; contra: boolean; placar: [number, number] } }
  | { tipo: "fim"; dados: { placar: [number, number] } };

export type Evento = { t: "evento"; tick: number } & EventoJogo;

export interface GolFeito {
  slot: number;
  tick: number;
  contra: boolean;
}

export interface Destaque {
  slot: number;
  quantidade: number;
}

export interface Fim {
  t: "fim";
  placar: [number, number];
  gols: GolFeito[];
  destaques: { artilheiro: Destaque | null; assistencias: Destaque | null; desarmes: Destaque | null };
}

export type MensagemServidor = Bemvindo | Lobby | Pong | Principal | Erro | PartidaMsg | Voce | Evento | Fim;

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

/** Apelido limpo (sem espaços nas pontas), ou `null` se for inválido: vazio, longo demais ou com caractere de controle. */
export function validarApelido(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  const tamanho = [...limpo].length;
  if (tamanho < 1 || tamanho > CONTROLE.apelidoMaxCaracteres) return null;
  if (/[\u0000-\u001f\u007f]/.test(limpo)) return null;
  return limpo;
}

/** Código de sala em maiúsculas e sem espaços (a conferência de existir é do servidor). */
export function normalizarSala(valor: string): string {
  return valor.trim().toUpperCase();
}

/** Diz se a mensagem recebida é um `ola` com a forma certa (não confere o conteúdo, só os tipos). */
export function pareceOla(m: unknown): m is Ola {
  if (typeof m !== "object" || m === null) return false;
  const o = m as Record<string, unknown>;
  if (o["t"] !== "ola" || typeof o["versao"] !== "number") return false;
  if ("sala" in o && (typeof o["sala"] !== "string" || o["sala"].length > 16)) return false;
  if ("apelido" in o) {
    if (typeof o["sala"] !== "string" || typeof o["apelido"] !== "string") return false;
    if ("token" in o && (typeof o["token"] !== "string" || o["token"].length > 64)) return false;
    return true;
  }
  return o["acao"] === "criar" || o["acao"] === "assistir";
}

/** Ola de telão ou de controle? Controle é quem manda `apelido`. */
export function papelDoOla(o: Ola): Papel {
  return "apelido" in o ? "controle" : "tela";
}

/**
 * Lê uma mensagem de texto vinda de um aparelho. Devolve `null` se não for JSON, se o tipo não existir
 * ou se algum campo estiver errado. O tamanho máximo é conferido pelo servidor antes (1 KB).
 */
export function lerMensagemCliente(texto: string): MensagemCliente | null {
  if (texto.length > SERVIDOR.maxBytesMensagem) return null;
  let m: unknown;
  try {
    m = JSON.parse(texto);
  } catch {
    return null;
  }
  if (typeof m !== "object" || m === null || Array.isArray(m)) return null;
  const o = m as Record<string, unknown>;

  switch (o["t"]) {
    case "ola":
      return pareceOla(o) ? o : null;
    case "lado":
      return o["lado"] === "casa" || o["lado"] === "visitante" || o["lado"] === "tanto" ? { t: "lado", lado: o["lado"] } : null;
    case "pronto":
      return typeof o["valor"] === "boolean" ? { t: "pronto", valor: o["valor"] } : null;
    case "config": {
      const parcial = lerConfigParcial(o);
      return parcial ? { t: "config", ...parcial } : null;
    }
    case "comecar":
    case "revanche":
    case "lobby":
      return { t: o["t"] };
    case "camera":
      return o["modo"] === "tv" || o["modo"] === "aerea" ? { t: "camera", modo: o["modo"] } : null;
    case "ping":
      return typeof o["c"] === "number" && Number.isFinite(o["c"]) ? { t: "ping", c: o["c"] } : null;
    default:
      return null;
  }
}
