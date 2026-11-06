import { describe, expect, it } from "vitest";
import { PASSE } from "../constantes";
import { criarCampo } from "../fisica/campo";
import { criarRng } from "../util/rng";
import { grausParaRad, radParaGraus } from "../util/vetor";
import { calcularChute, calcularPasseAssistido, escolherAlvoDoPasse, miraAssistida, notaDoPasse, type Alvo } from "./acoes";

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
  const base = { dirX: 1, dirZ: 0, px: 20, pz: 0, time: 0 as const, campo };

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
    for (let i = 0; i < 2000; i++) {
      const n = calcularChute({ ...base, forca: 0.5, rng });
      maxNormal = Math.max(maxNormal, Math.abs(radParaGraus(Math.atan2(n.vz, n.vx))));
      const f = calcularChute({ ...base, forca: 0.95, rng });
      maxForte = Math.max(maxForte, Math.abs(radParaGraus(Math.atan2(f.vz, f.vx))));
    }
    expect(maxNormal).toBeLessThanOrEqual(2.0001);
    expect(maxNormal).toBeGreaterThan(1.8);
    expect(maxForte).toBeLessThanOrEqual(7.0001);
    expect(maxForte).toBeGreaterThan(6);
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

const parado = (slot: number, x: number, z: number): Alvo => ({ slot, x, z, vx: 0, vz: 0 });
const de = { x: 0, z: 0 };

describe("passe com mira assistida", () => {
  it("escolhe o companheiro dentro do cone de 60° e ignora quem está fora", () => {
    const dentro = parado(2, 12, 3); // ~14° da direção
    const fora = parado(3, 12, 12); // 45°: fora do cone de 30° para cada lado
    const atras = parado(4, -10, 0);
    const alvo = escolherAlvoDoPasse({ de, dirX: 1, dirZ: 0, companheiros: [fora, atras, dentro], adversarios: [], alto: false, ataque: 1 });
    expect(alvo?.slot).toBe(2);
    expect(escolherAlvoDoPasse({ de, dirX: 1, dirZ: 0, companheiros: [fora, atras], adversarios: [], alto: false, ataque: 1 })).toBeNull();
  });

  it("a nota pesa alinhamento (0,6), distância ideal de 8 a 18 m (0,25) e linha livre (0,15)", () => {
    const perfeito = notaDoPasse(de, 1, 0, { x: 12, z: 0 }, []);
    expect(perfeito).toBeCloseTo(1, 6);
    expect(notaDoPasse(de, 1, 0, { x: 4, z: 0 }, [])).toBeLessThan(perfeito);
    expect(notaDoPasse(de, 1, 0, { x: 30, z: 0 }, [])).toBeLessThan(perfeito);
    // adversário colado na linha do passe: perde os 0,15 da linha livre
    expect(notaDoPasse(de, 1, 0, { x: 12, z: 0 }, [{ x: 6, z: 0 }])).toBeCloseTo(0.85, 6);
    expect(notaDoPasse(de, 1, 0, { x: 12, z: 5 }, [])).toBeLessThan(perfeito);
  });

  it("entre dois candidatos vence a maior nota (a linha livre decide)", () => {
    const a = parado(2, 12, 2);
    const b = parado(3, 12, -2);
    const alvo = escolherAlvoDoPasse({ de, dirX: 1, dirZ: 0, companheiros: [a, b], adversarios: [{ x: 6, z: 1 }], alto: false, ataque: 1 });
    expect(alvo?.slot).toBe(3);
  });

  it("rasteiro (H3): velocidade base + porMetro·d, entre o mínimo e o máximo do PASSE", () => {
    const perto = calcularPasseAssistido({ de, dirX: 1, dirZ: 0, companheiros: [parado(2, 5, 0)], adversarios: [], alto: false, ataque: 1 });
    expect(Math.hypot(perto.vx, perto.vz)).toBeCloseTo(PASSE.velocidadeBase + PASSE.velocidadePorMetro * 5, 1);
    const longe = calcularPasseAssistido({ de, dirX: 1, dirZ: 0, companheiros: [parado(2, 25, 0)], adversarios: [], alto: false, ataque: 1 });
    expect(Math.hypot(longe.vx, longe.vz)).toBeCloseTo(PASSE.velocidadeMax, 5);
    const colado = calcularPasseAssistido({ de, dirX: 1, dirZ: 0, companheiros: [parado(2, 1.5, 0)], adversarios: [], alto: false, ataque: 1 });
    expect(Math.hypot(colado.vx, colado.vz)).toBeCloseTo(PASSE.velocidadeMin, 5);
    expect(perto.vy).toBe(0);
    expect(perto.para).toBe(2);
  });

  it("mira onde o companheiro VAI estar (adianta pela velocidade e pelo tempo de viagem)", () => {
    const correndo: Alvo = { slot: 2, x: 12, z: 0, vx: 0, vz: 5 };
    const r = calcularPasseAssistido({ de, dirX: 1, dirZ: 0, companheiros: [correndo], adversarios: [], alto: false, ataque: 1 });
    expect(r.vz).toBeGreaterThan(1);
    const parado2 = calcularPasseAssistido({ de, dirX: 1, dirZ: 0, companheiros: [parado(2, 12, 0)], adversarios: [], alto: false, ataque: 1 });
    expect(parado2.vz).toBeCloseTo(0, 6);
  });

  it("sem companheiro no cone passa reto na direção pedida, a 12 m/s", () => {
    const r = calcularPasseAssistido({ de, dirX: 0, dirZ: 1, companheiros: [], adversarios: [], alto: false, ataque: 1 });
    expect(r).toMatchObject({ vx: 0, vy: 0, vz: 12, alto: false });
    expect(r.para).toBeUndefined();
  });

  it("lançamento: vai para o companheiro MAIS AVANÇADO do cone, por cima (vy de 5 a 9 m/s)", () => {
    const perto = parado(2, 8, 0);
    const longe = parado(3, 20, 1);
    const r = calcularPasseAssistido({ de, dirX: 1, dirZ: 0, companheiros: [perto, longe], adversarios: [], alto: true, ataque: 1 });
    expect(r.para).toBe(3);
    expect(r.alto).toBe(true);
    expect(r.vy).toBeGreaterThanOrEqual(5);
    expect(r.vy).toBeLessThanOrEqual(9);
    const curto = calcularPasseAssistido({ de, dirX: 1, dirZ: 0, companheiros: [perto], adversarios: [], alto: true, ataque: 1 });
    expect(r.vy).toBeGreaterThan(curto.vy);
  });

  it("o lançamento cai perto do companheiro (conta simples sem arrasto)", () => {
    const r = calcularPasseAssistido({ de, dirX: 1, dirZ: 0, companheiros: [parado(2, 15, 0)], adversarios: [], alto: true, ataque: 1 });
    const tempo = (2 * r.vy) / 9.81;
    expect(r.vx * tempo).toBeGreaterThan(14);
    expect(r.vx * tempo).toBeLessThan(17);
  });

  it("para o Visitante (ataca X negativo) o mais avançado é o de menor X", () => {
    const a = parado(2, -8, 0);
    const b = parado(3, -18, 0);
    const r = calcularPasseAssistido({ de, dirX: -1, dirZ: 0, companheiros: [a, b], adversarios: [], alto: true, ataque: -1 });
    expect(r.para).toBe(3);
  });

  it("o erro angular (bots) gira a direção final", () => {
    const r = calcularPasseAssistido({ de, dirX: 1, dirZ: 0, companheiros: [], adversarios: [], alto: false, ataque: 1, erroGraus: 90 });
    expect(r.vx).toBeCloseTo(0, 6);
    expect(r.vz).toBeCloseTo(12, 6);
  });

  it("o cone mais aberto dos bots (140°) enxerga companheiro de lado", () => {
    const lado = parado(2, 5, 10);
    expect(escolherAlvoDoPasse({ de, dirX: 1, dirZ: 0, companheiros: [lado], adversarios: [], alto: false, ataque: 1 })).toBeNull();
    expect(escolherAlvoDoPasse({ de, dirX: 1, dirZ: 0, companheiros: [lado], adversarios: [], alto: false, ataque: 1, coneGraus: 140 })?.slot).toBe(2);
  });
});
