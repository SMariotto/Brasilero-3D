import { ANIM, JOGADOR } from "@b3d/core";

// Que animação do modelo 3D tocar para cada estado do snapshot (ARQUITETURA 6.2). Lógica pura, sem Three.js, com teste.
// Os nomes são os do `jogador.glb` que o script do Blender monta.

export const NOME_DO_CLIPE: Record<number, string> = {
  [ANIM.parado]: "Parado",
  [ANIM.corrida]: "Corrida",
  [ANIM.chute]: "Chute",
  [ANIM.passe]: "Passe",
  [ANIM.carrinho]: "Carrinho",
  [ANIM.queda]: "Queda",
  [ANIM.comemoracao]: "Comemoracao",
  [ANIM.goleiroParado]: "GoleiroParado",
  [ANIM.goleiroMergulhoEsq]: "GoleiroMergulhoEsq",
  [ANIM.goleiroMergulhoDir]: "GoleiroMergulhoDir",
  [ANIM.cabeceio]: "Cabeceio",
  [ANIM.goleiroComBola]: "GoleiroComBola",
  [ANIM.cobranca]: "Cobranca",
  [ANIM.recepcao]: "Recepcao",
};

/** Todos os nomes que o GLB deveria ter, na ordem do protocolo. */
export const TODOS_OS_CLIPES: string[] = Object.values(NOME_DO_CLIPE);

/** Se o clipe pedido não existe no modelo, tenta estes, em ordem; no fim, `Parado`. */
const RESERVAS: Record<string, string[]> = {
  GoleiroComBola: ["GoleiroParado"],
  Cobranca: ["Parado"],
  Recepcao: ["Parado"],
  Cabeceio: ["Chute"],
  Passe: ["Chute"],
  Carrinho: ["Queda"],
  Comemoracao: ["Parado"],
  GoleiroMergulhoEsq: ["GoleiroParado"],
  GoleiroMergulhoDir: ["GoleiroMergulhoEsq", "GoleiroParado"],
  GoleiroParado: ["Parado"],
};

/** O clipe a tocar para a animação `anim` do snapshot, ou `null` se o modelo não tem nem a reserva. */
export function clipeDaAnimacao(anim: number, disponiveis: ReadonlySet<string>): string | null {
  const nome = NOME_DO_CLIPE[anim] ?? "Parado";
  if (disponiveis.has(nome)) return nome;
  for (const r of RESERVAS[nome] ?? []) if (disponiveis.has(r)) return r;
  if (disponiveis.has("Parado")) return "Parado";
  return null;
}

/** Os clipes que tocam uma vez e ficam na última pose (os outros ficam repetindo). */
const UMA_VEZ = new Set(["Chute", "Passe", "Carrinho", "Queda", "GoleiroMergulhoEsq", "GoleiroMergulhoDir", "Cabeceio", "Cobranca"]);

export function repete(clipe: string): boolean {
  return !UMA_VEZ.has(clipe);
}

/** Velocidade (m/s) em que a animação de corrida do Mixamo foi gravada, a ~1x. O passo acompanha a velocidade real. */
export const VELOCIDADE_DA_CORRIDA_GRAVADA = 4.5;

/** Quanto tempo (s) um chute, passe ou cabeceio deve levar na tela, por mais longa que seja a animação gravada. */
export const DURACAO_DO_GESTO_S = 0.45;

/**
 * Velocidade de reprodução do clipe. Na corrida acompanha a velocidade real do jogador (não patina nem "moonwalk");
 * chute, passe e cabeceio são acelerados para caberem no tempo do gesto no servidor; os outros tocam em 1.
 */
export function velocidadeDoClipe(clipe: string, vel: number, duracaoDoClipe = 0): number {
  if (clipe === "Corrida") {
    const k = vel / VELOCIDADE_DA_CORRIDA_GRAVADA;
    return Math.max(0.5, Math.min(JOGADOR.velocidadeMax / VELOCIDADE_DA_CORRIDA_GRAVADA + 0.3, k));
  }
  if ((clipe === "Chute" || clipe === "Passe" || clipe === "Cabeceio") && duracaoDoClipe > 0) {
    return Math.max(1, Math.min(3, duracaoDoClipe / DURACAO_DO_GESTO_S));
  }
  return 1;
}

/** Tempo da troca entre duas animações, em segundos. Curto nos chutes (têm que parecer instantâneos), maior nos outros. */
export function duracaoDoCrossfade(de: string | null, para: string): number {
  if (para === "Chute" || para === "Passe" || para === "Cabeceio" || para === "GoleiroMergulhoEsq" || para === "GoleiroMergulhoDir") return 0.06;
  if (de === "Corrida" && para === "Parado") return 0.2;
  return 0.15;
}
