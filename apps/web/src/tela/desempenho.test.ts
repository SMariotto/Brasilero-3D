import { describe, expect, it } from "vitest";
import { MedidorFps } from "./desempenho";

/** Alimenta o medidor com `segundos` de quadros a `fps` quadros por segundo. */
function rodar(m: MedidorFps, fps: number, segundos: number): void {
  const dt = 1000 / fps;
  for (let t = 0; t < segundos * 1000; t += dt) m.quadro(dt);
}

describe("MedidorFps", () => {
  it("mede os fps", () => {
    const m = new MedidorFps();
    rodar(m, 60, 2);
    expect(m.fps).toBeGreaterThan(58);
    expect(m.fps).toBeLessThan(62);
  });

  it("a 60 fps o modo leve nunca liga", () => {
    const m = new MedidorFps();
    rodar(m, 60, 30);
    expect(m.leve).toBe(false);
  });

  it("abaixo de 45 fps por 3 s seguidos liga o modo leve (uma vez) e avisa", () => {
    let avisos = 0;
    const m = new MedidorFps(() => avisos++);
    rodar(m, 30, 2.4);
    expect(m.leve).toBe(false);
    rodar(m, 30, 1.2);
    expect(m.leve).toBe(true);
    expect(m.motivo).toBe("automatico");
    rodar(m, 30, 10);
    expect(avisos).toBe(1);
  });

  it("queda curta (menos de 3 s) não liga: a contagem zera quando volta a passar de 45", () => {
    const m = new MedidorFps();
    rodar(m, 30, 2);
    rodar(m, 60, 1);
    rodar(m, 30, 2);
    rodar(m, 60, 1);
    rodar(m, 30, 2);
    expect(m.leve).toBe(false);
  });

  it("o automático só liga: com fps bom de novo, continua leve", () => {
    const m = new MedidorFps();
    rodar(m, 20, 4);
    expect(m.leve).toBe(true);
    rodar(m, 60, 20);
    expect(m.leve).toBe(true);
  });

  it("quadro longo demais (aba em segundo plano) não conta como PC lento", () => {
    const m = new MedidorFps();
    for (let i = 0; i < 10; i++) m.quadro(5000);
    expect(m.leve).toBe(false);
    rodar(m, 60, 2);
    expect(m.fps).toBeGreaterThan(55);
  });

  it("alternar força o modo leve na mão e desliga de novo, avisando nos dois casos", () => {
    const eventos: string[] = [];
    const m = new MedidorFps(
      () => eventos.push("liga"),
      () => eventos.push("desliga"),
    );
    expect(m.alternar()).toBe(true);
    expect(m.motivo).toBe("manual");
    expect(m.alternar()).toBe(false);
    expect(m.motivo).toBeNull();
    expect(eventos).toEqual(["liga", "desliga"]);
  });

  it("depois de desligar na mão, o medidor pode ligar de novo se o PC continuar lento", () => {
    const m = new MedidorFps();
    m.alternar();
    m.alternar();
    rodar(m, 25, 4);
    expect(m.leve).toBe(true);
    expect(m.motivo).toBe("automatico");
  });
});
