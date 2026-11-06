import { describe, expect, it } from "vitest";
import { JOGADOR } from "../constantes";
import { medirMovimento } from "./medidas";

// H2: o chão não pode ser "sabão". Antes: freada 0,28 s / 0,83 m; giro de 90° em 0,47 s com derrapagem de até 4,8 m/s;
// giro de 180° em 0,70 s. Estes limites travam o que foi conseguido, sem deixar o jogo travado nem mudar a velocidade máxima.

const m = medirMovimento();

describe("movimento do jogador (H2)", () => {
  it("a velocidade máxima e a arrancada não mudaram", () => {
    expect(m.velocidadeMaxima).toBeCloseTo(JOGADOR.velocidadeMax, 2);
    expect(m.velocidadeArrancada).toBeCloseTo(JOGADOR.arrancada, 2);
    expect(JOGADOR.velocidadeMax).toBe(6.5);
    expect(JOGADOR.arrancada).toBe(8.2);
  });

  it("a largada continua com a mesma aceleração (0 a 90% em até 0,4 s)", () => {
    expect(m.aceleracao90S).toBeGreaterThan(0.25);
    expect(m.aceleracao90S).toBeLessThan(0.4);
  });

  it("soltar o joystick freia firme: para em até 0,25 s e 0,7 m (e não instantâneo)", () => {
    expect(m.freadaS).toBeLessThan(0.25);
    expect(m.freadaM).toBeLessThan(0.7);
    expect(m.freadaS).toBeGreaterThan(0.12); // ainda tem inércia: não é "travado"
  });

  it("curva de 90° é responsiva: alinha em até 0,3 s e derrapa de lado no máximo 3,2 m/s", () => {
    expect(m.giro90.alinhaS).toBeLessThan(0.3);
    expect(m.giro90.derrapagemMax).toBeLessThan(3.2);
    expect(m.giro45.alinhaS).toBeLessThan(0.17);
  });

  it("inversão de 180° em até 0,65 s, e a curva suave não faz o jogador parar (45° e 90° mantêm velocidade)", () => {
    expect(m.giro180.alinhaS).toBeLessThan(0.65);
    expect(m.giro45.velocidadeMinima).toBeGreaterThan(4.5);
    expect(m.giro90.velocidadeMinima).toBeGreaterThan(3);
  });

  it("não ficou travado: curva de 90° leva pelo menos 0,15 s (tem inércia)", () => {
    expect(m.giro90.alinhaS).toBeGreaterThan(0.15);
    expect(m.giro180.alinhaS).toBeGreaterThan(0.35);
  });
});
