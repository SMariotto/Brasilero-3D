import { CHUTE, PASSE } from "../constantes";
import type { Campo } from "../fisica/campo";
import type { Rng } from "../util/rng";
import { grausParaRad, limitar } from "../util/vetor";

export interface VelocidadeBola {
  vx: number;
  vy: number;
  vz: number;
}

/**
 * Mira assistida (SPEC 6.5): se a direção do chute aponta para a região do gol (até 25° para fora da trave),
 * puxa até 12° para dentro do gol. `time` é quem chuta: a Casa (0) ataca o gol de X positivo, o Visitante (1) o de X negativo.
 * Devolve o novo ângulo (radianos, atan2(dz, dx)).
 */
export function miraAssistida(px: number, pz: number, angulo: number, campo: Campo, time: 0 | 1): number {
  // Espelha para o Visitante atacar o mesmo lado que a Casa.
  const espelho = time === 1;
  const x = espelho ? -px : px;
  const a = espelho ? Math.PI - angulo : angulo;

  const dx = campo.metadeComp - x;
  if (dx < 0.5) return angulo; // colado na linha de fundo ou atrás dela: sem ajuda

  const metade = campo.golLarg / 2;
  const traveA = Math.atan2(-metade - pz, dx);
  const traveB = Math.atan2(metade - pz, dx);
  const baixo = Math.min(traveA, traveB);
  const alto = Math.max(traveA, traveB);
  const margem = grausParaRad(CHUTE.miraMargemGraus);
  const puxa = grausParaRad(CHUTE.miraPuxaGraus);

  let novo = a;
  if (a < baixo && a >= baixo - margem) novo = a + Math.min(puxa, baixo - a);
  else if (a > alto && a <= alto + margem) novo = a - Math.min(puxa, a - alto);

  return espelho ? Math.PI - novo : novo;
}

export interface EntradaChute {
  /** Carga de 0 a 1 medida no celular. Toque rápido vale `CHUTE.forcaToque`. */
  forca: number;
  /** Direção do chute (vetor de comprimento 1 no plano XZ). */
  dirX: number;
  dirZ: number;
  px: number;
  pz: number;
  time: 0 | 1;
  campo: Campo;
  arrancando: boolean;
  rng: Rng;
}

/** Velocidade da bola num chute (SPEC 6.5): 14 + 16·força na horizontal, 1 + 5·força na vertical, com mira assistida e erro. */
export function calcularChute(e: EntradaChute): VelocidadeBola & { forca: number } {
  const forca = limitar(e.forca, CHUTE.forcaToque, 1);
  let angulo = Math.atan2(e.dirZ, e.dirX);
  angulo = miraAssistida(e.px, e.pz, angulo, e.campo, e.time);

  const erroMax = forca > CHUTE.erroAltoForca || e.arrancando ? CHUTE.erroAltoGraus : CHUTE.erroGraus;
  angulo += grausParaRad(e.rng.entre(-erroMax, erroMax));

  const rapidez = CHUTE.velocidadeBase + CHUTE.velocidadeExtra * forca;
  return {
    vx: Math.cos(angulo) * rapidez,
    vy: CHUTE.vzBase + CHUTE.vzExtra * forca,
    vz: Math.sin(angulo) * rapidez,
    forca,
  };
}

/** Passe rasteiro simples da F2: na direção pedida, velocidade fixa, sem procurar companheiro (a mira entra na F3). */
export function calcularPasse(dirX: number, dirZ: number): VelocidadeBola {
  return { vx: dirX * PASSE.velocidadeSemAlvo, vy: 0, vz: dirZ * PASSE.velocidadeSemAlvo };
}
