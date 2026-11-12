import { describe, expect, it } from "vitest";
import { RelogioPausavel } from "./relogio-pausavel";

describe("RelogioPausavel", () => {
  it("sem pausa, a hora do jogo é a do navegador", () => {
    const r = new RelogioPausavel();
    expect(r.jogo(1000)).toBe(1000);
    expect(r.jogo(5000)).toBe(5000);
  });

  it("pausado, a hora do jogo fica parada na hora em que pausou, por mais que o navegador ande", () => {
    const r = new RelogioPausavel();
    r.pausar(2000);
    expect(r.pausado).toBe(true);
    expect(r.jogo(2000)).toBe(2000);
    expect(r.jogo(9000)).toBe(2000);
    expect(r.jogo(60_000)).toBe(2000);
  });

  it("retomando, a hora do jogo segue de onde parou: o tempo parado não conta", () => {
    const r = new RelogioPausavel();
    r.pausar(2000);
    r.retomar(12_000); // 10 s parado
    expect(r.pausado).toBe(false);
    expect(r.jogo(12_000)).toBe(2000);
    expect(r.jogo(12_500)).toBe(2500);
  });

  it("várias pausas somam o tempo parado", () => {
    const r = new RelogioPausavel();
    r.pausar(1000);
    r.retomar(3000); // 2 s
    r.pausar(5000);
    r.retomar(9000); // 4 s
    expect(r.jogo(10_000)).toBe(10_000 - 6000);
  });

  it("pausar duas vezes seguidas, ou retomar sem estar pausado, não muda nada", () => {
    const r = new RelogioPausavel();
    r.retomar(500);
    expect(r.jogo(1000)).toBe(1000);
    r.pausar(2000);
    r.pausar(4000); // não conta de novo: continua valendo as 2000
    r.retomar(6000);
    expect(r.jogo(6000)).toBe(2000);
  });

  it("uma espera marcada em hora de jogo (como a do replay do gol) só vence com o jogo rodando", () => {
    const r = new RelogioPausavel();
    const vence = r.jogo(1000) + 1500; // o replay começa 1,5 s depois do gol
    r.pausar(1800);
    expect(r.jogo(30_000) >= vence).toBe(false); // 30 s depois, ainda pausado: não venceu
    r.retomar(30_000);
    expect(r.jogo(30_000) >= vence).toBe(false); // 0,8 s de jogo se passaram
    expect(r.jogo(30_700) >= vence).toBe(true); // 1,5 s de jogo
  });
});
