import { describe, expect, it } from "vitest";
import type { EventoJogo } from "@b3d/core";
import { Som, intensidadeDaTorcida, sonsDoEvento } from "./som";

const nomes = (e: EventoJogo): string[] => sonsDoEvento(e).map((p) => p.som);

describe("sonsDoEvento", () => {
  it("chute forte é mais alto que chute fraco", () => {
    const fraco = sonsDoEvento({ tipo: "chute", dados: { slot: 1, forca: 0.1 } })[0]!;
    const forte = sonsDoEvento({ tipo: "chute", dados: { slot: 1, forca: 1 } })[0]!;
    expect(fraco.som).toBe("chute");
    expect(forte.volume).toBeGreaterThan(fraco.volume);
    expect(forte.volume).toBeLessThanOrEqual(1);
    expect(fraco.volume).toBeGreaterThanOrEqual(0.3);
  });

  it("passe, bote e carrinho", () => {
    expect(nomes({ tipo: "passe", dados: { de: 1, alto: false } })).toEqual(["passe"]);
    expect(nomes({ tipo: "roubo", dados: { slot: 1, de: 2, jeito: "bote" } })).toEqual(["bote"]);
    const carrinho = sonsDoEvento({ tipo: "roubo", dados: { slot: 1, de: 2, jeito: "carrinho" } })[0]!;
    const bote = sonsDoEvento({ tipo: "roubo", dados: { slot: 1, de: 2, jeito: "bote" } })[0]!;
    expect(carrinho.volume).toBeGreaterThan(bote.volume);
  });

  it("cada motivo de apito tem o seu apito", () => {
    expect(nomes({ tipo: "apito", dados: { motivo: "fim" } })).toEqual(["apitoFinal"]);
    expect(nomes({ tipo: "apito", dados: { motivo: "falta" } })).toEqual(["apito"]);
    expect(nomes({ tipo: "apito", dados: { motivo: "inicio" } })).toEqual(["apitoCurto"]);
    expect(nomes({ tipo: "apito", dados: { motivo: "reinicio" } })).toEqual(["apitoCurto"]);
  });

  it("gol explode; trave e defesa espalmada fazem 'uuuh'; defesa encaixada não", () => {
    expect(nomes({ tipo: "gol", dados: { time: 0, slot: 1, contra: false, placar: [1, 0] } })).toEqual(["gol"]);
    expect(nomes({ tipo: "trave", dados: { x: 0, y: 1, z: 0 } })).toContain("uuh");
    expect(nomes({ tipo: "defesa", dados: { slot: 1, encaixou: false } })).toContain("uuh");
    expect(nomes({ tipo: "defesa", dados: { slot: 1, encaixou: true } })).not.toContain("uuh");
  });

  it("eventos sem som não tocam nada", () => {
    expect(nomes({ tipo: "saida", dados: { time: 0 } })).toEqual([]);
    expect(nomes({ tipo: "lateral", dados: { time: 0, x: 0, z: 0 } })).toEqual([]);
    expect(nomes({ tipo: "fim", dados: { placar: [0, 0] } })).toEqual([]);
  });
});

describe("intensidadeDaTorcida", () => {
  it("no meio do campo é zero e junto do gol é 1, nos dois lados", () => {
    expect(intensidadeDaTorcida(0, 100)).toBe(0);
    expect(intensidadeDaTorcida(50, 100)).toBe(1);
    expect(intensidadeDaTorcida(-50, 100)).toBe(1);
  });

  it("sobe aos poucos e só nos últimos ~32% do campo", () => {
    expect(intensidadeDaTorcida(10, 100)).toBe(0);
    expect(intensidadeDaTorcida(40, 100)).toBeGreaterThan(0);
    expect(intensidadeDaTorcida(45, 100)).toBeGreaterThan(intensidadeDaTorcida(40, 100));
  });
});

describe("Som (sem navegador)", () => {
  // O teste roda no Node, sem localStorage nem AudioContext: o som tem que se comportar como "mudo" sem quebrar
  it("telão principal não fica mudo; extra fica mudo até a pessoa ligar", () => {
    const s = new Som();
    s.definirPrincipal(true);
    expect(s.mudo).toBe(false);
    s.definirPrincipal(false);
    expect(s.mudo).toBe(true);
  });

  it("sem áudio no navegador, tocar não dá erro", () => {
    const s = new Som();
    expect(() => {
      s.destravar();
      s.evento({ tipo: "gol", dados: { time: 0, slot: 1, contra: false, placar: [1, 0] } });
      s.ambiente(40, 100);
      s.parar();
    }).not.toThrow();
  });

  it("depois de a pessoa escolher, a escolha vale mesmo se o telão deixar de ser principal", () => {
    const s = new Som();
    s.definirPrincipal(false);
    expect(s.mudo).toBe(true);
    s.alternarMudo(); // liga
    expect(s.mudo).toBe(false);
    s.definirPrincipal(true);
    expect(s.mudo).toBe(false);
  });
});
