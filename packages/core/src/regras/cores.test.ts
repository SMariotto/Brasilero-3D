import { describe, expect, it } from "vitest";
import { acharTime } from "../dados/index";
import { coresDaPartida, corHex } from "./cores";

describe("cores", () => {
  it("resolve primaria, secundaria, terciaria e hexadecimal direto", () => {
    const flu = acharTime("fluminense")!;
    expect(corHex(flu, "primaria")).toBe("#8A1538");
    expect(corHex(flu, "terciaria")).toBe("#F2F2F2");
    expect(corHex(flu, "#abcdef")).toBe("#ABCDEF");
    const vasco = acharTime("vasco")!;
    expect(corHex(vasco, "terciaria")).toBe("#111111"); // não tem terciária: cai na primária
  });

  it("times de cores diferentes usam a camisa titular", () => {
    expect(coresDaPartida("flamengo", "palmeiras")).toEqual(["#C8102E", "#006437"]);
  });

  it("camisas iguais: o Visitante usa a reserva", () => {
    expect(coresDaPartida("vasco", "botafogo")).toEqual(["#111111", "#F2F2F2"]);
    expect(coresDaPartida("corinthians", "santos")).toEqual(["#F2F2F2", "#111111"]);
  });

  it("clube que não existe não quebra", () => {
    const [a, b] = coresDaPartida("x", "y");
    expect(a).toMatch(/^#/);
    expect(b).toMatch(/^#/);
  });
});
