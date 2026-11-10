import { ANIM, ANIMACAO } from "@b3d/core";
import { EXPRESSAO, FPS_DO_ROSTO, QUADROS_POR_EXPRESSAO } from "./boneco-dados";

// Que animação do boneco novo (rig-v1, H5) tocar para cada estado do snapshot, e como (velocidade, pé, rosto). Lógica pura, sem
// Three.js, com teste. Os nomes são os do `model-brasilero-3d-rig-1malha.glb` (30 fps).

export const CLIPE = {
  parado: "parado",
  correr: "correr",
  chutar: "chutar",
  chutarEsq: "chutar_esq",
  comemorar: "comemorar",
  gkParado: "gk_parado",
  gkMergulhoEsq: "gk_mergulho_esq",
  gkMergulhoDir: "gk_mergulho_dir",
  gkDefesaAlta: "gk_defesa_alta",
} as const;

export const TODOS_OS_CLIPES: string[] = Object.values(CLIPE);

/** Os clipes que ficam repetindo (os outros tocam uma vez e voltam para `parado`, ou `gk_parado` no goleiro). */
export const CLIPES_COM_LOOP: ReadonlySet<string> = new Set([CLIPE.parado, CLIPE.correr, CLIPE.gkParado]);

/** Tempo (s) da troca entre dois clipes. */
export const CROSSFADE_S = 0.12;

// --- corrida ---------------------------------------------------------------------------------------------------------------

/**
 * Velocidade (m/s do jogo, com o boneco em 1,8 m) em que o pé de apoio do clipe `correr` anda para trás na velocidade do chão, a 1x.
 * Medida no clipe: o pé anda 0,57 m/s no rig (0,44 m de altura) e o boneco é ampliado ×4,1. A passada do boneco é curta (pernas de
 * criança): a 7,6 m/s ele teria de tocar o clipe a ×3,2, que vira um borrão; por isso o teto abaixo, e o pé desliza um pouco na máxima.
 */
export const VELOCIDADE_DA_CORRIDA_GRAVADA = 2.34;
export const ESCALA_MIN_DA_CORRIDA = 0.5;
export const ESCALA_MAX_DA_CORRIDA = 2.5;

/** Velocidade de reprodução do `correr`: acompanha a velocidade real do jogador (m/s), com piso e teto. */
export function velocidadeDaCorrida(vel: number): number {
  return Math.min(ESCALA_MAX_DA_CORRIDA, Math.max(ESCALA_MIN_DA_CORRIDA, vel / VELOCIDADE_DA_CORRIDA_GRAVADA));
}

// --- chute e passe ---------------------------------------------------------------------------------------------------------

/** No clipe `chutar`, o pé bate na bola no quadro 16 (0,53 s de 0,8 s). */
export const CONTATO_DO_CHUTE_S = 16 / 30;
/** O servidor solta a bola no instante em que o estado começa: o pé tem de bater logo (s depois do começo do estado). */
export const ATRASO_DO_CONTATO_S = 0.1;
/** Perto desta distância (m) da linha do corpo a bola está "de frente": chuta com o pé direito. */
export const FOLGA_DO_PE_M = 0.08;

export interface ContextoDaAnimacao {
  goleiro: boolean;
  x: number;
  z: number;
  /** Direção do corpo, radianos a partir de +X (dirX = cos, dirZ = sin). */
  dir: number;
  vel: number;
  bola?: { x: number; y: number; z: number } | null;
}

/** Com que pé chuta: a bola à esquerda do corpo pede `chutar_esq`. O protocolo não diz o pé, então decide pelo lado da bola. */
export function pePorLado(ctx: Pick<ContextoDaAnimacao, "x" | "z" | "dir" | "bola">): "esq" | "dir" {
  if (!ctx.bola) return "dir";
  // O vetor para a esquerda do jogador, no chão, é (sen dir, -cos dir) (de frente para +X, a esquerda é -Z)
  const lado = Math.sin(ctx.dir) * (ctx.bola.x - ctx.x) - Math.cos(ctx.dir) * (ctx.bola.z - ctx.z);
  return lado > FOLGA_DO_PE_M ? "esq" : "dir";
}

// --- goleiro ---------------------------------------------------------------------------------------------------------------

/** Acima desta altura (m) da bola, no começo do mergulho, o goleiro faz a defesa alta em vez de se jogar de lado. */
export const ALTURA_DA_DEFESA_ALTA_M = 1.5;
/** O estado de mergulho dura 0,45 s no servidor; o clipe leva ~0,67 s para chegar ao chão, então toca mais rápido. */
export const ESCALA_DO_MERGULHO = 1.6;
export const ESCALA_DA_DEFESA_ALTA = 1.5;

// --- decisão ---------------------------------------------------------------------------------------------------------------

export interface Decisao {
  clipe: string;
  repete: boolean;
  /** Velocidade de reprodução (1 = normal). Na corrida o chamador a atualiza a cada quadro com `velocidadeDaCorrida`. */
  velocidade: number;
  /** De que ponto do clipe (s) começar. */
  inicioS: number;
  /** Falso quando o estado ainda não tem animação própria e usa a reserva. */
  propria: boolean;
}

const limite = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/**
 * O clipe, a velocidade e o ponto de partida para o estado `anim` do snapshot. `duracoes` traz os clipes que o modelo tem (nome →
 * duração em s). Devolve `null` se o modelo não tem nem o clipe de repouso.
 */
export function decidir(anim: number, ctx: ContextoDaAnimacao, duracoes: ReadonlyMap<string, number>): Decisao | null {
  const tem = (n: string): boolean => duracoes.has(n);
  const repouso = ctx.goleiro && tem(CLIPE.gkParado) ? CLIPE.gkParado : CLIPE.parado;
  if (!tem(repouso)) return null;
  const simples = (clipe: string, propria: boolean, velocidade = 1, inicioS = 0): Decisao => ({ clipe, repete: CLIPES_COM_LOOP.has(clipe), velocidade, inicioS, propria });
  const reserva = (): Decisao => simples(repouso, false);

  switch (anim) {
    case ANIM.parado:
      return simples(repouso, true);

    case ANIM.corrida:
      // O goleiro nunca corre (o servidor manda `goleiroParado` mesmo quando ele se mexe), mas se vier, fica agachado
      return ctx.goleiro || !tem(CLIPE.correr) ? reserva() : simples(CLIPE.correr, true, velocidadeDaCorrida(ctx.vel));

    case ANIM.chute:
    case ANIM.passe: {
      // O passe usa o mesmo gesto do chute (ainda não existe o clipe de passe)
      const clipe = pePorLado(ctx) === "esq" ? CLIPE.chutarEsq : CLIPE.chutar;
      const dur = duracoes.get(clipe);
      if (dur === undefined) return reserva();
      const gesto = anim === ANIM.passe ? ANIMACAO.passeS : ANIMACAO.chuteS;
      const velocidade = limite(dur / gesto, 1, 4);
      return simples(clipe, anim === ANIM.chute, velocidade, Math.max(0, CONTATO_DO_CHUTE_S - ATRASO_DO_CONTATO_S * velocidade));
    }

    case ANIM.comemoracao:
      return tem(CLIPE.comemorar) ? simples(CLIPE.comemorar, true) : reserva();

    case ANIM.goleiroParado:
      return simples(repouso, true);
    case ANIM.goleiroComBola:
      return simples(repouso, false); // ainda não existe o clipe de goleiro com a bola

    case ANIM.goleiroMergulhoEsq:
    case ANIM.goleiroMergulhoDir: {
      if (ctx.bola && ctx.bola.y >= ALTURA_DA_DEFESA_ALTA_M && tem(CLIPE.gkDefesaAlta)) return simples(CLIPE.gkDefesaAlta, true, ESCALA_DA_DEFESA_ALTA);
      // No servidor "esquerda" é o lado -Z do campo. De frente para +X a esquerda do goleiro é -Z; de frente para -X é o contrário.
      const esquerdaDoMundoEhEsquerdaDele = Math.cos(ctx.dir) >= 0;
      const pedeEsq = (anim === ANIM.goleiroMergulhoEsq) === esquerdaDoMundoEhEsquerdaDele;
      const clipe = pedeEsq ? CLIPE.gkMergulhoEsq : CLIPE.gkMergulhoDir;
      return tem(clipe) ? simples(clipe, true, ESCALA_DO_MERGULHO) : reserva();
    }

    // Ainda sem animação própria: carrinho, queda, cabeceio, cobrança e recepção ficam no repouso
    default:
      return reserva();
  }
}

// --- rosto -----------------------------------------------------------------------------------------------------------------

/** A expressão do rosto que o estado pede. `segura`: fica no último quadro enquanto o estado durar (senão toca uma vez). */
export function expressaoDoEstado(anim: number): { expressao: number; segura: boolean } | null {
  switch (anim) {
    case ANIM.comemoracao:
      return { expressao: EXPRESSAO.felicidade, segura: true };
    case ANIM.queda:
    case ANIM.carrinho:
      return { expressao: EXPRESSAO.dor, segura: true };
    case ANIM.chute:
    case ANIM.passe:
    case ANIM.goleiroMergulhoEsq:
    case ANIM.goleiroMergulhoDir:
      return { expressao: EXPRESSAO.forca, segura: false };
    default:
      return null;
  }
}

export interface QuadroDoRosto {
  /** A linha do atlas (expressão). */
  anim: number;
  /** A coluna dentro do rosto, de 0 a 4. */
  quadro: number;
}

/** Pisca sozinho (a cada 2,2 s a 4,7 s, sorteado) e mostra a expressão que o estado pede. Um por jogador. */
export class ControladorDeRosto {
  private expressao: { anim: number; t: number; segura: boolean } | null = null;
  private estado = -1;
  private espera: number;

  constructor(private readonly sorteio: () => number = Math.random) {
    this.espera = 1 + this.sorteio() * 2.5;
  }

  atualizar(dt: number, anim: number): QuadroDoRosto {
    if (anim !== this.estado) {
      this.estado = anim;
      const e = expressaoDoEstado(anim);
      if (e) this.expressao = { anim: e.expressao, t: 0, segura: e.segura };
      else if (this.expressao?.segura) this.expressao = null; // saiu do estado que segurava a expressão
    }

    if (this.expressao) {
      this.expressao.t += dt;
      const q = Math.floor(this.expressao.t * FPS_DO_ROSTO);
      if (q < QUADROS_POR_EXPRESSAO) return { anim: this.expressao.anim, quadro: q };
      if (this.expressao.segura) return { anim: this.expressao.anim, quadro: QUADROS_POR_EXPRESSAO - 1 };
      this.expressao = null;
    }

    this.espera -= dt;
    if (this.espera <= 0) {
      this.expressao = { anim: EXPRESSAO.piscarOsDois, t: 0, segura: false };
      this.espera = 2.2 + this.sorteio() * 2.5;
    }
    return { anim: EXPRESSAO.piscarUmOlho, quadro: 0 };
  }
}
