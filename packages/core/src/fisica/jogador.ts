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
  energia: number;
  /** Ficou sem energia (abaixo de 15) e só volta a arrancar quando recuperar até 30. */
  exausto: boolean;
  arrancando: boolean;
  goleiro: boolean;
}

export interface EntradaMovimento {
  /** Direção desejada (vetor de comprimento 1 no plano XZ). */
  dx: number;
  dz: number;
  /** Força do joystick, 0 a 1. */
  mag: number;
  correr: boolean;
  comBola: boolean;
}

export function novoCorpo(x: number, z: number, dir = 0, goleiro = false): Corpo {
  return { x, z, vx: 0, vz: 0, dir, energia: JOGADOR.energiaMax, exausto: false, arrancando: false, goleiro };
}

export const velocidade = (c: Corpo): number => Math.hypot(c.vx, c.vz);

/**
 * Um passo do movimento de um jogador (SPEC 6.2): acelera até a velocidade pedida pelo joystick (18 m/s²) e freia mais forte
 * (24 m/s²); CORRER dá a arrancada, que gasta energia; o corpo gira até 720°/s, mas a direção do movimento responde na hora.
 */
export function passoJogador(c: Corpo, e: EntradaMovimento, dt: number): void {
  // Energia: arrancada gasta 25/s, parado ou correndo normal recupera 12/s.
  const quer = e.correr && e.mag > 0;
  c.arrancando = quer && !c.exausto && c.energia > 0;
  if (c.arrancando) {
    c.energia = Math.max(0, c.energia - JOGADOR.energiaGasto * dt);
    if (c.energia < JOGADOR.energiaMinimaParaArrancar) c.exausto = true;
  } else {
    c.energia = Math.min(JOGADOR.energiaMax, c.energia + JOGADOR.energiaRecupera * dt);
    if (c.exausto && c.energia >= JOGADOR.energiaVoltaAArrancar) c.exausto = false;
  }

  // Velocidade pedida
  const base = c.arrancando ? JOGADOR.arrancada : JOGADOR.velocidadeMax;
  const fator = e.comBola ? (c.arrancando ? JOGADOR.fatorArrancadaComBola : JOGADOR.fatorVelocidadeComBola) : 1;
  const alvo = e.mag * base * fator;
  const alvoX = e.dx * alvo;
  const alvoZ = e.dz * alvo;

  // Aceleração ou freada (freia mais forte quando a velocidade pedida é menor que a atual)
  let dvx = alvoX - c.vx;
  let dvz = alvoZ - c.vz;
  const dv = Math.hypot(dvx, dvz);
  if (dv > 0) {
    const freando = alvo < velocidade(c);
    const limite = (freando ? JOGADOR.freada : JOGADOR.aceleracao) * dt;
    if (dv > limite) {
      dvx = (dvx / dv) * limite;
      dvz = (dvz / dv) * limite;
    }
    c.vx += dvx;
    c.vz += dvz;
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
