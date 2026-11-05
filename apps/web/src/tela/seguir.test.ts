import { describe, expect, it } from "vitest";
import type { VagaElenco } from "@b3d/core";
import { proximoSlot, slotDoApelido, slotsHumanos } from "./seguir";

const v = (slot: number, nome: string, humano: boolean): VagaElenco => ({ slot, time: slot < 6 ? 0 : 1, numero: slot, nome, humano, goleiro: false });
const elenco = [v(0, "Samuel", true), v(1, "Bot Um", false), v(6, "Duda", true), v(7, "Bot Dois", false), v(8, "João", true)];

describe("slotsHumanos", () => {
  it("só humanos, na ordem do elenco", () => {
    expect(slotsHumanos(elenco)).toEqual([0, 6, 8]);
    expect(slotsHumanos([v(1, "Bot", false)])).toEqual([]);
  });
});

describe("proximoSlot", () => {
  it("anda pela lista e volta ao começo", () => {
    expect(proximoSlot([0, 6, 8], null)).toBe(0);
    expect(proximoSlot([0, 6, 8], 0)).toBe(6);
    expect(proximoSlot([0, 6, 8], 8)).toBe(0);
  });

  it("quem saiu da lista (virou bot) leva ao primeiro; lista vazia dá null", () => {
    expect(proximoSlot([0, 6], 99)).toBe(0);
    expect(proximoSlot([], 3)).toBeNull();
  });
});

describe("slotDoApelido", () => {
  it("acha sem ligar para maiúscula e acento", () => {
    expect(slotDoApelido(elenco, "duda")).toBe(6);
    expect(slotDoApelido(elenco, "JOAO")).toBe(8);
    expect(slotDoApelido(elenco, " samuel ")).toBe(0);
  });

  it("bot não conta, nome que não existe e vazio dão null", () => {
    expect(slotDoApelido(elenco, "Bot Um")).toBeNull();
    expect(slotDoApelido(elenco, "Fulano")).toBeNull();
    expect(slotDoApelido(elenco, "  ")).toBeNull();
  });
});
