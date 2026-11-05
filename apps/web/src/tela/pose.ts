import { ANIM } from "@b3d/core";

// Poses do jogador feito por código (G3). Tudo aqui é conta pura, sem Three.js, para poder testar.
// O corpo olha para +Z no espaço dele. Os ângulos são em radianos e "para a frente" é sempre positivo:
//  - quadril: a coxa balança para a frente; joelho: a canela dobra para trás (o calcanhar sobe)
//  - ombro: o braço vai para a frente (acima de 1,57 ele passa da horizontal e sobe); cotovelo: o antebraço dobra para a frente
//  - abre: o braço abre para o lado
//  - pitch: o tronco inclina para a frente; roll: inclina de lado; deitar: 0 em pé, 1 deitado de costas (carrinho, queda)

export interface Pose {
  /** Deslocamento vertical do quadril, em metros (positivo sobe). */
  altura: number;
  /** Deslocamento do corpo para o lado esquerdo do jogador, em metros (mergulho do goleiro). */
  lado: number;
  pitch: number;
  roll: number;
  deitar: number;
  quadrilE: number;
  quadrilD: number;
  joelhoE: number;
  joelhoD: number;
  ombroE: number;
  ombroD: number;
  abreE: number;
  abreD: number;
  cotoveloE: number;
  cotoveloD: number;
  cabeca: number;
}

export const CHAVES_DA_POSE = [
  "altura",
  "lado",
  "pitch",
  "roll",
  "deitar",
  "quadrilE",
  "quadrilD",
  "joelhoE",
  "joelhoD",
  "ombroE",
  "ombroD",
  "abreE",
  "abreD",
  "cotoveloE",
  "cotoveloD",
  "cabeca",
] as const satisfies ReadonlyArray<keyof Pose>;

/** Medidas do corpo (metros). O quadril em pé fica a `QUADRIL_Y` do chão, com a perna esticada. */
export const CORPO = {
  quadrilY: 0.97,
  coxa: 0.43,
  canela: 0.43,
  tronco: 0.55,
  braco: 0.28,
  antebraco: 0.26,
  /** O comprimento da perna do quadril ao pé (coxa + canela). */
  perna: 0.86,
} as const;

export const poseDeDescanso = (): Pose => ({
  altura: 0,
  lado: 0,
  pitch: 0,
  roll: 0,
  deitar: 0,
  quadrilE: 0,
  quadrilD: 0,
  joelhoE: 0.04,
  joelhoD: 0.04,
  ombroE: 0.08,
  ombroD: 0.08,
  abreE: 0.1,
  abreD: 0.1,
  cotoveloE: 0.25,
  cotoveloD: 0.25,
  cabeca: 0,
});

// ---------------------------------------------------------------------------
// Corrida: a cadência vem da velocidade real, para o pé não patinar
// ---------------------------------------------------------------------------

/** Amplitude (rad) do balanço da coxa na corrida, crescendo com a velocidade (e mais na arrancada). */
export function amplitudeDaCorrida(vel: number, arrancando: boolean): number {
  const a = 0.38 + 0.06 * vel + (arrancando ? 0.12 : 0);
  return Math.min(a, 0.95);
}

/**
 * Quantos radianos da fase da corrida passam por segundo. Com a coxa balançando `A·sin(fase)` e uma perna de comprimento `L`, o pé
 * no chão anda para trás, em relação ao quadril, a `L·A·ω` m/s no meio do apoio. Fazendo `ω = v / (L·A)` isso é igual à velocidade
 * do jogador (`v`): o pé fica parado no gramado e o jogador não "patina".
 */
export function velocidadeDaFase(vel: number, arrancando: boolean): number {
  const v = Math.max(vel, 0.4);
  return v / (CORPO.perna * amplitudeDaCorrida(v, arrancando));
}

/** Quanto o pé de apoio anda para trás em relação ao quadril no meio do passo (m/s): tem que ser igual à velocidade do jogador. */
export function velocidadeDoPe(vel: number, arrancando: boolean): number {
  return CORPO.perna * amplitudeDaCorrida(Math.max(vel, 0.4), arrancando) * velocidadeDaFase(vel, arrancando);
}

// ---------------------------------------------------------------------------
// As poses de cada animação
// ---------------------------------------------------------------------------

const suave = (u: number): number => {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
};

/** Duração (s) dos movimentos de uma jogada só. */
export const DURACAO = { chute: 0.3, passe: 0.3, cabeceio: 0.5, mergulho: 0.45 } as const;

export interface EntradaDaPose {
  anim: number;
  /** Velocidade real do jogador (m/s). */
  vel: number;
  arrancando: boolean;
  /** A fase da corrida (rad), que o animador faz avançar com `velocidadeDaFase`. */
  fase: number;
  /** Segundos desde que esta animação começou (para as jogadas de um golpe só). */
  tAnim: number;
  /** Tempo total (s), para respirar e pular. */
  t: number;
  /** +1 se o lado esquerdo do jogador é o lado "Esq" do mergulho do goleiro (-Z do mundo), -1 se for o contrário. */
  sinalLado: number;
}

/** A pose que a animação pede neste instante (o animador suaviza a passagem de uma para outra). */
export function alvoDaPose(e: EntradaDaPose): Pose {
  const p = poseDeDescanso();
  const { anim, tAnim, t } = e;

  switch (anim) {
    case ANIM.corrida:
    case ANIM.arrancada: {
      const arr = anim === ANIM.arrancada || e.arrancando;
      const A = amplitudeDaCorrida(e.vel, arr);
      const s = Math.sin(e.fase);
      const c = Math.cos(e.fase);
      const f = Math.min(1.4, Math.max(0.35, e.vel / 6));
      p.quadrilE = A * s;
      p.quadrilD = -A * s;
      // A perna que vem para a frente (c > 0 para a esquerda) dobra o joelho para passar por baixo do corpo
      p.joelhoE = 0.18 + 1.0 * f * Math.max(0, c);
      p.joelhoD = 0.18 + 1.0 * f * Math.max(0, -c);
      p.ombroE = -1.0 * A * s + 0.1;
      p.ombroD = 1.0 * A * s + 0.1;
      p.cotoveloE = p.cotoveloD = 1.25;
      p.abreE = p.abreD = 0.08;
      p.pitch = 0.07 + 0.022 * e.vel + (arr ? 0.1 : 0);
      p.altura = -0.012 - 0.004 * e.vel + 0.03 * Math.abs(c) * f;
      p.cabeca = -p.pitch * 0.6;
      break;
    }

    case ANIM.chute:
    case ANIM.passe: {
      const forte = anim === ANIM.chute;
      const dur = forte ? DURACAO.chute : DURACAO.passe;
      const u = Math.min(1, tAnim / dur);
      const amp = forte ? 1.35 : 0.8;
      // Perna direita: arma para trás (35% do tempo), depois varre para a frente
      const atras = suave(u / 0.35);
      const frente = suave((u - 0.35) / 0.3);
      const volta = suave((u - 0.7) / 0.3);
      p.quadrilD = -0.8 * atras + (amp + 0.8) * frente - amp * volta;
      p.joelhoD = 0.2 + 1.2 * atras * (1 - frente) + 0.15 * frente;
      p.quadrilE = -0.1;
      p.joelhoE = 0.35;
      p.ombroE = 0.9 * frente - 0.2;
      p.ombroD = -0.7 * frente;
      p.abreE = p.abreD = 0.4;
      p.cotoveloE = p.cotoveloD = 0.5;
      p.pitch = forte ? 0.16 - 0.1 * frente : 0.08;
      p.altura = 0;
      break;
    }

    case ANIM.carrinho:
    case ANIM.queda: {
      const slide = anim === ANIM.carrinho;
      // Deita de costas (os pés vão na frente); a queda é mais devagar e solta
      const k = suave(tAnim / (slide ? 0.12 : 0.25));
      p.deitar = (slide ? 0.88 : 1) * k;
      p.altura = -0.7 * p.deitar;
      p.quadrilD = slide ? 1.25 * k : 0.2;
      p.quadrilE = slide ? 0.55 * k : -0.2;
      p.joelhoD = slide ? 0.05 : 0.3;
      p.joelhoE = slide ? 0.9 : 0.4;
      p.ombroE = p.ombroD = slide ? -0.5 : 0.1;
      p.abreE = p.abreD = slide ? 0.9 : 0.7;
      p.cotoveloE = p.cotoveloD = 0.3;
      p.cabeca = slide ? 0.5 : 0;
      break;
    }

    case ANIM.comemoracao: {
      const pulo = Math.abs(Math.sin(t * 7));
      p.altura = 0.24 * pulo;
      p.ombroE = p.ombroD = 2.85;
      p.abreE = p.abreD = 0.45;
      p.cotoveloE = p.cotoveloD = 0.25;
      p.quadrilE = p.quadrilD = 0.1 * (1 - pulo);
      p.joelhoE = p.joelhoD = 0.1 + 0.5 * (1 - pulo);
      p.cabeca = -0.25;
      break;
    }

    case ANIM.goleiroParado: {
      // Agachado, pernas abertas, braços abertos à frente, balançando de leve
      p.altura = -0.01 + Math.sin(t * 3) * 0.01;
      p.quadrilE = p.quadrilD = 0.55;
      p.joelhoE = p.joelhoD = 0.75;
      p.pitch = 0.3;
      p.ombroE = p.ombroD = 0.9;
      p.abreE = p.abreD = 0.55;
      p.cotoveloE = p.cotoveloD = 0.6;
      p.cabeca = -0.3;
      break;
    }

    case ANIM.goleiroComBola: {
      p.pitch = 0.1;
      p.ombroE = p.ombroD = 1.25;
      p.cotoveloE = p.cotoveloD = 1.15;
      p.abreE = p.abreD = 0.0;
      p.quadrilE = p.quadrilD = 0.1;
      p.cabeca = -0.1;
      break;
    }

    case ANIM.goleiroMergulhoEsq:
    case ANIM.goleiroMergulhoDir: {
      // Voa de lado com os braços para cima; `sinalLado` diz para que lado do corpo ele cai (o mundo -Z é o "Esq")
      const lado = (anim === ANIM.goleiroMergulhoEsq ? 1 : -1) * e.sinalLado;
      const k = suave(tAnim / (DURACAO.mergulho * 0.7));
      p.roll = -lado * 1.3 * k;
      p.lado = lado * 0.7 * k;
      p.altura = 0.12 * Math.sin(Math.min(1, tAnim / DURACAO.mergulho) * Math.PI) - 0.25 * k;
      p.ombroE = p.ombroD = 2.8;
      p.abreE = p.abreD = 0.25;
      p.cotoveloE = p.cotoveloD = 0.1;
      p.quadrilE = -0.3;
      p.quadrilD = -0.15;
      p.joelhoE = p.joelhoD = 0.6;
      p.cabeca = 0.1;
      break;
    }

    case ANIM.cabeceio: {
      const u = Math.min(1, tAnim / DURACAO.cabeceio);
      p.altura = 0.34 * Math.sin(u * Math.PI);
      p.pitch = -0.3 + 0.75 * suave(u / 0.55) - 0.3 * suave((u - 0.7) / 0.3);
      p.cabeca = 0.3 * suave(u / 0.55);
      p.ombroE = p.ombroD = 0.6;
      p.abreE = p.abreD = 0.6;
      p.quadrilE = p.quadrilD = 0.5;
      p.joelhoE = p.joelhoD = 0.9;
      break;
    }

    case ANIM.cobranca: {
      // Esperando para cobrar: em pé, olhando para a bola
      p.pitch = 0.08;
      p.cabeca = 0.2;
      p.quadrilD = 0.15;
      p.joelhoD = 0.3;
      p.altura = Math.sin(t * 2.2) * 0.006;
      break;
    }

    default: {
      // Parado: respira de leve
      p.altura = Math.sin(t * 2.2) * 0.006;
      p.ombroE += Math.sin(t * 1.7) * 0.02;
      p.ombroD += Math.sin(t * 1.7 + 1) * 0.02;
      break;
    }
  }
  return p;
}

/** As animações que precisam do tempo desde o começo (golpe só): ao mudar de animação o tempo volta a zero. */
export function ehGolpe(anim: number): boolean {
  return anim === ANIM.chute || anim === ANIM.passe || anim === ANIM.cabeceio || anim === ANIM.carrinho || anim === ANIM.queda || anim === ANIM.goleiroMergulhoEsq || anim === ANIM.goleiroMergulhoDir;
}

// ---------------------------------------------------------------------------
// O animador de um jogador: suaviza a passagem entre poses e faz a fase da corrida andar
// ---------------------------------------------------------------------------

/** Rapidez com que a pose atual alcança a pedida (1/s). Alto o bastante para o chute de 0,3 s aparecer inteiro. */
const RAPIDEZ = 20;

export class AnimadorDePose {
  pose: Pose = poseDeDescanso();
  private fase = 0;
  private anim = -1;
  private desde = 0;
  private t = 0;

  /** Avança `dt` segundos com a animação, a velocidade e o lado do mergulho que o servidor mandou. */
  atualizar(anim: number, vel: number, arrancando: boolean, dt: number, sinalLado = 1): Pose {
    this.t += dt;
    if (anim !== this.anim) {
      this.anim = anim;
      this.desde = this.t;
    }
    if (anim === ANIM.corrida || anim === ANIM.arrancada) this.fase = (this.fase + velocidadeDaFase(vel, arrancando || anim === ANIM.arrancada) * dt) % (Math.PI * 2);

    const alvo = alvoDaPose({ anim, vel, arrancando, fase: this.fase, tAnim: this.t - this.desde, t: this.t, sinalLado });
    // A fase da corrida não é suavizada (senão a cadência mudaria de frequência); o resto é.
    const k = 1 - Math.exp(-RAPIDEZ * dt);
    for (const chave of CHAVES_DA_POSE) this.pose[chave] += (alvo[chave] - this.pose[chave]) * k;
    return this.pose;
  }

  get faseDaCorrida(): number {
    return this.fase;
  }
}
