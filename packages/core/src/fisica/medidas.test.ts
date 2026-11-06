import { describe, expect, it } from "vitest";
import { JOGADOR } from "../constantes";
import { medirMovimento } from "./medidas";

// H2 e H3: o chão não pode ser "sabão" nem travado, e a velocidade máxima é a escolhida (sem stamina, todo mundo corre sempre).
// H2 (antes): freada 0,28 s / 0,83 m; giro de 90° em 0,47 s com derrapagem de até 4,8 m/s; giro de 180° em 0,70 s (a 6,5 m/s).
// H3: a velocidade máxima subiu para JOGADOR.velocidadeMax e as acelerações subiram na mesma proporção.

const m = medirMovimento();

describe("movimento do jogador (H2, H3)", () => {
  it("a velocidade máxima é a de JOGADOR (e com a bola, 90% dela)", () => {
    expect(m.velocidadeMaxima).toBeCloseTo(JOGADOR.velocidadeMax, 2);
    expect(m.velocidadeComBola).toBeCloseTo(JOGADOR.velocidadeMax * JOGADOR.fatorVelocidadeComBola, 2);
    expect(JOGADOR.velocidadeMax).toBe(7.6);
  });

  it("o campo de 60 m se atravessa em 7 a 9 s sem a bola (nem rápido demais nem lento)", () => {
    expect(m.travessiaS).toBeGreaterThan(7);
    expect(m.travessiaS).toBeLessThan(9);
    expect(m.travessiaComBolaS).toBeGreaterThan(m.travessiaS);
  });

  it("a largada leva uns 0,3 a 0,4 s até 90% da velocidade", () => {
    expect(m.aceleracao90S).toBeGreaterThan(0.25);
    expect(m.aceleracao90S).toBeLessThan(0.4);
  });

  it("soltar o joystick freia firme: para em até 0,25 s e 0,75 m (e não instantâneo)", () => {
    expect(m.freadaS).toBeLessThan(0.25);
    expect(m.freadaM).toBeLessThan(0.75);
    expect(m.freadaS).toBeGreaterThan(0.12); // ainda tem inércia: não é "travado"
  });

  it("curva de 90° é responsiva: alinha em até 0,3 s e derrapa de lado no máximo 3,4 m/s", () => {
    expect(m.giro90.alinhaS).toBeLessThan(0.3);
    expect(m.giro90.derrapagemMax).toBeLessThan(3.4);
    expect(m.giro45.alinhaS).toBeLessThan(0.17);
  });

  it("inversão de 180° em até 0,65 s, e a curva suave não faz o jogador parar (45° e 90° mantêm velocidade)", () => {
    expect(m.giro180.alinhaS).toBeLessThan(0.65);
    expect(m.giro45.velocidadeMinima).toBeGreaterThan(5);
    expect(m.giro90.velocidadeMinima).toBeGreaterThan(3.5);
  });

  it("não ficou travado: curva de 90° leva pelo menos 0,15 s (tem inércia)", () => {
    expect(m.giro90.alinhaS).toBeGreaterThan(0.15);
    expect(m.giro180.alinhaS).toBeGreaterThan(0.35);
  });

  it("a curva da inclinação: de parado a correndo, sempre subindo e chegando à máxima", () => {
    let anterior = -1;
    for (const c of m.curva) {
      expect(c.velocidade).toBeGreaterThanOrEqual(anterior);
      anterior = c.velocidade;
    }
    expect(m.curva[m.curva.length - 1]!.velocidade).toBeCloseTo(JOGADOR.velocidadeMax, 5);
  });
});
