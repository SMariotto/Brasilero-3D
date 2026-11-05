// Gerador de números aleatórios com semente (mulberry32). Todo sorteio do jogo usa isto (SPEC 6.9),
// para os testes darem sempre o mesmo resultado.

export interface Rng {
  /** Número em [0, 1). */
  proximo(): number;
  /** Número em [min, max). */
  entre(min: number, max: number): number;
  /** Inteiro em [min, maxExclusivo). */
  inteiro(min: number, maxExclusivo: number): number;
  /** Verdadeiro com probabilidade `p` (0 a 1). */
  sorteio(p: number): boolean;
  /** Um item qualquer da lista (a lista não pode ser vazia). */
  escolher<T>(lista: readonly T[]): T;
  /** Aproximação de normal (soma de 3 uniformes), média 0, desvio 1. */
  normal(): number;
}

export function criarRng(semente: number): Rng {
  let estado = semente >>> 0;

  const proximo = (): number => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    proximo,
    entre: (min, max) => min + proximo() * (max - min),
    inteiro: (min, maxExclusivo) => min + Math.floor(proximo() * (maxExclusivo - min)),
    sorteio: (p) => proximo() < p,
    escolher: <T>(lista: readonly T[]): T => {
      if (lista.length === 0) throw new Error("escolher: lista vazia");
      return lista[Math.floor(proximo() * lista.length)] as T;
    },
    // Soma de 3 uniformes em [0,1): média 1,5 e variância 3/12 = 0,25 (desvio 0,5), então (soma - 1,5) * 2 tem desvio 1.
    normal: () => (proximo() + proximo() + proximo() - 1.5) * 2,
  };
}
