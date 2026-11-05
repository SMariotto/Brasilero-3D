import { describe, expect, it } from "vitest";
import type { VagaElenco } from "@b3d/core";
import { idDoApelido, idsHumanos, proximoId, slotDoHumano } from "./seguir";

const v = (slot: number, nome: string, id?: number): VagaElenco => ({
  slot,
  time: slot < 6 ? 0 : 1,
  numero: slot,
  nome,
  humano: id !== undefined,
  ...(id !== undefined ? { idControle: id } : {}),
  goleiro: false,
});
const elenco = [v(0, "Samuel", 7), v(1, "Bot Um"), v(6, "Duda", 3), v(7, "Bot Dois"), v(8, "João", 9)];

describe("idsHumanos", () => {
  it("só humanos, em ordem de id (não muda quando eles trocam de jogador)", () => {
    expect(idsHumanos(elenco)).toEqual([3, 7, 9]);
    expect(idsHumanos([v(1, "Bot")])).toEqual([]);
  });
});

describe("proximoId", () => {
  it("anda pela lista e volta ao começo", () => {
    expect(proximoId([3, 7, 9], null)).toBe(3);
    expect(proximoId([3, 7, 9], 3)).toBe(7);
    expect(proximoId([3, 7, 9], 9)).toBe(3);
  });

  it("quem saiu da lista leva ao primeiro; lista vazia dá null", () => {
    expect(proximoId([3, 7], 99)).toBe(3);
    expect(proximoId([], 3)).toBeNull();
  });
});

describe("idDoApelido", () => {
  it("acha sem ligar para maiúscula e acento", () => {
    expect(idDoApelido(elenco, "duda")).toBe(3);
    expect(idDoApelido(elenco, "JOAO")).toBe(9);
    expect(idDoApelido(elenco, " samuel ")).toBe(7);
  });

  it("bot não conta, nome que não existe e vazio dão null", () => {
    expect(idDoApelido(elenco, "Bot Um")).toBeNull();
    expect(idDoApelido(elenco, "Fulano")).toBeNull();
    expect(idDoApelido(elenco, "  ")).toBeNull();
  });
});

describe("slotDoHumano", () => {
  it("acha o jogador que o humano controla agora, e muda quando ele troca de jogador", () => {
    expect(slotDoHumano(elenco, 3)).toBe(6);
    const depois = [v(0, "Bot Zero"), v(1, "Samuel", 7), v(6, "Bot Seis"), v(7, "Duda", 3), v(8, "João", 9)];
    expect(slotDoHumano(depois, 3)).toBe(7);
    expect(slotDoHumano(depois, 99)).toBeNull();
  });
});
