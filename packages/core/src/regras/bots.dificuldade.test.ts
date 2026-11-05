import { describe, expect, it } from "vitest";
import { BOT, type Dificuldade } from "../constantes";
import { simularBots, simularDriblador } from "./simulacao";

// G2: a dificuldade tem que ser sentida. Estes testes jogam partidas curtas com semente fixa e conferem a ordem Fácil < Médio < Difícil.

const NIVEIS: Dificuldade[] = ["facil", "medio", "dificil"];
const SEMENTES = [1, 7920, 15839];
const O = { segundos: 180 };

describe("dificuldade dos bots: números", () => {
  it("quanto mais difícil, mais rápido, mais perto o bote, mais bote e mais antecipação; a reação cai e o erro cai", () => {
    for (const campo of ["velocidade", "chanceBote", "alcanceBote", "antecipacaoS", "miraBoteS"] as const) {
      const [f, m, d] = NIVEIS.map((n) => BOT[campo][n]) as [number, number, number];
      expect(f, campo).toBeLessThanOrEqual(m);
      expect(m, campo).toBeLessThanOrEqual(d);
      expect(f, campo).toBeLessThan(d);
    }
    // Quantos bots pressionam não diminui com a dificuldade (hoje é 1 nos três: a calibração da G2 mostrou que 2 deixava o Difícil injusto)
    expect(BOT.pressionam.facil).toBeLessThanOrEqual(BOT.pressionam.medio);
    expect(BOT.pressionam.medio).toBeLessThanOrEqual(BOT.pressionam.dificil);
    for (const campo of ["reacaoS", "erroGraus"] as const) {
      const [f, m, d] = NIVEIS.map((n) => BOT[campo][n]) as [number, number, number];
      expect(f, campo).toBeGreaterThan(m);
      expect(m, campo).toBeGreaterThan(d);
    }
  });

  it("o alcance do bote do bot cabe no avanço do bote (2,25 m): além disso o bote não adianta", () => {
    expect(BOT.alcanceBote.dificil).toBeLessThanOrEqual(2.25);
  });
});

describe("dificuldade dos bots: efeito no jogo", () => {
  const perdasPorMinuto = (dif: Dificuldade): number => {
    let perdas = 0;
    let bolaS = 0;
    for (const s of SEMENTES) {
      const r = simularDriblador(dif, s, O);
      perdas += r.desarmado;
      bolaS += r.comBolaS;
    }
    return (perdas * 60) / Math.max(1, bolaS);
  };

  it("o driblador de mentira perde a bola cada vez mais conforme a dificuldade, e Difícil pega a bola bem mais que Fácil", () => {
    const [f, m, d] = NIVEIS.map(perdasPorMinuto) as [number, number, number];
    expect(m).toBeGreaterThan(f * 1.5);
    expect(d).toBeGreaterThan(m * 1.3);
    // E nenhum nível é absurdo (a bola não troca de mão a cada segundo)
    expect(d).toBeLessThan(80);
  });

  it("o desarme dos bots funciona: em Médio e Difícil eles tomam a bola e acertam mais da metade dos botes", () => {
    for (const dif of ["medio", "dificil"] as const) {
      let tentativas = 0;
      let acertos = 0;
      for (const s of SEMENTES) {
        const r = simularBots(dif, dif, s, O);
        tentativas += r.botes[0] + r.botes[1] + r.carrinhos[0] + r.carrinhos[1];
        acertos += r.desarmesBote[0] + r.desarmesBote[1] + r.desarmesCarrinho[0] + r.desarmesCarrinho[1];
      }
      expect(tentativas, dif).toBeGreaterThan(30);
      expect(acertos / tentativas, dif).toBeGreaterThan(0.4);
    }
  });

  it("Difícil ganha de Fácil com folga e de Médio no geral (cada time com a sua dificuldade)", () => {
    const saldo = (a: Dificuldade, b: Dificuldade): number => {
      let s = 0;
      for (const sem of SEMENTES) {
        const r = simularBots(a, b, sem, O);
        s += r.gols[0] - r.gols[1];
      }
      return s;
    };
    expect(saldo("dificil", "facil")).toBeGreaterThan(8);
    expect(saldo("dificil", "medio")).toBeGreaterThan(0);
    expect(saldo("medio", "facil")).toBeGreaterThan(0);
  });

  it("mesma semente, mesmo resultado (os bots são previsíveis para os testes)", () => {
    const a = simularBots("medio", "dificil", 42, O);
    const b = simularBots("medio", "dificil", 42, O);
    expect(a).toEqual(b);
    expect(simularDriblador("dificil", 42, O)).toEqual(simularDriblador("dificil", 42, O));
  });
});
