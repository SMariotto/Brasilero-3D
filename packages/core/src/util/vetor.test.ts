import { describe, expect, it } from "vitest";
import {
  comp2,
  comp3,
  dist2,
  escala2,
  escala3,
  grausParaRad,
  lerp,
  limitar,
  limitarComp2,
  norm2,
  normalizarAngulo,
  ponto2,
  radParaGraus,
  soma2,
  soma3,
  sub2,
  sub3,
  vec2,
  vec3,
} from "./vetor";

describe("escalares", () => {
  it("limitar corta nos extremos", () => {
    expect(limitar(5, 0, 3)).toBe(3);
    expect(limitar(-1, 0, 3)).toBe(0);
    expect(limitar(2, 0, 3)).toBe(2);
  });

  it("lerp interpola", () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 1)).toBe(20);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });

  it("graus e radianos fazem ida e volta", () => {
    expect(grausParaRad(180)).toBeCloseTo(Math.PI, 12);
    expect(radParaGraus(Math.PI / 2)).toBeCloseTo(90, 12);
    expect(radParaGraus(grausParaRad(37))).toBeCloseTo(37, 12);
  });

  it("normalizarAngulo fica em (-π, π]", () => {
    expect(normalizarAngulo(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(normalizarAngulo(-3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(normalizarAngulo(0.5)).toBeCloseTo(0.5, 12);
    expect(normalizarAngulo(2 * Math.PI + 0.1)).toBeCloseTo(0.1, 12);
  });
});

describe("Vec2 (plano x, z)", () => {
  it("soma, subtrai e escala", () => {
    expect(soma2(vec2(1, 2), vec2(3, 4))).toEqual({ x: 4, z: 6 });
    expect(sub2(vec2(3, 4), vec2(1, 2))).toEqual({ x: 2, z: 2 });
    expect(escala2(vec2(1, -2), 3)).toEqual({ x: 3, z: -6 });
  });

  it("comprimento, distância e produto escalar", () => {
    expect(comp2(vec2(3, 4))).toBe(5);
    expect(dist2(vec2(0, 0), vec2(3, 4))).toBe(5);
    expect(ponto2(vec2(1, 0), vec2(0, 1))).toBe(0);
    expect(ponto2(vec2(2, 3), vec2(4, 5))).toBe(23);
  });

  it("norm2 dá comprimento 1 e mantém o zero em zero", () => {
    const n = norm2(vec2(10, 0));
    expect(n).toEqual({ x: 1, z: 0 });
    expect(comp2(norm2(vec2(3, 4)))).toBeCloseTo(1, 12);
    expect(norm2(vec2(0, 0))).toEqual({ x: 0, z: 0 });
  });

  it("limitarComp2 só corta o que passa do máximo", () => {
    const cortado = limitarComp2(vec2(6, 8), 5);
    expect(comp2(cortado)).toBeCloseTo(5, 12);
    expect(cortado.x / cortado.z).toBeCloseTo(0.75, 12);
    expect(limitarComp2(vec2(1, 1), 5)).toEqual({ x: 1, z: 1 });
  });
});

describe("Vec3", () => {
  it("soma, subtrai, escala e mede", () => {
    expect(soma3(vec3(1, 2, 3), vec3(1, 1, 1))).toEqual({ x: 2, y: 3, z: 4 });
    expect(sub3(vec3(1, 2, 3), vec3(1, 1, 1))).toEqual({ x: 0, y: 1, z: 2 });
    expect(escala3(vec3(1, 2, 3), 2)).toEqual({ x: 2, y: 4, z: 6 });
    expect(comp3(vec3(2, 3, 6))).toBe(7);
  });
});
