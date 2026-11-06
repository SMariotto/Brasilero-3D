// Mensagens binárias (PROTOCOLO 4 e 5): o comando do controle (7 bytes) e o snapshot do jogo (12 + 12 + 10 por jogador).
// Inteiros em little-endian. Os campos já decodificados usam unidades normais (metros, radianos, 0 a 1).

// ---------------------------------------------------------------------------
// Comando do controle
// ---------------------------------------------------------------------------

export const TIPO_COMANDO = 1;
export const TIPO_SNAPSHOT = 2;

/** Bits do campo `seguros`. */
export const BOTAO = { chute: 1, passe: 2, correr: 4 } as const;

/** Valores do campo `acao`: a última ação concluída. */
export const ACAO = { nenhuma: 0, chute: 1, passeToque: 2, passeSegurado: 3 } as const;

export interface Comando {
  /** Direção do joystick, 0 a 255 = 0 a 360° (0 = direita da tela, anti-horário). */
  ang: number;
  /** Força do joystick, 0 a 255 (o controle manda só múltiplos de 17: 16 níveis). */
  mag: number;
  seguros: number;
  acao: number;
  /** Chute: carga medida no celular (0 a 255). Passe segurado: tempo segurado até 1 s (0 a 255). */
  forca: number;
  /** Soma 1 a cada ação nova (volta a 0 depois de 255). */
  acaoSeq: number;
}

export const COMANDO_BYTES = 7;

export const comandoParado = (): Comando => ({ ang: 0, mag: 0, seguros: 0, acao: 0, forca: 0, acaoSeq: 0 });

/** Ângulo em radianos (0 = direita, anti-horário) para o byte do protocolo. */
export function anguloParaByte(rad: number): number {
  const volta = Math.PI * 2;
  const n = ((rad % volta) + volta) % volta;
  return Math.round((n / volta) * 256) & 255;
}

/** Byte do protocolo para radianos em [0, 2π). */
export const byteParaAngulo = (b: number): number => (b / 256) * Math.PI * 2;

/** Força do joystick (0 a 1) para o byte, em 16 níveis (múltiplos de 17). */
export const magParaByte = (m: number): number => Math.round(Math.max(0, Math.min(1, m)) * 15) * 17;

export function codificarComando(c: Comando): Uint8Array {
  const b = new Uint8Array(COMANDO_BYTES);
  b[0] = TIPO_COMANDO;
  b[1] = c.ang & 255;
  b[2] = c.mag & 255;
  b[3] = c.seguros & 255;
  b[4] = c.acao & 255;
  b[5] = c.forca & 255;
  b[6] = c.acaoSeq & 255;
  return b;
}

/** Lê um comando; `null` se o tamanho ou o tipo estiverem errados ou se a ação não existir. */
export function decodificarComando(dados: Uint8Array): Comando | null {
  if (dados.length !== COMANDO_BYTES || dados[0] !== TIPO_COMANDO) return null;
  const acao = dados[4]!;
  if (acao > ACAO.passeSegurado) return null;
  return { ang: dados[1]!, mag: dados[2]!, seguros: dados[3]! & 7, acao, forca: dados[5]!, acaoSeq: dados[6]! };
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

/** Fase do jogo no snapshot. */
export const FASE = { lobby: 0, preJogo: 1, jogo: 2, gol: 3, reinicio: 4, fim: 5 } as const;
export type Fase = (typeof FASE)[keyof typeof FASE];

/** Animação do jogador no snapshot. */
export const ANIM = {
  parado: 0,
  corrida: 1,
  arrancada: 2,
  chute: 3,
  passe: 4,
  carrinho: 5,
  queda: 6,
  comemoracao: 7,
  goleiroParado: 8,
  goleiroMergulhoEsq: 9,
  goleiroMergulhoDir: 10,
  cabeceio: 11,
  goleiroComBola: 12,
  cobranca: 13,
  /** Recepção da bola (H1): o jogador amortece e puxa a bola para o pé. */
  recepcao: 14,
} as const;

export const SEM_DOMINANTE = 255;

export interface BolaSnap {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface JogadorSnap {
  slot: number;
  x: number;
  z: number;
  /** Direção do corpo em radianos, [0, 2π): dirX = cos, dirZ = sin. */
  dir: number;
  /** Velocidade em m/s (resolução de 0,05). */
  vel: number;
  anim: number;
  caido: boolean;
  arrancando: boolean;
  comBola: boolean;
  carregandoChute: boolean;
  humano: boolean;
  /** Carga do chute, 0 a 1. */
  carga: number;
}

export interface Snapshot {
  tick: number;
  /** Relógio restante em décimos de segundo. */
  relogio: number;
  golsCasa: number;
  golsVisitante: number;
  fase: number;
  /** Slot de quem domina a bola, ou `SEM_DOMINANTE`. */
  dominante: number;
  bola: BolaSnap;
  jogadores: JogadorSnap[];
}

export const SNAP_CABECALHO = 12;
export const SNAP_BOLA = 12;
export const SNAP_JOGADOR = 10;

export const tamanhoSnapshot = (jogadores: number): number => SNAP_CABECALHO + SNAP_BOLA + SNAP_JOGADOR * jogadores;

const cm = (m: number): number => Math.max(-32768, Math.min(32767, Math.round(m * 100)));

export function codificarSnapshot(s: Snapshot): Uint8Array {
  const buf = new Uint8Array(tamanhoSnapshot(s.jogadores.length));
  const v = new DataView(buf.buffer);

  v.setUint8(0, TIPO_SNAPSHOT);
  v.setUint8(1, s.jogadores.length);
  v.setUint32(2, s.tick >>> 0, true);
  v.setUint16(6, Math.max(0, Math.min(65535, Math.round(s.relogio))), true);
  v.setUint8(8, Math.min(255, s.golsCasa));
  v.setUint8(9, Math.min(255, s.golsVisitante));
  v.setUint8(10, s.fase);
  v.setUint8(11, s.dominante);

  let o = SNAP_CABECALHO;
  v.setInt16(o, cm(s.bola.x), true);
  v.setInt16(o + 2, cm(s.bola.y), true);
  v.setInt16(o + 4, cm(s.bola.z), true);
  v.setInt16(o + 6, cm(s.bola.vx), true);
  v.setInt16(o + 8, cm(s.bola.vy), true);
  v.setInt16(o + 10, cm(s.bola.vz), true);

  o += SNAP_BOLA;
  for (const j of s.jogadores) {
    v.setUint8(o, j.slot);
    v.setInt16(o + 1, cm(j.x), true);
    v.setInt16(o + 3, cm(j.z), true);
    v.setUint8(o + 5, anguloParaByte(j.dir));
    v.setUint8(o + 6, Math.max(0, Math.min(255, Math.round(j.vel / 0.05))));
    v.setUint8(o + 7, j.anim);
    v.setUint8(
      o + 8,
      (j.caido ? 1 : 0) | (j.arrancando ? 2 : 0) | (j.comBola ? 4 : 0) | (j.carregandoChute ? 8 : 0) | (j.humano ? 16 : 0),
    );
    v.setUint8(o + 9, Math.max(0, Math.min(255, Math.round(j.carga * 255))));
    o += SNAP_JOGADOR;
  }
  return buf;
}

/** Lê um snapshot; `null` se o tamanho não bate com a quantidade de jogadores do cabeçalho ou o tipo está errado. */
export function decodificarSnapshot(dados: Uint8Array): Snapshot | null {
  if (dados.length < SNAP_CABECALHO + SNAP_BOLA || dados[0] !== TIPO_SNAPSHOT) return null;
  const v = new DataView(dados.buffer, dados.byteOffset, dados.byteLength);
  const n = v.getUint8(1);
  if (dados.length !== tamanhoSnapshot(n)) return null;

  let o = SNAP_CABECALHO;
  const bola: BolaSnap = {
    x: v.getInt16(o, true) / 100,
    y: v.getInt16(o + 2, true) / 100,
    z: v.getInt16(o + 4, true) / 100,
    vx: v.getInt16(o + 6, true) / 100,
    vy: v.getInt16(o + 8, true) / 100,
    vz: v.getInt16(o + 10, true) / 100,
  };

  o += SNAP_BOLA;
  const jogadores: JogadorSnap[] = [];
  for (let i = 0; i < n; i++) {
    const flags = v.getUint8(o + 8);
    jogadores.push({
      slot: v.getUint8(o),
      x: v.getInt16(o + 1, true) / 100,
      z: v.getInt16(o + 3, true) / 100,
      dir: byteParaAngulo(v.getUint8(o + 5)),
      vel: v.getUint8(o + 6) * 0.05,
      anim: v.getUint8(o + 7),
      caido: (flags & 1) !== 0,
      arrancando: (flags & 2) !== 0,
      comBola: (flags & 4) !== 0,
      carregandoChute: (flags & 8) !== 0,
      humano: (flags & 16) !== 0,
      carga: v.getUint8(o + 9) / 255,
    });
    o += SNAP_JOGADOR;
  }

  return {
    tick: v.getUint32(2, true),
    relogio: v.getUint16(6, true),
    golsCasa: v.getUint8(8),
    golsVisitante: v.getUint8(9),
    fase: v.getUint8(10),
    dominante: v.getUint8(11),
    bola,
    jogadores,
  };
}
