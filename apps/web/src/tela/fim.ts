import type { Fim, VagaElenco } from "@b3d/core";

// Resumo da tela de Fim (F7): quem fez os gols de cada time e quem venceu. Puro, com teste.

export interface LinhaDeGol {
  nome: string;
  quantidade: number;
  /** O gol foi contra (o jogador é do outro time). */
  contra: boolean;
}

/** Os gols de cada time (Casa, Visitante): um gol contra conta para o time adversário do jogador. */
export function golsPorTime(f: Fim, elenco: VagaElenco[]): [LinhaDeGol[], LinhaDeGol[]] {
  const times: [Map<string, LinhaDeGol>, Map<string, LinhaDeGol>] = [new Map(), new Map()];
  for (const g of f.gols) {
    const vaga = elenco.find((v) => v.slot === g.slot);
    if (!vaga) continue;
    const timeDoGol = g.contra ? (vaga.time === 0 ? 1 : 0) : vaga.time;
    const chave = `${g.slot}:${g.contra ? "c" : "n"}`;
    const linha = times[timeDoGol].get(chave);
    if (linha) linha.quantidade++;
    else times[timeDoGol].set(chave, { nome: vaga.nome, quantidade: 1, contra: g.contra });
  }
  return [[...times[0].values()], [...times[1].values()]];
}

/** Texto de uma linha: "Samuel", "Samuel ×2", "Caio (contra)". */
export function textoDaLinha(l: LinhaDeGol): string {
  return `${l.nome}${l.quantidade > 1 ? ` ×${l.quantidade}` : ""}${l.contra ? " (contra)" : ""}`;
}

/** 0 = Casa, 1 = Visitante, `null` = empate. */
export function vencedor(f: Fim): 0 | 1 | null {
  const [a, b] = f.placar;
  return a === b ? null : a > b ? 0 : 1;
}
