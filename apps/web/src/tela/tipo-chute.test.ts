import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// H4: o jogo continua escolhendo o tipo do chute (o evento "chute" ainda leva "tipoDeChute"), mas o telão não mostra mais o nome.

describe("telão sem o nome do chute (H4)", () => {
  const dir = __dirname;
  const fontes = readdirSync(dir).filter((f) => /\.(ts|css)$/.test(f) && !f.endsWith(".test.ts"));

  it("nenhum arquivo do telão tem os textos 'Canudo!', 'Chapada!', 'Trivela!' ou 'Cavadinha!'", () => {
    expect(fontes.length).toBeGreaterThan(5);
    for (const f of fontes) {
      const texto = readFileSync(join(dir, f), "utf8");
      expect(texto, f).not.toMatch(/Canudo!|Chapada!|Trivela!|Cavadinha!/);
    }
  });

  it("o HUD não tem mais o elemento do nome do chute", () => {
    for (const f of ["hud.ts", "tela.css"]) expect(readFileSync(join(dir, f), "utf8"), f).not.toMatch(/tipo-chute|tipoChute/);
  });
});
