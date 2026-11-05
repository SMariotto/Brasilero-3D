import { describe, expect, it } from "vitest";
import { ANIM } from "@b3d/core";
import {
  AnimadorDePose,
  CHAVES_DA_POSE,
  CORPO,
  alvoDaPose,
  amplitudeDaCorrida,
  poseDeDescanso,
  velocidadeDaFase,
  velocidadeDoPe,
  type EntradaDaPose,
} from "./pose";

const entrada = (anim: number, extra: Partial<EntradaDaPose> = {}): EntradaDaPose => ({ anim, vel: 0, arrancando: false, fase: 0, tAnim: 0, t: 0, sinalLado: 1, ...extra });

describe("corrida sem patinar", () => {
  it("o pé de apoio anda para trás à mesma velocidade que o jogador corre, em qualquer velocidade", () => {
    for (const v of [1, 2.5, 4, 5.85, 6.5, 8.2, 9]) {
      expect(velocidadeDoPe(v, false), `v=${v}`).toBeCloseTo(Math.max(v, 0.4), 6);
      expect(velocidadeDoPe(v, true), `v=${v} arrancando`).toBeCloseTo(Math.max(v, 0.4), 6);
    }
  });

  it("a cadência sobe com a velocidade e fica numa faixa de corrida de verdade (1,8 a 4,5 passos por segundo)", () => {
    let antes = 0;
    for (const v of [3, 4, 5, 6, 7, 8]) {
      const passosPorSegundo = velocidadeDaFase(v, v > 7) / Math.PI;
      expect(passosPorSegundo, `v=${v}`).toBeGreaterThan(1.8);
      expect(passosPorSegundo, `v=${v}`).toBeLessThan(4.5);
      expect(passosPorSegundo).toBeGreaterThan(antes - 0.2);
      antes = passosPorSegundo;
    }
  });

  it("a amplitude cresce com a velocidade (mais na arrancada) e tem teto", () => {
    expect(amplitudeDaCorrida(6, false)).toBeGreaterThan(amplitudeDaCorrida(3, false));
    expect(amplitudeDaCorrida(6, true)).toBeGreaterThan(amplitudeDaCorrida(6, false));
    expect(amplitudeDaCorrida(50, true)).toBeLessThanOrEqual(0.95);
  });

  it("o animador avança a fase só quando corre, na cadência da velocidade", () => {
    const a = new AnimadorDePose();
    a.atualizar(ANIM.parado, 0, false, 1);
    expect(a.faseDaCorrida).toBe(0);
    const v = 6;
    a.atualizar(ANIM.corrida, v, false, 0.1);
    expect(a.faseDaCorrida).toBeCloseTo(velocidadeDaFase(v, false) * 0.1, 6);
  });

  it("as pernas se alternam e os braços balançam ao contrário das pernas", () => {
    const p = alvoDaPose(entrada(ANIM.corrida, { vel: 6, fase: Math.PI / 2 }));
    expect(p.quadrilE).toBeGreaterThan(0.3);
    expect(p.quadrilD).toBeLessThan(-0.3);
    expect(Math.sign(p.ombroE)).toBe(-Math.sign(p.quadrilE));
    expect(p.pitch).toBeGreaterThan(0.1); // corre inclinado para a frente
  });
});

describe("as poses de cada animação", () => {
  it("em pé, o corpo parado é igual ao de descanso (com a respiração)", () => {
    const p = alvoDaPose(entrada(ANIM.parado));
    const d = poseDeDescanso();
    for (const c of CHAVES_DA_POSE) expect(Math.abs(p[c] - d[c]), c).toBeLessThan(0.05);
  });

  it("o chute arma a perna para trás e depois varre para a frente", () => {
    const arma = alvoDaPose(entrada(ANIM.chute, { tAnim: 0.1 }));
    const bate = alvoDaPose(entrada(ANIM.chute, { tAnim: 0.2 }));
    expect(arma.quadrilD).toBeLessThan(-0.2);
    expect(bate.quadrilD).toBeGreaterThan(0.5);
    expect(arma.joelhoD).toBeGreaterThan(bate.joelhoD); // dobrado para trás ao armar, estica ao bater
  });

  it("o passe balança menos a perna que o chute", () => {
    const chute = alvoDaPose(entrada(ANIM.chute, { tAnim: 0.2 }));
    const passe = alvoDaPose(entrada(ANIM.passe, { tAnim: 0.2 }));
    expect(passe.quadrilD).toBeLessThan(chute.quadrilD);
  });

  it("carrinho e queda deitam o corpo e baixam o quadril quase até o chão", () => {
    for (const anim of [ANIM.carrinho, ANIM.queda]) {
      const p = alvoDaPose(entrada(anim, { tAnim: 0.6 }));
      expect(p.deitar, `anim ${anim}`).toBeGreaterThan(0.8);
      expect(CORPO.quadrilY + p.altura).toBeLessThan(0.45);
    }
    expect(alvoDaPose(entrada(ANIM.carrinho, { tAnim: 0 })).deitar).toBeCloseTo(0, 5); // começa em pé
  });

  it("comemoração: braços para cima e pulinhos", () => {
    const p = alvoDaPose(entrada(ANIM.comemoracao, { t: 0.22 }));
    expect(p.ombroE).toBeGreaterThan(2.5);
    expect(p.ombroD).toBeGreaterThan(2.5);
    expect(alvoDaPose(entrada(ANIM.comemoracao, { t: 0.22 })).altura).toBeGreaterThan(alvoDaPose(entrada(ANIM.comemoracao, { t: 0 })).altura);
  });

  it("goleiro parado fica agachado de braços abertos; com a bola, braços à frente dobrados", () => {
    const parado = alvoDaPose(entrada(ANIM.goleiroParado));
    expect(parado.joelhoE).toBeGreaterThan(0.5); // joelhos dobrados
    expect(parado.pitch).toBeGreaterThan(0.2); // tronco inclinado
    expect(parado.abreE).toBeGreaterThan(0.4);
    const comBola = alvoDaPose(entrada(ANIM.goleiroComBola));
    expect(comBola.ombroE).toBeGreaterThan(1);
    expect(comBola.cotoveloE).toBeGreaterThan(0.9);
  });

  it("mergulho: cai para o lado certo do corpo, que depende de para onde o goleiro está virado", () => {
    const esq = alvoDaPose(entrada(ANIM.goleiroMergulhoEsq, { tAnim: 0.4, sinalLado: 1 }));
    const dir = alvoDaPose(entrada(ANIM.goleiroMergulhoDir, { tAnim: 0.4, sinalLado: 1 }));
    expect(esq.lado).toBeGreaterThan(0.3);
    expect(dir.lado).toBeLessThan(-0.3);
    expect(esq.roll).toBeLessThan(-0.8);
    expect(dir.roll).toBeGreaterThan(0.8);
    // Virado para o outro gol, o "Esq" do mundo é o outro lado do corpo
    const esqOutroGol = alvoDaPose(entrada(ANIM.goleiroMergulhoEsq, { tAnim: 0.4, sinalLado: -1 }));
    expect(esqOutroGol.lado).toBeCloseTo(-esq.lado, 6);
    expect(esq.ombroE).toBeGreaterThan(2.5); // braços para cima
  });

  it("cabeceio: pula e joga a cabeça para a frente", () => {
    const sobe = alvoDaPose(entrada(ANIM.cabeceio, { tAnim: 0.25 }));
    expect(sobe.altura).toBeGreaterThan(0.2);
    expect(sobe.pitch).toBeGreaterThan(0.1);
    expect(alvoDaPose(entrada(ANIM.cabeceio, { tAnim: 0 })).altura).toBeCloseTo(0, 5);
  });

  it("nenhuma pose tem valor fora do razoável (sem NaN, ângulos até 3,2 rad, altura de -0,8 a 0,5 m)", () => {
    for (const anim of Object.values(ANIM)) {
      for (const tAnim of [0, 0.1, 0.25, 0.5, 1.5]) {
        for (const fase of [0, 1, 2, 3, 4, 5, 6]) {
          const p = alvoDaPose(entrada(anim, { tAnim, fase, vel: 6, t: tAnim * 3 }));
          for (const c of CHAVES_DA_POSE) expect(Number.isFinite(p[c]), `${anim} ${c}`).toBe(true);
          expect(p.altura).toBeGreaterThan(-0.8);
          expect(p.altura).toBeLessThan(0.5);
          for (const c of ["quadrilE", "quadrilD", "joelhoE", "joelhoD", "ombroE", "ombroD", "cotoveloE", "cotoveloD", "pitch", "roll"] as const) {
            expect(Math.abs(p[c]), `${anim} ${c}`).toBeLessThan(3.2);
          }
        }
      }
    }
  });
});

describe("transição suave entre animações", () => {
  it("de parado para chute o corpo não dá salto: nenhuma articulação muda mais de 0,5 rad num quadro de 1/60 s", () => {
    const a = new AnimadorDePose();
    for (let i = 0; i < 30; i++) a.atualizar(ANIM.parado, 0, false, 1 / 60);
    let anterior = { ...a.pose };
    for (let i = 0; i < 60; i++) {
      const p = a.atualizar(ANIM.chute, 0, false, 1 / 60);
      for (const c of CHAVES_DA_POSE) expect(Math.abs(p[c] - anterior[c]), `${c} no quadro ${i}`).toBeLessThan(0.5);
      anterior = { ...p };
    }
  });

  it("alcança a pose pedida e não passa dela (sem quicar)", () => {
    const a = new AnimadorDePose();
    for (let i = 0; i < 90; i++) a.atualizar(ANIM.goleiroParado, 0, false, 1 / 60);
    const alvo = alvoDaPose(entrada(ANIM.goleiroParado, { t: 1.5 }));
    expect(Math.abs(a.pose.joelhoE - alvo.joelhoE)).toBeLessThan(0.02);
    expect(Math.abs(a.pose.altura - alvo.altura)).toBeLessThan(0.02);
  });

  it("depois de correr e parar, volta em pé em menos de meio segundo", () => {
    const a = new AnimadorDePose();
    for (let i = 0; i < 60; i++) a.atualizar(ANIM.corrida, 6, false, 1 / 60);
    for (let i = 0; i < 30; i++) a.atualizar(ANIM.parado, 0, false, 1 / 60);
    expect(Math.abs(a.pose.quadrilE)).toBeLessThan(0.05);
    expect(Math.abs(a.pose.pitch)).toBeLessThan(0.05);
  });

  it("um golpe de uma jogada só recomeça do zero quando a animação volta", () => {
    const a = new AnimadorDePose();
    a.atualizar(ANIM.chute, 0, false, 0.25);
    const fimDoGolpe = a.pose.quadrilD;
    a.atualizar(ANIM.parado, 0, false, 0.5);
    for (let i = 0; i < 6; i++) a.atualizar(ANIM.chute, 0, false, 1 / 60);
    // 0,1 s depois de recomeçar, está armando a perna para trás de novo (e não terminando como antes)
    expect(a.pose.quadrilD).toBeLessThan(fimDoGolpe);
  });
});
