import { ANIM, ANIMACAO, RECEPCAO, RECEPCAO_PASSE } from "@b3d/core";
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
  passar: "passar",
  passarEsq: "passar_esq",
  dominio: "dominio",
  dominioEsq: "dominio_esq",
  dominioPuxar: "dominio_puxar",
  dominioPuxarEsq: "dominio_puxar_esq",
} as const;

export const TODOS_OS_CLIPES: string[] = Object.values(CLIPE);

/** Os clipes que ficam repetindo (os outros tocam uma vez e voltam para `parado`, ou `gk_parado` no goleiro). */
export const CLIPES_COM_LOOP: ReadonlySet<string> = new Set([CLIPE.parado, CLIPE.correr, CLIPE.gkParado]);

/** Tempo (s) da troca entre dois clipes. */
export const CROSSFADE_S = 0.12;

// --- corrida ---------------------------------------------------------------------------------------------------------------

/**
 * Velocidade (m/s do jogo, com o boneco em 1,8 m) em que o pé de apoio do clipe `correr` anda para trás na velocidade do chão, a 1x.
 * Medida no clipe (0,667 s, passada com fase de voo): a mediana da velocidade do pé de apoio em relação ao quadril é 1,019 m/s no
 * rig (0,44 m de altura) e o boneco é ampliado ×4,10: 4,18 m/s. A 7,6 m/s (6,84 com a bola) isso pede ×1,82 (×1,64), abaixo do
 * teto: na máxima o pé não desliza. O teto é só segurança; o piso evita pernas em câmera lenta (abaixo de 2,09 m/s o clipe toca a
 * ×0,5 e o pé desliza um pouco ao arrancar e ao parar).
 */
export const VELOCIDADE_DA_CORRIDA_GRAVADA = 4.18;
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

/** No clipe `passar` (16 quadros, 0,5 s) o pé toca a bola no quadro 8 (LEIA-ME do rig). */
export const CONTATO_DO_PASSE_S = 8 / 30;
/** Passe para a esquerda do corpo (seno do ângulo da bola em relação à frente, a partir deste valor, ~15°) usa o pé esquerdo. */
export const LADO_MINIMO_DO_PASSE = 0.26;

// --- recepção (domínio) ----------------------------------------------------------------------------------------------------

/** No clipe `dominio` (22 quadros, 0,7 s) o pé toca a bola no quadro 8, no ponto mais alto. */
export const CONTATO_DO_DOMINIO_S = 8 / 30;
/** No `dominio_puxar` (24 quadros, 0,77 s) o pé toca a bola entre os quadros 7 e 11 (pé esticado para o lado); usa o do meio. */
export const CONTATO_DO_DOMINIO_PUXAR_S = 9 / 30;
/** Bola a mais disto (m) do lado do corpo: o pé estica para o lado e puxa a bola (`dominio_puxar`); mais de frente, só amortece (`dominio`). */
export const LATERAL_DO_DOMINIO_PUXAR_M = 0.5;
/**
 * O estado de recepção dura 0,2 s (recepção comum) ou 0,3 s (de passe) no servidor, e o snapshot não diz qual: o clipe toca para caber
 * na média, o que dá ~×3. Se parecer rápido demais, o caminho é o servidor segurar o estado por mais tempo (`RECEPCAO.duracaoS`).
 */
export const DURACAO_DA_RECEPCAO_S = (RECEPCAO.duracaoS + RECEPCAO_PASSE.duracaoS) / 2;

export interface ContextoDaAnimacao {
  goleiro: boolean;
  x: number;
  z: number;
  /** Direção do corpo, radianos a partir de +X (dirX = cos, dirZ = sin). */
  dir: number;
  vel: number;
  /** A bola neste instante; `vx` e `vz` (velocidade) só são usados para ver para onde vai o passe. */
  bola?: { x: number; y: number; z: number; vx?: number; vz?: number } | null;
}

/** Com que pé chuta: a bola à esquerda do corpo pede `chutar_esq`. O protocolo não diz o pé, então decide pelo lado da bola. */
export function pePorLado(ctx: Pick<ContextoDaAnimacao, "x" | "z" | "dir" | "bola">): "esq" | "dir" {
  if (!ctx.bola) return "dir";
  // O vetor para a esquerda do jogador, no chão, é (sen dir, -cos dir) (de frente para +X, a esquerda é -Z)
  const lado = Math.sin(ctx.dir) * (ctx.bola.x - ctx.x) - Math.cos(ctx.dir) * (ctx.bola.z - ctx.z);
  return lado > FOLGA_DO_PE_M ? "esq" : "dir";
}

/** O quanto a bola está para o lado do corpo, em metros: positivo é a esquerda do jogador, negativo a direita. */
export function lateralDaBola(ctx: Pick<ContextoDaAnimacao, "x" | "z" | "dir" | "bola">): number {
  if (!ctx.bola) return 0;
  return Math.sin(ctx.dir) * (ctx.bola.x - ctx.x) - Math.cos(ctx.dir) * (ctx.bola.z - ctx.z);
}

/** Com que pé passa: a bola que sai para a esquerda do corpo usa o pé esquerdo. Sem a velocidade da bola, o direito. */
export function pePorRumoDoPasse(ctx: Pick<ContextoDaAnimacao, "dir" | "bola">): "esq" | "dir" {
  const b = ctx.bola;
  if (!b || b.vx === undefined || b.vz === undefined) return "dir";
  const h = Math.hypot(b.vx, b.vz);
  if (h < 1) return "dir";
  const lado = (Math.sin(ctx.dir) * b.vx - Math.cos(ctx.dir) * b.vz) / h;
  return lado > LADO_MINIMO_DO_PASSE ? "esq" : "dir";
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

    case ANIM.chute: {
      const clipe = pePorLado(ctx) === "esq" ? CLIPE.chutarEsq : CLIPE.chutar;
      const dur = duracoes.get(clipe);
      if (dur === undefined) return reserva();
      const velocidade = limite(dur / ANIMACAO.chuteS, 1, 4);
      return simples(clipe, true, velocidade, Math.max(0, CONTATO_DO_CHUTE_S - ATRASO_DO_CONTATO_S * velocidade));
    }

    case ANIM.passe: {
      // O pé é o do lado para onde a bola sai. Com o modelo antigo (sem o clipe de passe), vale o gesto do chute.
      const esq = pePorRumoDoPasse(ctx) === "esq";
      const dur = duracoes.get(esq ? CLIPE.passarEsq : CLIPE.passar);
      if (dur !== undefined) {
        const velocidade = limite(dur / ANIMACAO.passeS, 1, 4);
        return simples(esq ? CLIPE.passarEsq : CLIPE.passar, true, velocidade, Math.max(0, CONTATO_DO_PASSE_S - ATRASO_DO_CONTATO_S * velocidade));
      }
      const chutar = pePorLado(ctx) === "esq" ? CLIPE.chutarEsq : CLIPE.chutar;
      const durChute = duracoes.get(chutar);
      if (durChute === undefined) return reserva();
      const velocidade = limite(durChute / ANIMACAO.passeS, 1, 4);
      return simples(chutar, false, velocidade, Math.max(0, CONTATO_DO_CHUTE_S - ATRASO_DO_CONTATO_S * velocidade));
    }

    case ANIM.recepcao: {
      // O goleiro não tem clipe de recepção (fica agachado)
      if (ctx.goleiro) return reserva();
      // A bola ao lado do corpo: o pé estica para o lado e puxa (`dominio_puxar`); de frente, só amortece (`dominio`). O pé é o do lado da bola.
      const lateral = lateralDaBola(ctx);
      const puxar = Math.abs(lateral) >= LATERAL_DO_DOMINIO_PUXAR_M;
      const esq = lateral > FOLGA_DO_PE_M;
      const clipe = puxar ? (esq ? CLIPE.dominioPuxarEsq : CLIPE.dominioPuxar) : esq ? CLIPE.dominioEsq : CLIPE.dominio;
      const dur = duracoes.get(clipe);
      if (dur === undefined) return reserva();
      const velocidade = limite(dur / DURACAO_DA_RECEPCAO_S, 1, 4);
      const contato = puxar ? CONTATO_DO_DOMINIO_PUXAR_S : CONTATO_DO_DOMINIO_S;
      return simples(clipe, true, velocidade, Math.max(0, contato - ATRASO_DO_CONTATO_S * velocidade));
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

    // Ainda sem animação própria: carrinho, queda, cabeceio e cobrança ficam no repouso
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
