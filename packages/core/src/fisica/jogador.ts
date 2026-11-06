import { JOGADOR } from "../constantes";
import { grausParaRad, normalizarAngulo } from "../util/vetor";
import type { Campo } from "./campo";

/** Corpo de um jogador no plano do chão (círculo de raio `JOGADOR.raio`). */
export interface Corpo {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Para onde o corpo olha, em radianos: dirX = cos(dir), dirZ = sin(dir). */
  dir: number;
  goleiro: boolean;
}

export interface EntradaMovimento {
  /** Direção desejada (vetor de comprimento 1 no plano XZ). */
  dx: number;
  dz: number;
  /** Inclinação do joystick, 0 a 1: a velocidade segue essa inclinação (ver `fracaoDaInclinacao`). */
  mag: number;
  comBola: boolean;
}

export function novoCorpo(x: number, z: number, dir = 0, goleiro = false): Corpo {
  return { x, z, vx: 0, vz: 0, dir, goleiro };
}

/**
 * Que fração da velocidade máxima o jogador usa para uma inclinação do joystick (H3). Curva suave (smoothstep) entre
 * `JOGADOR.inclinacaoAnda` e `JOGADOR.inclinacaoCorre`: inclinação leve anda, inclinação total corre, sem degrau no meio.
 */
export function fracaoDaInclinacao(mag: number): number {
  const u = Math.min(1, Math.max(0, (mag - JOGADOR.inclinacaoAnda) / (JOGADOR.inclinacaoCorre - JOGADOR.inclinacaoAnda)));
  return u * u * (3 - 2 * u);
}

/** A inclinação do joystick que dá uma fração da velocidade máxima (o inverso de `fracaoDaInclinacao`), para os bots. */
export function inclinacaoParaFracao(fracao: number): number {
  const f = Math.min(1, Math.max(0, fracao));
  if (f <= 0) return 0;
  let lo: number = JOGADOR.inclinacaoAnda;
  let hi: number = JOGADOR.inclinacaoCorre;
  for (let i = 0; i < 30; i++) {
    const meio = (lo + hi) / 2;
    if (fracaoDaInclinacao(meio) < f) lo = meio;
    else hi = meio;
  }
  return (lo + hi) / 2;
}

export const velocidade = (c: Corpo): number => Math.hypot(c.vx, c.vz);

/**
 * Um passo do movimento de um jogador (SPEC 6.2): acelera até a velocidade pedida pelo joystick e freia mais forte; o corpo gira até
 * 720°/s, mas a direção do movimento responde na hora. H3: não há stamina nem botão de correr; a velocidade segue a inclinação
 * do joystick (`fracaoDaInclinacao`) até `JOGADOR.velocidadeMax`.
 */
export function passoJogador(c: Corpo, e: EntradaMovimento, dt: number): void {
  // Velocidade pedida: segue a inclinação do joystick (curva suave), com a bola um pouco mais devagar
  const fator = e.comBola ? JOGADOR.fatorVelocidadeComBola : 1;
  const alvo = fracaoDaInclinacao(e.mag) * JOGADOR.velocidadeMax * fator;
  const alvoX = e.dx * alvo;
  const alvoZ = e.dz * alvo;

  // Mudança de velocidade, separada em duas partes (H2): ao longo do movimento (acelera ou freia) e para o lado (curva).
  // A curva tem a própria aceleração, maior que a da largada: sem isso o jogador deslizava de lado ao virar.
  const dvx = alvoX - c.vx;
  const dvz = alvoZ - c.vz;
  const v = velocidade(c);
  if (v < 0.1) {
    // Quase parado: não há "ao longo do movimento"; vale a aceleração da largada em qualquer direção
    const dv = Math.hypot(dvx, dvz);
    const limite = JOGADOR.aceleracao * dt;
    const k = dv > limite ? limite / dv : 1;
    c.vx += dvx * k;
    c.vz += dvz * k;
  } else {
    const ux = c.vx / v;
    const uz = c.vz / v;
    const par = dvx * ux + dvz * uz; // + acelera, - freia
    const perpX = dvx - par * ux;
    const perpZ = dvz - par * uz;
    const perp = Math.hypot(perpX, perpZ);
    const solto = e.mag <= 0.05;
    const limitePar = (par >= 0 ? JOGADOR.aceleracao : solto ? JOGADOR.freadaSolto : JOGADOR.freada) * dt;
    const limitePerp = JOGADOR.aceleracaoLateral * dt;
    const dPar = Math.max(-limitePar, Math.min(limitePar, par));
    const kPerp = perp > limitePerp ? limitePerp / perp : 1;
    c.vx += ux * dPar + perpX * kPerp;
    c.vz += uz * dPar + perpZ * kPerp;
  }

  // Giro do corpo (só se o joystick está empurrando)
  if (e.mag > 0.05) {
    const queda = normalizarAngulo(Math.atan2(e.dz, e.dx) - c.dir);
    const passo = grausParaRad(JOGADOR.giroMax) * dt;
    c.dir = normalizarAngulo(c.dir + Math.max(-passo, Math.min(passo, queda)));
  }

  c.x += c.vx * dt;
  c.z += c.vz * dt;
}

const massaDe = (c: Corpo): number => (c.goleiro ? JOGADOR.massaGoleiro : JOGADOR.massa);

/**
 * Colisão entre jogadores: círculos de raio `JOGADOR.raio` que se empurram em proporção inversa à massa
 * (goleiro conta 1,3). A velocidade ao longo da batida se iguala (choque sem quique).
 */
export function colidirJogadores(corpos: Corpo[]): void {
  const minimo = JOGADOR.raio * 2;
  for (let i = 0; i < corpos.length; i++) {
    for (let j = i + 1; j < corpos.length; j++) {
      const a = corpos[i]!;
      const b = corpos[j]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d >= minimo) continue;
      // Exatamente no mesmo ponto: empurra um para cada lado do eixo X.
      const nx = d < 1e-6 ? 1 : dx / d;
      const nz = d < 1e-6 ? 0 : dz / d;
      const ma = massaDe(a);
      const mb = massaDe(b);
      const total = ma + mb;
      const sobra = minimo - d;
      a.x -= nx * sobra * (mb / total);
      a.z -= nz * sobra * (mb / total);
      b.x += nx * sobra * (ma / total);
      b.z += nz * sobra * (ma / total);

      const van = a.vx * nx + a.vz * nz;
      const vbn = b.vx * nx + b.vz * nz;
      if (vbn - van < 0) {
        const comum = (ma * van + mb * vbn) / total;
        a.vx += nx * (comum - van);
        a.vz += nz * (comum - van);
        b.vx += nx * (comum - vbn);
        b.vz += nz * (comum - vbn);
      }
    }
  }
}

/** Mantém o jogador dentro do campo (F2: modo Arena; na F3 o modo Campo deixa sair para o reinício). */
export function limitarAoCampo(c: Corpo, campo: Campo): void {
  const mx = campo.metadeComp - JOGADOR.raio;
  const mz = campo.metadeLarg - JOGADOR.raio;
  if (c.x > mx) {
    c.x = mx;
    if (c.vx > 0) c.vx = 0;
  } else if (c.x < -mx) {
    c.x = -mx;
    if (c.vx < 0) c.vx = 0;
  }
  if (c.z > mz) {
    c.z = mz;
    if (c.vz > 0) c.vz = 0;
  } else if (c.z < -mz) {
    c.z = -mz;
    if (c.vz < 0) c.vz = 0;
  }
}
