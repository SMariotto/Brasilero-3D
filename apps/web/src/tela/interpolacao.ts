import { TEMPO, type BolaSnap, type JogadorSnap, type Snapshot } from "@b3d/core";

// Interpolação de entidades (ARQUITETURA 5, PROTOCOLO 6): o telão desenha o jogo "um pouco no passado", entre os dois
// snapshots que cercam `agora - atraso`. Ninguém joga olhando o próprio celular, então não há previsão: só suavização.
//
// O relógio do servidor é estimado pelo menor valor de (hora que o snapshot chegou - hora do tick dele) nos últimos snapshots,
// que é o caminho de rede mais rápido; só diferenças importam aqui. (A SPEC propõe estimar com ping/pong; isto dá o mesmo
// efeito para a interpolação sem depender de mais uma mensagem. O ping continua aparecendo na tela.)

export const ATRASO_INICIAL_MS = 100;
export const ATRASO_MIN_MS = 66;
export const ATRASO_MAX_MS = 200;
/** Quanto a bola pode ser extrapolada além do último snapshot, em ms. Depois disso ela congela. */
export const EXTRAPOLA_MAX_MS = 100;
/** Deslocamento maior que isto entre dois snapshots (m) é um "teletransporte" (saída de bola): sem deslizar. */
export const SALTO_MAX_M = 8;

const MS_POR_TICK = 1000 / TEMPO.tickHz;
const JANELA_RELOGIO = 90; // ~3 s de snapshots
const MAX_BUFFER = 150;

export interface AmostraJogador extends Omit<JogadorSnap, "dir"> {
  dir: number;
}

export interface Amostra {
  tick: number;
  relogio: number;
  golsCasa: number;
  golsVisitante: number;
  fase: number;
  dominante: number;
  bola: BolaSnap;
  jogadores: AmostraJogador[];
}

interface Entrada {
  snap: Snapshot;
  /** Hora do tick no relógio do servidor, em ms. */
  t: number;
}

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** Interpola ângulos pelo caminho mais curto. */
function lerpAngulo(a: number, b: number, k: number): number {
  const volta = Math.PI * 2;
  let d = (b - a) % volta;
  if (d > Math.PI) d -= volta;
  else if (d < -Math.PI) d += volta;
  return a + d * k;
}

export class Interpolador {
  private buf: Entrada[] = [];
  private difs: number[] = [];
  private base = 0;
  private jitter = 0;
  /** Atraso de interpolação atual (ms). */
  atrasoMs = ATRASO_INICIAL_MS;

  /** Esquece tudo (nova partida, ou o tick voltou para trás). */
  reiniciar(): void {
    this.buf = [];
    this.difs = [];
    this.base = 0;
    this.jitter = 0;
    this.atrasoMs = ATRASO_INICIAL_MS;
  }

  get tamanho(): number {
    return this.buf.length;
  }

  /** Guarda um snapshot que chegou em `agoraMs` (hora local). */
  adicionar(snap: Snapshot, agoraMs: number): void {
    const ultimo = this.buf[this.buf.length - 1];
    if (ultimo && snap.tick <= ultimo.snap.tick) {
      // Tick que volta para trás: partida nova. Tick repetido: ignora.
      if (snap.tick < ultimo.snap.tick) this.reiniciar();
      else return;
    }

    const t = snap.tick * MS_POR_TICK;
    const dif = agoraMs - t;
    this.difs.push(dif);
    if (this.difs.length > JANELA_RELOGIO) this.difs.shift();
    this.base = Math.min(...this.difs);

    // Jitter: quanto este snapshot chegou depois do caminho mais rápido. O atraso acompanha devagar (sobe rápido, desce lento).
    this.jitter = lerp(this.jitter, dif - this.base, 0.1);
    const alvo = Math.max(ATRASO_MIN_MS, Math.min(ATRASO_MAX_MS, ATRASO_MIN_MS + 3 * this.jitter));
    this.atrasoMs += (alvo - this.atrasoMs) * (alvo > this.atrasoMs ? 0.2 : 0.02);

    this.buf.push({ snap, t });
    if (this.buf.length > MAX_BUFFER) this.buf.shift();
  }

  /** O estado do jogo para desenhar em `agoraMs`, ou `null` se ainda não chegou nada. */
  amostrar(agoraMs: number): Amostra | null {
    const n = this.buf.length;
    if (n === 0) return null;
    const alvo = agoraMs - this.base - this.atrasoMs;

    // Descarta o que já ficou muito para trás (guarda pelo menos 2).
    while (this.buf.length > 2 && this.buf[1]!.t < alvo - 500) this.buf.shift();

    const primeiro = this.buf[0]!;
    if (this.buf.length === 1 || alvo <= primeiro.t) return copiar(primeiro.snap);

    let i = 0;
    while (i < this.buf.length - 2 && this.buf[i + 1]!.t < alvo) i++;
    const a = this.buf[i]!;
    const b = this.buf[i + 1]!;

    if (alvo > b.t) {
      // Faltou snapshot: segue a bola com a velocidade dela por até 100 ms e depois congela.
      const s = copiar(b.snap);
      const dt = Math.min(alvo - b.t, EXTRAPOLA_MAX_MS) / 1000;
      s.bola.x += s.bola.vx * dt;
      s.bola.y = Math.max(0.11, s.bola.y + s.bola.vy * dt);
      s.bola.z += s.bola.vz * dt;
      return s;
    }

    const k = (alvo - a.t) / Math.max(1, b.t - a.t);
    return misturar(a.snap, b.snap, Math.max(0, Math.min(1, k)));
  }
}

function copiar(s: Snapshot): Amostra {
  return { ...s, bola: { ...s.bola }, jogadores: s.jogadores.map((j) => ({ ...j })) };
}

function misturar(a: Snapshot, b: Snapshot, k: number): Amostra {
  // Os campos "discretos" (fase, placar, quem domina) vêm do snapshot mais perto no tempo.
  const base = k < 0.5 ? a : b;
  const salto = Math.hypot(b.bola.x - a.bola.x, b.bola.z - a.bola.z) > SALTO_MAX_M;
  const bola: BolaSnap = salto
    ? { ...b.bola }
    : {
        x: lerp(a.bola.x, b.bola.x, k),
        y: lerp(a.bola.y, b.bola.y, k),
        z: lerp(a.bola.z, b.bola.z, k),
        vx: lerp(a.bola.vx, b.bola.vx, k),
        vy: lerp(a.bola.vy, b.bola.vy, k),
        vz: lerp(a.bola.vz, b.bola.vz, k),
      };

  const jogadores: AmostraJogador[] = b.jogadores.map((jb) => {
    const ja = a.jogadores.find((j) => j.slot === jb.slot);
    const fonte = k < 0.5 && ja ? ja : jb;
    if (!ja || Math.hypot(jb.x - ja.x, jb.z - ja.z) > SALTO_MAX_M) return { ...jb };
    return {
      ...fonte,
      x: lerp(ja.x, jb.x, k),
      z: lerp(ja.z, jb.z, k),
      dir: lerpAngulo(ja.dir, jb.dir, k),
      vel: lerp(ja.vel, jb.vel, k),
      carga: lerp(ja.carga, jb.carga, k),
    };
  });

  return {
    tick: lerp(a.tick, b.tick, k),
    relogio: base.relogio,
    golsCasa: base.golsCasa,
    golsVisitante: base.golsVisitante,
    fase: base.fase,
    dominante: base.dominante,
    bola,
    jogadores,
  };
}
