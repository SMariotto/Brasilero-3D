import { describe, expect, it } from "vitest";
import { criarRng } from "./rng";

describe("criarRng (mulberry32)", () => {
  it("mesma semente dá sempre a mesma sequência", () => {
    const a = criarRng(12345);
    const b = criarRng(12345);
    const seqA = Array.from({ length: 20 }, () => a.proximo());
    const seqB = Array.from({ length: 20 }, () => b.proximo());
    expect(seqA).toEqual(seqB);
  });

  it("sementes diferentes dão sequências diferentes", () => {
    const a = criarRng(1);
    const b = criarRng(2);
    expect(a.proximo()).not.toBe(b.proximo());
  });

  it("valores conhecidos da semente 1 não mudam (trava a implementação)", () => {
    const r = criarRng(1);
    expect(r.proximo()).toBeCloseTo(0.6270739405881613, 12);
    expect(r.proximo()).toBeCloseTo(0.002735721180215478, 12);
  });

  it("proximo fica em [0, 1)", () => {
    const r = criarRng(99);
    for (let i = 0; i < 10000; i++) {
      const v = r.proximo();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("entre e inteiro respeitam os limites", () => {
    const r = criarRng(7);
    for (let i = 0; i < 2000; i++) {
      const e = r.entre(-3, 5);
      expect(e).toBeGreaterThanOrEqual(-3);
      expect(e).toBeLessThan(5);
      const n = r.inteiro(2, 6);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThan(6);
    }
  });

  it("sorteio(0) nunca e sorteio(1) sempre", () => {
    const r = criarRng(3);
    for (let i = 0; i < 500; i++) {
      expect(r.sorteio(0)).toBe(false);
      expect(r.sorteio(1)).toBe(true);
    }
  });

  it("escolher devolve item da lista e falha em lista vazia", () => {
    const r = criarRng(5);
    const lista = ["a", "b", "c"];
    for (let i = 0; i < 100; i++) expect(lista).toContain(r.escolher(lista));
    expect(() => r.escolher([])).toThrow();
  });

  it("normal tem média perto de 0 e desvio perto de 1", () => {
    const r = criarRng(11);
    const n = 20000;
    let soma = 0;
    let somaQ = 0;
    for (let i = 0; i < n; i++) {
      const v = r.normal();
      soma += v;
      somaQ += v * v;
    }
    const media = soma / n;
    const desvio = Math.sqrt(somaQ / n - media * media);
    expect(Math.abs(media)).toBeLessThan(0.03);
    expect(desvio).toBeGreaterThan(0.95);
    expect(desvio).toBeLessThan(1.05);
  });
});
