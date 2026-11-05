import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// CLAUDE.md regra 9: o controle nunca importa Three.js nem nada de src/tela/.
const pasta = dirname(fileURLToPath(import.meta.url));

function arquivosTs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? arquivosTs(join(dir, e.name)) : e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") ? [join(dir, e.name)] : [],
  );
}

describe("controle leve", () => {
  it("nenhum arquivo de src/controle e src/comum importa three ou src/tela", () => {
    const alvos = [...arquivosTs(pasta), ...arquivosTs(join(pasta, "..", "comum"))];
    expect(alvos.length).toBeGreaterThan(0);
    for (const arquivo of alvos) {
      const texto = readFileSync(arquivo, "utf8");
      expect(texto, arquivo).not.toMatch(/from\s+["']three/);
      expect(texto, arquivo).not.toMatch(/from\s+["'][^"']*\/tela\//);
    }
  });
});
