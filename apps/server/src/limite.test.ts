import { describe, expect, it } from "vitest";
import { LimiteTaxa } from "./limite";

describe("LimiteTaxa", () => {
  it("deixa passar até o máximo por segundo e descarta o resto", () => {
    let t = 0;
    const limite = new LimiteTaxa(60, () => t);
    let aceitas = 0;
    for (let i = 0; i < 100; i++) if (limite.permitir()) aceitas++;
    expect(aceitas).toBe(60);
  });

  it("zera na janela seguinte", () => {
    let t = 0;
    const limite = new LimiteTaxa(3, () => t);
    expect([limite.permitir(), limite.permitir(), limite.permitir(), limite.permitir()]).toEqual([true, true, true, false]);
    t = 1000;
    expect(limite.permitir()).toBe(true);
  });
});
