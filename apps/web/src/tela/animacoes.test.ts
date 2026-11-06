import { describe, expect, it } from "vitest";
import { ANIM, JOGADOR } from "@b3d/core";
import { TODOS_OS_CLIPES, VELOCIDADE_DA_CORRIDA_GRAVADA, clipeDaAnimacao, duracaoDoCrossfade, repete, velocidadeDoClipe } from "./animacoes";

const todos = new Set(TODOS_OS_CLIPES);

describe("clipeDaAnimacao", () => {
  it("cada animação do protocolo tem um clipe com nome próprio", () => {
    expect(TODOS_OS_CLIPES).toHaveLength(Object.keys(ANIM).length);
    expect(new Set(TODOS_OS_CLIPES).size).toBe(TODOS_OS_CLIPES.length);
    for (const id of Object.values(ANIM)) expect(clipeDaAnimacao(id, todos)).not.toBeNull();
  });

  it("com o modelo completo toca o clipe de mesmo nome", () => {
    expect(clipeDaAnimacao(ANIM.chute, todos)).toBe("Chute");
    expect(clipeDaAnimacao(ANIM.goleiroMergulhoDir, todos)).toBe("GoleiroMergulhoDir");
  });

  it("usa as reservas da ARQUITETURA 6.2 quando falta clipe", () => {
    const sem = (...nomes: string[]): Set<string> => new Set(TODOS_OS_CLIPES.filter((n) => !nomes.includes(n)));
    expect(clipeDaAnimacao(ANIM.goleiroComBola, sem("GoleiroComBola"))).toBe("GoleiroParado");
    expect(clipeDaAnimacao(ANIM.cobranca, sem("Cobranca"))).toBe("Parado");
    expect(clipeDaAnimacao(ANIM.goleiroMergulhoDir, sem("GoleiroMergulhoDir"))).toBe("GoleiroMergulhoEsq");
  });

  it("no pior caso cai em Parado, e sem nada devolve null", () => {
    expect(clipeDaAnimacao(ANIM.chute, new Set(["Parado"]))).toBe("Parado");
    expect(clipeDaAnimacao(ANIM.corrida, new Set(["Parado"]))).toBe("Parado");
    expect(clipeDaAnimacao(ANIM.corrida, new Set())).toBeNull();
  });

  it("id desconhecido vira Parado", () => {
    expect(clipeDaAnimacao(99, todos)).toBe("Parado");
  });
});

describe("velocidadeDoClipe", () => {
  it("a corrida acompanha a velocidade real (sem patinar)", () => {
    expect(velocidadeDoClipe("Corrida", VELOCIDADE_DA_CORRIDA_GRAVADA)).toBeCloseTo(1);
    expect(velocidadeDoClipe("Corrida", VELOCIDADE_DA_CORRIDA_GRAVADA * 1.5)).toBeCloseTo(1.5);
  });

  it("tem piso e teto", () => {
    expect(velocidadeDoClipe("Corrida", 0.1)).toBe(0.5);
    expect(velocidadeDoClipe("Corrida", JOGADOR.velocidadeMax * 3)).toBeLessThan(2.5);
  });

  it("chute longo é acelerado para caber no gesto; curto fica normal", () => {
    expect(velocidadeDoClipe("Chute", 0, 1.35)).toBeCloseTo(3);
    expect(velocidadeDoClipe("Chute", 0, 0.9)).toBeCloseTo(2);
    expect(velocidadeDoClipe("Passe", 0, 0.3)).toBe(1);
  });

  it("os outros clipes tocam em velocidade normal", () => {
    expect(velocidadeDoClipe("Chute", 7)).toBe(1);
    expect(velocidadeDoClipe("Queda", 7, 2)).toBe(1);
    expect(velocidadeDoClipe("Parado", 0)).toBe(1);
  });
});

describe("repete e crossfade", () => {
  it("chutes e quedas tocam uma vez; corrida e parado repetem", () => {
    expect(repete("Chute")).toBe(false);
    expect(repete("Queda")).toBe(false);
    expect(repete("Corrida")).toBe(true);
    expect(repete("Parado")).toBe(true);
    expect(repete("Comemoracao")).toBe(true);
  });

  it("a troca para chute é quase instantânea", () => {
    expect(duracaoDoCrossfade("Corrida", "Chute")).toBeLessThan(duracaoDoCrossfade("Corrida", "Parado"));
  });
});
