import { NOMES_BOTS } from "../dados/index";
import type { Rng } from "../util/rng";
import type { VagaPartida } from "./tipos-partida";

/** Slot do goleiro de cada time: Casa usa 0 a 5 (0 é o goleiro) e o Visitante 6 a 11 (6 é o goleiro). */
export const slotDoGoleiro = (time: 0 | 1): number => time * 6;

/** Slot do jogador de linha de índice `i` (0 a 4) do time. */
export const slotDeLinha = (time: 0 | 1, i: number): number => time * 6 + 1 + i;

/** Nome fictício de bot: primeiro nome e, em metade das vezes, sobrenome (SPEC 9.5). Sem elenco real. */
export function nomeDeBot(rng: Rng, usados: Set<string>): string {
  for (let tentativa = 0; tentativa < 20; tentativa++) {
    const primeiro = rng.escolher(NOMES_BOTS.primeiros);
    const nome = rng.sorteio(0.5) ? `${primeiro} ${rng.escolher(NOMES_BOTS.sobrenomes)}` : primeiro;
    if (!usados.has(nome)) {
      usados.add(nome);
      return nome;
    }
  }
  return `Bot ${usados.size + 1}`;
}

/**
 * Completa o elenco (SPEC 4.1): os humanos já têm vaga; o resto vira bot. Cada time ganha um goleiro (sempre bot) e
 * jogadores de linha até chegar a `n`. Os bots recebem número de camisa que ninguém do time usa e nome fictício.
 */
export function completarElenco(humanos: VagaPartida[], n: number, rng: Rng): VagaPartida[] {
  const elenco: VagaPartida[] = [];
  const nomes = new Set<string>(humanos.map((h) => h.nome));

  for (const time of [0, 1] as const) {
    const deles = humanos.filter((h) => h.time === time);
    const numeros = new Set<number>(deles.map((h) => h.numero));
    const numeroLivre = (preferido?: number): number => {
      if (preferido !== undefined && !numeros.has(preferido)) {
        numeros.add(preferido);
        return preferido;
      }
      for (;;) {
        const x = rng.inteiro(2, 30);
        if (!numeros.has(x)) {
          numeros.add(x);
          return x;
        }
      }
    };

    elenco.push({ slot: slotDoGoleiro(time), time, numero: numeroLivre(1), nome: nomeDeBot(rng, nomes), humano: false, goleiro: true });

    for (let i = 0; i < n; i++) {
      const slot = slotDeLinha(time, i);
      const humano = deles.find((h) => h.slot === slot);
      if (humano) elenco.push({ ...humano });
      else elenco.push({ slot, time, numero: numeroLivre(), nome: nomeDeBot(rng, nomes), humano: false, goleiro: false });
    }
  }
  return elenco;
}
