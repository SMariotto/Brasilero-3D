import { describe, expect, it } from "vitest";
import { BOLA } from "../constantes";
import { criarCampo } from "./campo";
import { golMarcado, novaBola, passoBola, type Bola } from "./bola";

const DT = 1 / 60;
const arena = criarCampo(5, "arena");
const campo = criarCampo(5, "campo");

/** Um passo de física e a conferência de gol no mesmo passo. */
function passoEGol(b: Bola, c = campo): -1 | 0 | 1 {
  const xAntes = b.x;
  passoBola(b, c, DT);
  return golMarcado(b, c, xAntes);
}

/** Roda `segundos` de física e devolve o que aconteceu. */
function rodar(b: Bola, c = campo, segundos = 1) {
  const passos = Math.round(segundos / DT);
  let quiques = 0;
  let trave = false;
  let parede = false;
  for (let i = 0; i < passos; i++) {
    const ev = passoBola(b, c, DT);
    quiques += ev.quiques;
    trave ||= ev.trave !== null;
    parede ||= ev.parede;
  }
  return { quiques, trave, parede };
}

describe("bola: chão", () => {
  it("cai de 2 m, quica e sobe a uma altura menor (restituição 0,55)", () => {
    const b = novaBola();
    b.y = 2;
    let max = 0;
    let quicou = false;
    for (let i = 0; i < 240 && max < 2; i++) {
      const ev = passoBola(b, campo, DT);
      if (ev.quiques > 0) quicou = true;
      else if (quicou) max = Math.max(max, b.y);
      if (quicou && b.vy < 0) break;
    }
    expect(quicou).toBe(true);
    // Altura do 2º ponto alto: h' ≈ e² · h (sem arrasto seria 0,3025 · 1,89 ≈ 0,57 m acima do chão).
    expect(max).toBeGreaterThan(0.4);
    expect(max).toBeLessThan(0.8);
  });

  it("cada quique perde 15% da velocidade horizontal e inverte a vertical com 55%", () => {
    const b = novaBola();
    b.y = 1;
    b.vx = 10;
    b.vy = -8;
    const antesVx = b.vx;
    // Um passo grande o bastante para tocar o chão
    const ev = passoBola(b, campo, 0.2);
    expect(ev.quiques).toBe(1);
    expect(b.vy).toBeGreaterThan(0);
    expect(b.vx).toBeLessThan(antesVx * 0.85 + 0.01);
    expect(b.vx).toBeGreaterThan(antesVx * 0.85 * 0.8);
  });

  it("rolando, desacelera cerca de 1,6 m/s² (mais um pouco de arrasto) e para de vez", () => {
    const b = novaBola();
    b.vx = 3;
    rodar(b, campo, 1);
    expect(b.vx).toBeLessThan(3 - 1.6 * 0.95);
    expect(b.vx).toBeGreaterThan(3 - 1.6 - 0.2);
    rodar(b, campo, 3);
    expect(b.vx).toBe(0);
    expect(b.vz).toBe(0);
  });

  it("abaixo de 0,05 m/s a velocidade zera na hora", () => {
    const b = novaBola();
    b.vx = 0.04;
    passoBola(b, campo, DT);
    expect(b.vx).toBe(0);
  });

  it("a distância rolada de 5 m/s fica perto de v²/(2a)", () => {
    const b = novaBola();
    b.vx = 5;
    rodar(b, campo, 6);
    // Com atrito 1,6 e arrasto pequeno, para entre 6 e 8 m.
    expect(b.x).toBeGreaterThan(6);
    expect(b.x).toBeLessThan(8.2);
  });

  it("conduzida não sofre atrito rolando", () => {
    const b = novaBola();
    b.vx = 3;
    for (let i = 0; i < 60; i++) passoBola(b, campo, DT, { conduzida: true });
    // Só sobra o arrasto do ar (cerca de 0,1 m/s em 1 s); o atrito de 1,6 m/s² tiraria 1,6.
    expect(b.vx).toBeGreaterThan(2.8);
  });

  it("o arrasto do ar freia mais uma bola rápida no ar", () => {
    const rapida = novaBola();
    rapida.y = 5;
    rapida.vx = 30;
    const lenta = novaBola();
    lenta.y = 5;
    lenta.vx = 10;
    for (let i = 0; i < 30; i++) {
      passoBola(rapida, campo, DT);
      passoBola(lenta, campo, DT);
    }
    expect(30 - rapida.vx).toBeGreaterThan((10 - lenta.vx) * 5);
  });
});

describe("bola: traves e travessão", () => {
  it("bate na trave de frente e volta com restituição 0,6", () => {
    const b = novaBola(campo.metadeComp - 2, campo.golLarg / 2);
    b.y = 1;
    b.vx = 10;
    b.vy = 0.5;
    let bateu = false;
    for (let i = 0; i < 60; i++) {
      const ev = passoBola(b, campo, DT);
      if (ev.trave) {
        bateu = true;
        break;
      }
    }
    expect(bateu).toBe(true);
    expect(b.vx).toBeLessThan(-4);
    expect(b.vx).toBeGreaterThan(-8);
  });

  it("bate no travessão por baixo e é jogada para baixo", () => {
    const b = novaBola(campo.metadeComp, 0);
    b.y = campo.golAlt - 0.4;
    b.vx = 0;
    b.vy = 8;
    let bateu = false;
    for (let i = 0; i < 40; i++) {
      const ev = passoBola(b, campo, DT);
      if (ev.trave) {
        bateu = true;
        break;
      }
    }
    expect(bateu).toBe(true);
    expect(b.vy).toBeLessThan(0);
  });

  it("passa por cima do travessão sem bater (modo Campo)", () => {
    const b = novaBola(campo.metadeComp - 3, 0);
    b.y = campo.golAlt + 1;
    b.vx = 10;
    const { trave } = rodar(b, campo, 0.6);
    expect(trave).toBe(false);
    expect(b.x).toBeGreaterThan(campo.metadeComp);
  });
});

describe("bola: gol", () => {
  it("entra entre as traves e só conta quando a bola inteira passou da linha", () => {
    const b = novaBola(campo.metadeComp - 0.5, 0);
    b.vx = 8;
    let gol: -1 | 0 | 1 = 0;
    let passosAteGol = 0;
    for (let i = 0; i < 60 && gol === 0; i++) {
      gol = passoEGol(b);
      passosAteGol++;
    }
    expect(gol).toBe(1);
    expect(b.x - BOLA.raio).toBeGreaterThan(campo.metadeComp);
    expect(passosAteGol).toBeGreaterThan(3); // não conta com a bola só tocando a linha
  });

  it("gol da Casa (X negativo) devolve -1", () => {
    const b = novaBola(-campo.metadeComp + 0.5, 0.5);
    b.vx = -8;
    let gol: -1 | 0 | 1 = 0;
    for (let i = 0; i < 60 && gol === 0; i++) gol = passoEGol(b);
    expect(gol).toBe(-1);
  });

  it("bola fora da trave não é gol (modo Campo)", () => {
    const b = novaBola(campo.metadeComp - 0.5, campo.golLarg / 2 + 1);
    b.vx = 8;
    for (let i = 0; i < 60; i++) expect(passoEGol(b)).toBe(0);
  });

  it("por cima do travessão não é gol", () => {
    const b = novaBola(campo.metadeComp - 1, 0);
    b.y = campo.golAlt + 0.8;
    b.vx = 8;
    b.vy = 0;
    // A bola passa por cima, desce atrás do gol e continua sem contar.
    for (let i = 0; i < 90; i++) expect(passoEGol(b)).toBe(0);
  });

  it("depois do gol a bola fica presa na rede e não conta de novo", () => {
    const b = novaBola(campo.metadeComp - 0.5, 0);
    b.vx = 20;
    let gol: -1 | 0 | 1 = 0;
    for (let i = 0; i < 60 && gol === 0; i++) gol = passoEGol(b);
    expect(gol).toBe(1);
    b.naRede = 1;
    for (let i = 0; i < 300; i++) {
      expect(passoEGol(b)).toBe(0);
      expect(b.x).toBeLessThanOrEqual(campo.metadeComp + 2);
      expect(b.x).toBeGreaterThanOrEqual(campo.metadeComp - 0.01);
      expect(Math.abs(b.z)).toBeLessThanOrEqual(campo.golLarg / 2);
    }
  });
});

describe("bola: paredes do modo Arena", () => {
  it("quica na lateral com restituição 0,7", () => {
    const b = novaBola(0, arena.metadeLarg - 1);
    b.vz = 10;
    let parede = false;
    for (let i = 0; i < 60 && !parede; i++) parede = passoBola(b, arena, DT).parede;
    expect(parede).toBe(true);
    expect(b.vz).toBeLessThan(0);
    expect(b.vz).toBeGreaterThan(-8.5);
    expect(b.vz).toBeLessThan(-5.5);
  });

  it("quica na linha de fundo fora da boca do gol e nunca sai do campo", () => {
    const b = novaBola(arena.metadeComp - 1, arena.golLarg / 2 + 3);
    b.vx = 15;
    b.vy = 3;
    for (let i = 0; i < 600; i++) {
      passoBola(b, arena, DT);
      expect(b.x).toBeLessThanOrEqual(arena.metadeComp);
      expect(Math.abs(b.z)).toBeLessThanOrEqual(arena.metadeLarg);
    }
  });

  it("a boca do gol continua aberta na Arena e a bola entra", () => {
    const b = novaBola(arena.metadeComp - 2, 0);
    b.vx = 12;
    let gol: -1 | 0 | 1 = 0;
    for (let i = 0; i < 60 && gol === 0; i++) gol = passoEGol(b, arena);
    expect(gol).toBe(1);
  });

  it("bola alta acima do travessão também quica na parede de fundo", () => {
    const b = novaBola(arena.metadeComp - 2, 0);
    b.y = arena.golAlt + 1;
    b.vx = 12;
    for (let i = 0; i < 60; i++) {
      passoBola(b, arena, DT);
      expect(b.x).toBeLessThanOrEqual(arena.metadeComp);
    }
  });
});
