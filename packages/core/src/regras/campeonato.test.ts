import { describe, expect, it } from "vitest";
import { CONFIG_PADRAO } from "../protocolo/config";
import type { VagaElenco } from "../protocolo/mensagens";
import { Campeonato, PONTOS, resultadoDaPartida, type ResultadoDaPartida } from "./campeonato";

const jogo = (casa: string, visitante: string, placar: [number, number], jogadores: ResultadoDaPartida["jogadores"] = []): ResultadoDaPartida => ({ casa, visitante, placar, jogadores });

describe("Campeonato: tabela de clubes", () => {
  it("vitória vale 3, empate 1 e derrota 0", () => {
    const c = new Campeonato();
    c.registrar(jogo("fla", "pal", [2, 0]));
    c.registrar(jogo("fla", "pal", [1, 1]));
    c.registrar(jogo("pal", "fla", [3, 0]));
    const t = c.tabelaDeClubes();
    const fla = t.find((l) => l.clube === "fla")!;
    const pal = t.find((l) => l.clube === "pal")!;
    expect(fla).toMatchObject({ pontos: PONTOS.vitoria + PONTOS.empate, jogos: 3, vitorias: 1, empates: 1, derrotas: 1, golsPro: 3, golsContra: 4, saldo: -1 });
    expect(pal).toMatchObject({ pontos: PONTOS.vitoria + PONTOS.empate, jogos: 3, vitorias: 1, empates: 1, derrotas: 1, golsPro: 4, golsContra: 3, saldo: 1 });
    expect(c.partidas).toBe(3);
  });

  it("ordena por pontos, depois vitórias, saldo, gols pró, e por id no fim", () => {
    const c = new Campeonato();
    c.registrar(jogo("a", "b", [1, 0])); // a 3 pts, saldo +1
    c.registrar(jogo("c", "d", [5, 0])); // c 3 pts, saldo +5
    c.registrar(jogo("e", "f", [1, 1])); // e e f 1 pt
    expect(c.tabelaDeClubes().map((l) => l.clube)).toEqual(["c", "a", "e", "f", "b", "d"]);
  });

  it("quem ainda não jogou não aparece e zerar limpa tudo", () => {
    const c = new Campeonato();
    expect(c.tabelaDeClubes()).toEqual([]);
    c.registrar(jogo("a", "b", [0, 0]));
    c.zerar();
    expect(c.partidas).toBe(0);
    expect(c.tabelaDeClubes()).toEqual([]);
    expect(c.ranking()).toEqual([]);
  });

  it("a mensagem não deixa mexer no estado por dentro", () => {
    const c = new Campeonato();
    c.registrar(jogo("a", "b", [1, 0]));
    const m = c.mensagem();
    m.clubes[0]!.pontos = 999;
    expect(c.tabelaDeClubes()[0]!.pontos).toBe(PONTOS.vitoria);
  });
});

describe("Campeonato: jogadores", () => {
  it("soma as estatísticas entre partidas e reconhece o apelido sem ligar para maiúscula", () => {
    const c = new Campeonato();
    c.registrar(jogo("a", "b", [2, 1], [{ apelido: "Samuel", time: 0, gols: 2, assistencias: 0, desarmes: 1 }, { apelido: "Duda", time: 1, gols: 1, assistencias: 0, desarmes: 0 }]));
    c.registrar(jogo("a", "b", [0, 1], [{ apelido: "samuel", time: 0, gols: 0, assistencias: 1, desarmes: 2 }]));
    const r = c.ranking();
    expect(r[0]).toMatchObject({ apelido: "samuel", partidas: 2, vitorias: 1, gols: 2, assistencias: 1, desarmes: 3 });
    expect(r[1]).toMatchObject({ apelido: "Duda", partidas: 1, vitorias: 0, gols: 1 });
  });

  it("vitória do jogador depende do time dele", () => {
    const c = new Campeonato();
    c.registrar(jogo("a", "b", [0, 3], [{ apelido: "V", time: 1, gols: 0, assistencias: 0, desarmes: 0 }, { apelido: "C", time: 0, gols: 0, assistencias: 0, desarmes: 0 }]));
    expect(c.ranking().find((l) => l.apelido === "V")!.vitorias).toBe(1);
    expect(c.ranking().find((l) => l.apelido === "C")!.vitorias).toBe(0);
  });

  it("empata em gols? desempata por assistências, desarmes e nome", () => {
    const c = new Campeonato();
    c.registrar(
      jogo("a", "b", [0, 0], [
        { apelido: "Zeca", time: 0, gols: 1, assistencias: 0, desarmes: 0 },
        { apelido: "Ana", time: 0, gols: 1, assistencias: 0, desarmes: 0 },
        { apelido: "Beto", time: 0, gols: 1, assistencias: 2, desarmes: 0 },
      ]),
    );
    expect(c.ranking().map((l) => l.apelido)).toEqual(["Beto", "Ana", "Zeca"]);
  });
});

describe("resultadoDaPartida", () => {
  const vaga = (slot: number, time: 0 | 1, nome: string, humano: boolean): VagaElenco => ({ slot, time, nome, numero: slot, humano, goleiro: false });

  it("conta só humanos e não conta gol contra como gol do jogador", () => {
    const r = resultadoDaPartida({
      config: { ...CONFIG_PADRAO, casa: "flamengo", visitante: "palmeiras" },
      elenco: [vaga(0, 0, "Samuel", true), vaga(1, 0, "Bot Um", false), vaga(11, 1, "Duda", true)],
      placar: [1, 1],
      gols: [
        { slot: 0, contra: false },
        { slot: 11, contra: true }, // Duda fez contra: o gol é do time da Casa
        { slot: 1, contra: false },
      ],
      assistenciasPorSlot: new Map([[0, 2]]),
      desarmesPorSlot: new Map([[11, 3]]),
    });
    expect(r.casa).toBe("flamengo");
    expect(r.jogadores).toEqual([
      { apelido: "Samuel", time: 0, gols: 1, assistencias: 2, desarmes: 0 },
      { apelido: "Duda", time: 1, gols: 0, assistencias: 0, desarmes: 3 },
    ]);
  });
});
