import { describe, expect, it } from "vitest";
import type { Fim, VagaElenco } from "@b3d/core";
import { golsPorTime, textoDaLinha, vencedor } from "./fim";

const vaga = (slot: number, time: 0 | 1, nome: string): VagaElenco => ({ slot, time, nome, numero: slot, goleiro: false, humano: true });

const elenco = [vaga(0, 0, "Samuel"), vaga(1, 0, "Caio"), vaga(11, 1, "Duda")];

const fim = (gols: Fim["gols"], placar: [number, number]): Fim => ({
  t: "fim",
  placar,
  gols,
  destaques: { artilheiro: null, assistencias: null, desarmes: null },
});

describe("golsPorTime", () => {
  it("separa os gols por time e junta os do mesmo jogador", () => {
    const f = fim(
      [
        { slot: 0, tick: 100, contra: false },
        { slot: 11, tick: 200, contra: false },
        { slot: 0, tick: 300, contra: false },
        { slot: 1, tick: 400, contra: false },
      ],
      [3, 1],
    );
    const [casa, visitante] = golsPorTime(f, elenco);
    expect(casa.map(textoDaLinha)).toEqual(["Samuel ×2", "Caio"]);
    expect(visitante.map(textoDaLinha)).toEqual(["Duda"]);
  });

  it("gol contra vai para o time adversário do jogador e fica marcado", () => {
    const f = fim([{ slot: 1, tick: 100, contra: true }], [0, 1]);
    const [casa, visitante] = golsPorTime(f, elenco);
    expect(casa).toEqual([]);
    expect(visitante.map(textoDaLinha)).toEqual(["Caio (contra)"]);
  });

  it("sem gols, as duas listas ficam vazias; slot desconhecido é ignorado", () => {
    expect(golsPorTime(fim([], [0, 0]), elenco)).toEqual([[], []]);
    expect(golsPorTime(fim([{ slot: 99, tick: 1, contra: false }], [1, 0]), elenco)).toEqual([[], []]);
  });
});

describe("vencedor", () => {
  it("Casa, Visitante ou empate", () => {
    expect(vencedor(fim([], [2, 1]))).toBe(0);
    expect(vencedor(fim([], [0, 3]))).toBe(1);
    expect(vencedor(fim([], [1, 1]))).toBeNull();
  });
});
