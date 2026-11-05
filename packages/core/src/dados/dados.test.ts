import { describe, expect, it } from "vitest";
import { NOMES_BOTS, TIMES, acharTime } from "./index";

describe("times.json", () => {
  it("traz 12 ou mais clubes com ids únicos, minúsculos e sem espaço", () => {
    expect(TIMES.length).toBeGreaterThanOrEqual(12);
    const ids = TIMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+$/);
  });

  it("cada clube tem sigla de 3 letras e cores em hexadecimal", () => {
    for (const t of TIMES) {
      expect(t.sigla).toMatch(/^[A-Z]{3}$/);
      expect(t.cores.primaria).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(t.cores.secundaria).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("toda referência de cor aponta para uma cor que o clube tem (ou é hexadecimal)", () => {
    for (const t of TIMES) {
      const refs = [t.camisa.cor1, t.camisa.cor2, t.reserva.cor1, t.reserva.cor2, t.calcao, t.meiao];
      for (const ref of refs) {
        if (ref.startsWith("#")) {
          expect(ref).toMatch(/^#[0-9A-Fa-f]{6}$/);
        } else {
          expect(["primaria", "secundaria", "terciaria"]).toContain(ref);
          expect(t.cores[ref as "primaria" | "secundaria" | "terciaria"], `${t.id} usa ${ref}`).toBeDefined();
        }
      }
    }
  });

  it("acharTime acha pelo id", () => {
    expect(acharTime("vasco")?.sigla).toBe("VAS");
    expect(acharTime("nao-existe")).toBeUndefined();
  });
});

describe("nomes-bots.json", () => {
  it("tem primeiros nomes e sobrenomes", () => {
    expect(NOMES_BOTS.primeiros.length).toBeGreaterThan(10);
    expect(NOMES_BOTS.sobrenomes.length).toBeGreaterThan(10);
  });
});
