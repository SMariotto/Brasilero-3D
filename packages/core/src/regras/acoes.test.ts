import { describe, expect, it } from "vitest";
import { criarCampo } from "../fisica/campo";
import { criarRng } from "../util/rng";
import { grausParaRad, radParaGraus } from "../util/vetor";
import { calcularChute, calcularPasse, miraAssistida } from "./acoes";

const campo = criarCampo(5, "campo");
// De (20, 0) a trave está em atan2(3, 10) = 16,7° acima e abaixo.
const TRAVE = radParaGraus(Math.atan2(3, 10));

describe("mira assistida", () => {
  it("não mexe quando o chute já vai para dentro do gol", () => {
    for (const g of [0, 5, -10, TRAVE - 0.1, -TRAVE + 0.1]) {
      expect(miraAssistida(20, 0, grausParaRad(g), campo, 0)).toBeCloseTo(grausParaRad(g), 9);
    }
  });

  it("puxa para dentro quando passa de raspão (até 12°)", () => {
    // 8,3° fora da trave: puxa só até a trave
    const a = miraAssistida(20, 0, grausParaRad(25), campo, 0);
    expect(radParaGraus(a)).toBeCloseTo(TRAVE, 6);
    // 18,3° fora da trave: puxa 12°
    const b = miraAssistida(20, 0, grausParaRad(35), campo, 0);
    expect(radParaGraus(b)).toBeCloseTo(23, 6);
    // do outro lado também
    const c = miraAssistida(20, 0, grausParaRad(-35), campo, 0);
    expect(radParaGraus(c)).toBeCloseTo(-23, 6);
  });

  it("não ajuda quando o chute vai mais de 25° para fora da trave", () => {
    const a = miraAssistida(20, 0, grausParaRad(45), campo, 0);
    expect(radParaGraus(a)).toBeCloseTo(45, 6);
  });

  it("funciona espelhado para o Visitante, que ataca o gol de X negativo", () => {
    // Visitante em (-20, 0), chutando 35° para fora (ângulo espelhado: 180 - 35 = 145°)
    const a = miraAssistida(-20, 0, grausParaRad(145), campo, 1);
    expect(radParaGraus(a)).toBeCloseTo(157, 6); // puxou 12° em direção ao gol (180°)
    const b = miraAssistida(-20, 0, grausParaRad(180), campo, 1);
    expect(radParaGraus(b)).toBeCloseTo(180, 6);
  });

  it("colado na linha de fundo não ajuda (evita ângulos absurdos)", () => {
    const a = miraAssistida(29.8, 5, grausParaRad(30), campo, 0);
    expect(radParaGraus(a)).toBeCloseTo(30, 6);
  });
});

describe("chute", () => {
  const base = { dirX: 1, dirZ: 0, px: 0, pz: 0, time: 0 as const, campo, arrancando: false };

  it("força 1: 30 m/s na horizontal e 6 m/s para cima", () => {
    const v = calcularChute({ ...base, forca: 1, rng: criarRng(1) });
    expect(Math.hypot(v.vx, v.vz)).toBeCloseTo(30, 5);
    expect(v.vy).toBeCloseTo(6, 5);
  });

  it("toque rápido (força 0) vale 0,15: 16,4 m/s e 1,75 para cima", () => {
    const v = calcularChute({ ...base, forca: 0, rng: criarRng(1) });
    expect(v.forca).toBe(0.15);
    expect(Math.hypot(v.vx, v.vz)).toBeCloseTo(16.4, 5);
    expect(v.vy).toBeCloseTo(1.75, 5);
  });

  it("força acima de 1 é cortada em 1", () => {
    const v = calcularChute({ ...base, forca: 5, rng: criarRng(1) });
    expect(Math.hypot(v.vx, v.vz)).toBeCloseTo(30, 5);
  });

  it("o erro fica em até 2° normalmente e 7° com força acima de 0,9 ou na arrancada", () => {
    const rng = criarRng(7);
    let maxNormal = 0;
    let maxForte = 0;
    let maxArrancada = 0;
    for (let i = 0; i < 2000; i++) {
      const n = calcularChute({ ...base, forca: 0.5, rng });
      maxNormal = Math.max(maxNormal, Math.abs(radParaGraus(Math.atan2(n.vz, n.vx))));
      const f = calcularChute({ ...base, forca: 0.95, rng });
      maxForte = Math.max(maxForte, Math.abs(radParaGraus(Math.atan2(f.vz, f.vx))));
      const a = calcularChute({ ...base, forca: 0.5, arrancando: true, rng });
      maxArrancada = Math.max(maxArrancada, Math.abs(radParaGraus(Math.atan2(a.vz, a.vx))));
    }
    expect(maxNormal).toBeLessThanOrEqual(2.0001);
    expect(maxNormal).toBeGreaterThan(1.8);
    expect(maxForte).toBeLessThanOrEqual(7.0001);
    expect(maxForte).toBeGreaterThan(6);
    expect(maxArrancada).toBeLessThanOrEqual(7.0001);
    expect(maxArrancada).toBeGreaterThan(6);
  });

  it("com a mesma semente o chute sai sempre igual", () => {
    const a = calcularChute({ ...base, forca: 0.7, rng: criarRng(99) });
    const b = calcularChute({ ...base, forca: 0.7, rng: criarRng(99) });
    expect(a).toEqual(b);
  });

  it("a direção do joystick manda: chutar para -Z sai para -Z", () => {
    const v = calcularChute({ ...base, dirX: 0, dirZ: -1, forca: 1, rng: criarRng(3) });
    expect(v.vz).toBeLessThan(-25);
    expect(Math.abs(v.vx)).toBeLessThan(5);
  });
});

describe("passe simples (F2)", () => {
  it("vai na direção pedida, rasteiro e a 12 m/s", () => {
    const v = calcularPasse(0, 1);
    expect(v).toEqual({ vx: 0, vy: 0, vz: 12 });
  });
});
