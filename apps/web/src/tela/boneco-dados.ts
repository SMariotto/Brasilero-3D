import { PARTIDA, acharTime, uniformeTitular, type UniformeResolvido, type VagaElenco } from "@b3d/core";

// Dados do boneco novo (rig-v1, H5): o que existe nos arquivos de `public/boneco/` e como cada jogador escolhe rosto, cabelo e skin.
// Lógica pura, sem Three.js, para poder testar.

// --- rosto: atlas de 25 colunas (tipo * 5 + quadro) por 5 linhas (expressão) -----------------------------------------------------

export const TIPOS_DE_ROSTO = 5;
export const QUADROS_POR_EXPRESSAO = 5;
export const COLUNAS_DO_ATLAS = TIPOS_DE_ROSTO * QUADROS_POR_EXPRESSAO;
export const LINHAS_DO_ATLAS = 5;
export const FPS_DO_ROSTO = 10;

/** As linhas do atlas. A linha 0, quadro 0, é o rosto neutro (olhos abertos). */
export const EXPRESSAO = { piscarUmOlho: 0, piscarOsDois: 1, forca: 2, dor: 3, felicidade: 4 } as const;

/** O deslocamento da textura do atlas para mostrar o quadro `quadro` da expressão `anim` do rosto `tipo`. */
export function offsetDoRosto(tipo: number, anim: number, quadro: number): [number, number] {
  return [(tipo * QUADROS_POR_EXPRESSAO + quadro) / COLUNAS_DO_ATLAS, anim / LINHAS_DO_ATLAS];
}

// --- cabelo: 7 cortes x 5 cores = 35 arquivos --------------------------------------------------------------------------------

export const CORTES_DE_CABELO = ["01-liso-repartido", "02-jogador-degrade", "03-raspado", "04-cacheado-curto", "05-crespo-curto", "06-espetado-gel", "07-mullet"] as const;
export const CORES_DE_CABELO = ["castanho", "loiro-natural", "loiro-pintado", "preto", "ruivo"] as const;

export function chaveDoCabelo(corte: number, cor: number): string {
  return `${CORTES_DE_CABELO[corte]}_${CORES_DE_CABELO[cor]}`;
}

/** Todas as chaves de cabelo que existem em `public/boneco/cabelos/<chave>.glb`. */
export const TODAS_AS_CHAVES_DE_CABELO: string[] = CORTES_DE_CABELO.flatMap((_, c) => CORES_DE_CABELO.map((__, k) => chaveDoCabelo(c, k)));

export interface Aparencia {
  tipoRosto: number;
  corte: number;
  corCabelo: number;
}

/**
 * Rosto e cabelo de cada jogador. O servidor não manda isso, então o telão escolhe pelo `slot`, sempre igual (nada de sorteio):
 * os passos (3 e 2) são primos com 7 e com 5, então 12 jogadores nunca repetem o mesmo corte com a mesma cor.
 */
export function aparenciaDoSlot(slot: number): Aparencia {
  const s = Math.max(0, Math.floor(slot));
  return { tipoRosto: (s * 3 + 2) % TIPOS_DE_ROSTO, corte: (s * 3 + 1) % CORTES_DE_CABELO.length, corCabelo: (s * 2 + 3) % CORES_DE_CABELO.length };
}

// --- skin -------------------------------------------------------------------------------------------------------------------

/** Os clubes que têm skin PNG em `public/boneco/skins/<id>.png` (feitas pelo Samuel). Os outros usam a skin gerada por código. */
export const SKINS_PRONTAS: ReadonlySet<string> = new Set(["vasco", "corinthians", "saopaulo", "pedesapo"]);

const IGUAIS = (a: UniformeResolvido, b: UniformeResolvido): boolean => a.padrao === b.padrao && a.cor1 === b.cor1 && a.cor2 === b.cor2 && a.calcao === b.calcao && a.meiao === b.meiao;

/** O uniforme em campo é a camisa titular do clube? (A skin PNG é a camisa titular; na reserva ou no branco/preto vale a skin gerada.) */
export function ehTitular(timeId: string, uniforme: UniformeResolvido): boolean {
  const t = acharTime(timeId);
  return t !== undefined && IGUAIS(uniforme, uniformeTitular(t));
}

export interface KitDeSkin {
  /** `<time><g|l>`: um kit por time e por função (goleiro ou linha). */
  chave: string;
  uniforme: UniformeResolvido;
  /** O id do clube cuja skin PNG vale neste kit, ou `null` se a skin é gerada por código. */
  png: string | null;
}

/** O kit (uniforme + qual skin) de um jogador. O goleiro usa a cor fixa de contraste da SPEC 9.3 e nunca a skin PNG do clube. */
export function kitDoJogador(v: Pick<VagaElenco, "time" | "goleiro">, uniformes: readonly [UniformeResolvido, UniformeResolvido], timeIds: readonly [string, string]): KitDeSkin {
  const chave = `${v.time}${v.goleiro ? "g" : "l"}`;
  if (v.goleiro) {
    const cor = v.time === 0 ? PARTIDA.corGoleiroCasa : PARTIDA.corGoleiroVisitante;
    return { chave, uniforme: { padrao: "liso", cor1: cor, cor2: cor, calcao: "#111111", meiao: cor }, png: null };
  }
  const uniforme = uniformes[v.time];
  const id = timeIds[v.time];
  return { chave, uniforme, png: SKINS_PRONTAS.has(id) && ehTitular(id, uniforme) ? id : null };
}

// --- onde ficam os arquivos --------------------------------------------------------------------------------------------------

export const NOME_DO_CORPO = "model-brasilero-3d-rig-1malha-v2.glb"; // 21 clipes; o `-1malha.glb` (15 clipes) fica ao lado, sem uso

export function caminhosDoBoneco(base = "/"): { corpo: string; atlas: string; skinModelo: string; skin: (id: string) => string; cabelo: (chave: string) => string } {
  const raiz = `${base}boneco/`;
  return {
    corpo: `${raiz}${NOME_DO_CORPO}`,
    atlas: `${raiz}rostos_atlas.png`,
    skinModelo: `${raiz}skin-modelo.png`,
    skin: (id) => `${raiz}skins/${id}.png`,
    cabelo: (chave) => `${raiz}cabelos/${chave}.glb`,
  };
}
