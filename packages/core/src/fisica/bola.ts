import { BOLA, GOL } from "../constantes";
import type { Campo, Segmento } from "./campo";

export interface Bola {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Efeito (H2): rad/s com que o rumo da velocidade horizontal gira (positivo: de +X para +Z). Ausente = sem efeito. */
  giro?: number;
  /** Depois de um gol: de que lado (-1 gol da Casa, +1 gol do Visitante) a bola está presa na rede. 0 = jogo normal. */
  naRede: -1 | 0 | 1;
}

export interface EventoBola {
  quiques: number;
  /** Bateu na trave ou no travessão neste passo. */
  trave: { x: number; y: number; z: number } | null;
  parede: boolean;
}

export const novaBola = (x = 0, z = 0): Bola => ({ x, y: BOLA.raio, z, vx: 0, vy: 0, vz: 0, naRede: 0 });

export interface OpcoesPassoBola {
  /** Bola conduzida por um jogador: quem manda no movimento horizontal é a mola de condução, então sem atrito rolando. */
  conduzida?: boolean;
}

/** Ponto do segmento mais perto de (px, py, pz). */
function pontoMaisPerto(s: Segmento, px: number, py: number, pz: number): [number, number, number] {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const dz = s.bz - s.az;
  const c2 = dx * dx + dy * dy + dz * dz;
  let t = c2 > 0 ? ((px - s.ax) * dx + (py - s.ay) * dy + (pz - s.az) * dz) / c2 : 0;
  t = Math.max(0, Math.min(1, t));
  return [s.ax + dx * t, s.ay + dy * t, s.az + dz * t];
}

/** O ponto (x, y, z) está na boca do gol (entre as traves e abaixo do travessão)? Só vale perto da linha de fundo. */
function naBocaDoGol(campo: Campo, z: number, y: number): boolean {
  return Math.abs(z) < campo.golLarg / 2 && y < campo.golAlt;
}

/**
 * Um passo da física da bola (SPEC 6.1): gravidade, arrasto, quique no chão, atrito rolando, traves,
 * paredes do modo Arena e a rede atrás do gol. A bola é uma esfera de raio `BOLA.raio`.
 */
export function passoBola(b: Bola, campo: Campo, dt: number, op: OpcoesPassoBola = {}): EventoBola {
  const ev: EventoBola = { quiques: 0, trave: null, parede: false };
  const r = BOLA.raio;

  // Gravidade e arrasto do ar: v -= arrasto · v · |v| · dt
  b.vy -= BOLA.gravidade * dt;
  const v = Math.hypot(b.vx, b.vy, b.vz);
  if (v > 0) {
    const f = Math.max(0, 1 - BOLA.arrasto * v * dt);
    b.vx *= f;
    b.vy *= f;
    b.vz *= f;
  }

  // Efeito (H2): o rumo da velocidade horizontal gira (a rapidez não muda); o giro cai no ar devagar e no chão depressa
  if (b.giro && b.naRede === 0) {
    const a = b.giro * dt;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const vx = b.vx * c - b.vz * s;
    const vz = b.vx * s + b.vz * c;
    b.vx = vx;
    b.vz = vz;
    const tau = b.y <= r + 0.02 ? BOLA.giroDecaimentoChaoS : BOLA.giroDecaimentoArS;
    b.giro *= Math.exp(-dt / tau);
    if (Math.abs(b.giro) < BOLA.giroMinimo) b.giro = 0;
  }

  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;

  // Traves e travessão (cilindros de raio travesRaio em volta de cada segmento)
  const alcance = r + BOLA.travesRaio;
  for (const s of campo.traves) {
    const [cx, cy, cz] = pontoMaisPerto(s, b.x, b.y, b.z);
    const dx = b.x - cx;
    const dy = b.y - cy;
    const dz = b.z - cz;
    const d = Math.hypot(dx, dy, dz);
    if (d >= alcance || d === 0) continue;
    const nx = dx / d;
    const ny = dy / d;
    const nz = dz / d;
    b.x = cx + nx * alcance;
    b.y = cy + ny * alcance;
    b.z = cz + nz * alcance;
    const vn = b.vx * nx + b.vy * ny + b.vz * nz;
    if (vn < 0) {
      const k = (1 + BOLA.travesRestituicao) * vn;
      b.vx -= k * nx;
      b.vy -= k * ny;
      b.vz -= k * nz;
      ev.trave = { x: b.x, y: b.y, z: b.z };
      if (b.giro) b.giro *= BOLA.giroSobraTrave;
    }
  }

  if (b.naRede !== 0) {
    prenderNaRede(b, campo, ev);
  } else if (campo.paredes) {
    // Paredes do modo Arena: valem em qualquer altura (a bola nunca sai) e deixam a boca do gol aberta.
    const e = BOLA.paredeRestituicao;
    const aberta = naBocaDoGol(campo, b.z, b.y);
    if (!aberta && b.x + r > campo.metadeComp) {
      b.x = campo.metadeComp - r;
      if (b.vx > 0) b.vx = -b.vx * e;
      ev.parede = true;
    } else if (!aberta && b.x - r < -campo.metadeComp) {
      b.x = -campo.metadeComp + r;
      if (b.vx < 0) b.vx = -b.vx * e;
      ev.parede = true;
    }
    if (b.z + r > campo.metadeLarg) {
      b.z = campo.metadeLarg - r;
      if (b.vz > 0) b.vz = -b.vz * e;
      ev.parede = true;
    } else if (b.z - r < -campo.metadeLarg) {
      b.z = -campo.metadeLarg + r;
      if (b.vz < 0) b.vz = -b.vz * e;
      ev.parede = true;
    }
  }

  // Chão: quique (restituição vertical, perde parte da velocidade horizontal) ou rolar com atrito.
  if (b.y <= r) {
    b.y = r;
    if (b.vy < -BOLA.quiqueMinimo) {
      b.vy = -b.vy * BOLA.restituicaoChao;
      b.vx *= 1 - BOLA.perdaHorizontalQuique;
      b.vz *= 1 - BOLA.perdaHorizontalQuique;
      if (b.giro) b.giro *= BOLA.giroSobraQuique;
      ev.quiques++;
    } else {
      b.vy = 0;
      if (!op.conduzida) {
        const h = Math.hypot(b.vx, b.vz);
        const perda = BOLA.atritoChao * dt;
        if (h < BOLA.velocidadeParada || h <= perda) {
          b.vx = 0;
          b.vz = 0;
        } else {
          const f = (h - perda) / h;
          b.vx *= f;
          b.vz *= f;
        }
      }
    }
  }

  return ev;
}

/** Caixa atrás da linha do gol onde a bola fica depois do gol, quicando de leve (provisório, F2). */
function prenderNaRede(b: Bola, campo: Campo, ev: EventoBola): void {
  const r = BOLA.raio;
  const e = GOL.restituicaoRede;
  const lado = b.naRede;
  const linha = campo.metadeComp * lado;
  const fundo = (campo.metadeComp + GOL.profundidadeRede) * lado;
  const xMin = Math.min(linha, fundo) + r;
  const xMax = Math.max(linha, fundo) - r;
  const zMax = campo.golLarg / 2 - r;
  const yMax = campo.golAlt - r;

  if (b.x < xMin) {
    b.x = xMin;
    if (b.vx < 0) b.vx = -b.vx * e;
  } else if (b.x > xMax) {
    b.x = xMax;
    if (b.vx > 0) b.vx = -b.vx * e;
  }
  if (b.z < -zMax) {
    b.z = -zMax;
    if (b.vz < 0) b.vz = -b.vz * e;
  } else if (b.z > zMax) {
    b.z = zMax;
    if (b.vz > 0) b.vz = -b.vz * e;
  }
  if (b.y > yMax) {
    b.y = yMax;
    if (b.vy > 0) b.vy = -b.vy * e;
  }
  ev.parede = false;
}

/**
 * A bola acabou de cruzar a linha do gol inteira, entre as traves e abaixo do travessão (SPEC 4.7)?
 * Precisa do X de antes do passo: o gol é decidido NO instante em que a bola passa da linha. Bola que passou por cima do
 * travessão e depois cai atrás do gol não conta.
 * Devolve de qual gol: -1 = gol da Casa (X negativo, o Visitante marcou), +1 = gol do Visitante (a Casa marcou), 0 = não.
 */
export function golMarcado(b: Bola, campo: Campo, xAntes: number): -1 | 0 | 1 {
  if (b.naRede !== 0) return 0;
  const r = BOLA.raio;
  if (!naBocaDoGol(campo, b.z, b.y)) return 0;
  if (xAntes - r <= campo.metadeComp && b.x - r > campo.metadeComp) return 1;
  if (xAntes + r >= -campo.metadeComp && b.x + r < -campo.metadeComp) return -1;
  return 0;
}
