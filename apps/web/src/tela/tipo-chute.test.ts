import { describe, expect, it } from "vitest";
import type { Evento } from "@b3d/core";
import { DURACAO_DO_TEXTO_MS, textoDoChute } from "./tipo-chute";

const chute = (extra: { tipoDeChute?: "canudo" | "chapada" | "trivela" | "cavadinha" } = {}): Evento => ({ t: "evento", tick: 1, tipo: "chute", dados: { slot: 1, forca: 0.8, ...extra } });

describe("texto do tipo de chute no telão", () => {
  it("cada tipo tem o seu texto curto", () => {
    expect(textoDoChute(chute({ tipoDeChute: "trivela" }))).toBe("Trivela!");
    expect(textoDoChute(chute({ tipoDeChute: "chapada" }))).toBe("Chapada!");
    expect(textoDoChute(chute({ tipoDeChute: "canudo" }))).toBe("Canudo!");
    expect(textoDoChute(chute({ tipoDeChute: "cavadinha" }))).toBe("Cavadinha!");
  });

  it("o chute reto de sempre (sem tipo) e os outros eventos não mostram nada", () => {
    expect(textoDoChute(chute())).toBeNull();
    expect(textoDoChute({ t: "evento", tick: 1, tipo: "apito", dados: { motivo: "falta" } })).toBeNull();
  });

  it("fica 1 s na tela", () => {
    expect(DURACAO_DO_TEXTO_MS).toBe(1000);
  });
});
