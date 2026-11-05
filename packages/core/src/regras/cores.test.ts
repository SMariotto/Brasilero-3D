import { describe, expect, it } from "vitest";
import { TIMES, acharTime } from "../dados/index";
import { coresDaPartida, corHex, diferencaDeCor, hexParaLab, uniformeReserva, uniformeTitular, uniformesDaPartida } from "./cores";

describe("corHex", () => {
  it("resolve primaria, secundaria, terciaria e hexadecimal direto", () => {
    const flu = acharTime("fluminense")!;
    expect(corHex(flu, "primaria")).toBe("#8A1538");
    expect(corHex(flu, "terciaria")).toBe("#F2F2F2");
    expect(corHex(flu, "#abcdef")).toBe("#ABCDEF");
    const vasco = acharTime("vasco")!;
    expect(corHex(vasco, "terciaria")).toBe("#111111"); // não tem terciária: cai na primária
  });
});

describe("diferença de cor (ΔE em Lab)", () => {
  it("branco é L=100 e preto é L=0", () => {
    expect(hexParaLab("#FFFFFF")[0]).toBeCloseTo(100, 0);
    expect(hexParaLab("#000000")[0]).toBeCloseTo(0, 0);
  });

  it("cores iguais dão 0; preto e branco dão ~100; vermelho e verde ficam bem longe", () => {
    expect(diferencaDeCor("#C8102E", "#C8102E")).toBe(0);
    expect(diferencaDeCor("#000000", "#FFFFFF")).toBeCloseTo(100, 0);
    expect(diferencaDeCor("#C8102E", "#006437")).toBeGreaterThan(60);
  });

  it("é simétrica", () => {
    expect(diferencaDeCor("#1B3F95", "#0D80BF")).toBeCloseTo(diferencaDeCor("#0D80BF", "#1B3F95"), 9);
  });
});

describe("uniformes da partida (conflito de cores, SPEC 9.3)", () => {
  it("Palmeiras x Flamengo: cores diferentes, ninguém troca de camisa", () => {
    const [casa, vis] = uniformesDaPartida("palmeiras", "flamengo");
    expect(casa).toEqual(uniformeTitular(acharTime("palmeiras")!));
    expect(vis).toEqual(uniformeTitular(acharTime("flamengo")!));
  });

  it("Vasco x Botafogo: as duas são pretas, o Visitante usa a reserva", () => {
    const [casa, vis] = uniformesDaPartida("vasco", "botafogo");
    expect(casa.cor1).toBe("#111111");
    expect(vis).toEqual(uniformeReserva(acharTime("botafogo")!));
    expect(vis.cor1).toBe("#F2F2F2");
  });

  it("Corinthians x Santos: as duas são brancas, o Visitante usa a reserva (preta)", () => {
    const [casa, vis] = uniformesDaPartida("corinthians", "santos");
    expect(casa.cor1).toBe("#F2F2F2");
    expect(vis.cor1).toBe("#111111");
  });

  it("a Casa nunca troca: Botafogo em casa contra o Vasco também fica de preto", () => {
    const [casa, vis] = uniformesDaPartida("botafogo", "vasco");
    expect(casa).toEqual(uniformeTitular(acharTime("botafogo")!));
    expect(vis.cor1).toBe("#F2F2F2");
  });

  it("vermelhos parecidos (Flamengo x Internacional): o Visitante troca", () => {
    const [, vis] = uniformesDaPartida("flamengo", "internacional");
    expect(vis.cor1).toBe("#F2F2F2");
  });

  it("depois da troca, nunca sobra conflito entre dois clubes de dados reais (todas as combinações)", () => {
    for (const a of TIMES) {
      for (const b of TIMES) {
        if (a.id === b.id) continue;
        const [casa, vis] = uniformesDaPartida(a.id, b.id);
        expect(diferencaDeCor(casa.cor1, vis.cor1), `${a.id} x ${b.id}`).toBeGreaterThanOrEqual(25);
      }
    }
  });

  it("se titular e reserva do Visitante parecem com a Casa, usa o branco ou o preto que mais contrasta", () => {
    // Casa cinza médio, Visitante preto/branco: nenhum dos dois contrasta, mas o resultado sempre se distingue
    const [casa, vis] = uniformesDaPartida("vasco", "atleticomg");
    expect(diferencaDeCor(casa.cor1, vis.cor1)).toBeGreaterThanOrEqual(25);
    expect(vis.padrao).toBe("liso");
  });

  it("clube que não existe não quebra", () => {
    const [a, b] = uniformesDaPartida("x", "y");
    expect(a.cor1).toMatch(/^#/);
    expect(b.cor1).toMatch(/^#/);
  });

  it("calção e meião da reserva combinam com a camisa (cor2 e cor1 dela)", () => {
    const r = uniformeReserva(acharTime("vasco")!);
    expect(r.cor1).toBe("#F2F2F2");
    expect(r.calcao).toBe("#111111");
    expect(r.meiao).toBe("#F2F2F2");
  });
});

describe("coresDaPartida", () => {
  it("devolve a cor principal da camisa de cada time", () => {
    expect(coresDaPartida("flamengo", "palmeiras")).toEqual(["#C8102E", "#006437"]);
    expect(coresDaPartida("vasco", "botafogo")).toEqual(["#111111", "#F2F2F2"]);
    expect(coresDaPartida("corinthians", "santos")).toEqual(["#F2F2F2", "#111111"]);
  });
});
