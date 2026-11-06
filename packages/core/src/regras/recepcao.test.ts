import { describe, expect, it } from "vitest";
import { BOLA, DOMINIO, RECEPCAO } from "../constantes";
import { ANIM, FASE, comandoParado } from "../protocolo/binario";
import { CONFIG_PADRAO } from "../protocolo/config";
import { Partida } from "./partida";

// H1: recepção da bola. Uma bola que chega perto do pé do jogador controlado por humano é amortecida e puxada para o pé,
// só com força na bola (sem teleporte), e o jogador faz uma animação curta de amortecer.

const DT = 1 / 60;

function criar(): Partida {
  const p = new Partida({
    config: { ...CONFIG_PADRAO, modo: "arena", duracao: 4 },
    elenco: [{ slot: 1, time: 0, numero: 7, nome: "Ana", humano: true, idControle: 1, goleiro: false }],
    semente: 4,
    semBots: true,
  });
  for (let i = 0; i < 400 && p.fase !== FASE.jogo; i++) p.passo();
  expect(p.fase).toBe(FASE.jogo);
  return p;
}

interface Resultado {
  dominou: boolean;
  tickDoDomínio: number;
  /** Maior mudança de velocidade da bola num único passo (m/s). */
  maiorSalto: number;
  /** Maior deslocamento da bola num único passo (m). */
  maiorPasso: number;
  ticksDeRecepcao: number;
  /** A bola foi tocada pelo corpo (quicou) em vez de ser recebida? */
  recebida: boolean;
}

/**
 * Lança a bola de 10 m de distância, vinda do ângulo `anguloGraus` (0 = de frente para onde o jogador olha, +X), com a rapidez
 * `v`, passando a `desvio` metros do centro do jogador (parado em (0, 0)).
 */
function lancar(anguloGraus: number, v: number, desvio: number, altura: number = BOLA.raio, vy = 0): Resultado {
  const p = criar();
  const j = p.jogador(1)!;
  p.posicionarParaTeste(1, 0, 0, 0, 0, 0);
  j.cmd = comandoParado();
  const a = (anguloGraus * Math.PI) / 180;
  const ox = Math.cos(a) * 10;
  const oz = Math.sin(a) * 10;
  // Ponto de passagem: desviado para o lado (perpendicular à direção de chegada)
  const px = -Math.sin(a) * desvio;
  const pz = Math.cos(a) * desvio;
  const dx = px - ox;
  const dz = pz - oz;
  const n = Math.hypot(dx, dz);
  const b = p.bola;
  b.x = ox;
  b.y = altura;
  b.z = oz;
  b.vx = (dx / n) * v;
  b.vz = (dz / n) * v;
  b.vy = vy;
  p.dominante = null;

  const r: Resultado = { dominou: false, tickDoDomínio: -1, maiorSalto: 0, maiorPasso: 0, ticksDeRecepcao: 0, recebida: false };
  for (let i = 0; i < 3 * 60; i++) {
    const antes = { x: b.x, z: b.z, vx: b.vx, vz: b.vz };
    p.passo();
    const salto = Math.hypot(b.vx - antes.vx, b.vz - antes.vz);
    r.maiorSalto = Math.max(r.maiorSalto, salto);
    r.maiorPasso = Math.max(r.maiorPasso, Math.hypot(b.x - antes.x, b.z - antes.z));
    if (p.snapshot().jogadores[0]!.anim === ANIM.recepcao) r.ticksDeRecepcao++;
    if (p.dominante === 1 && !r.dominou) {
      r.dominou = true;
      r.tickDoDomínio = i;
    }
  }
  r.recebida = r.dominou;
  return r;
}

describe("recepção da bola: a bola que chega perto do pé é dominada", () => {
  it("de qualquer direção (de frente, dos lados, de trás), a 8 a 16 m/s, passando a até 1,2 m: o jogador domina", () => {
    for (const angulo of [0, 45, 90, 135, 180, 225, 270, 315]) {
      for (const v of [8, 12, 16]) {
        for (const desvio of [0, 0.5, 0.9, 1.2]) {
          const r = lancar(angulo, v, desvio);
          expect(r.dominou, `ângulo ${angulo}°, ${v} m/s, desvio ${desvio} m`).toBe(true);
        }
      }
    }
  });

  it("a bola que passaria a 1 m do jogador (fora do alcance de 0,7 m do domínio de antes) agora é puxada e dominada", () => {
    // Prova de que o domínio de antes não pegaria: o desvio de 1,2 m é maior que DOMINIO.alcance
    expect(1.2).toBeGreaterThan(DOMINIO.alcance);
    const r = lancar(90, 10, 1.2);
    expect(r.dominou).toBe(true);
  });
});

describe("recepção da bola: a física continua mandando (sem teleporte)", () => {
  it("a velocidade e a posição da bola mudam aos poucos, passo a passo", () => {
    for (const [angulo, v, desvio] of [[0, 14, 0.5], [90, 10, 1.1], [180, 16, 0.8], [270, 8, 1.2]] as const) {
      const r = lancar(angulo, v, desvio);
      // O amortecimento tira no máximo (1 - e^(-dt/τ)) da velocidade relativa por passo (+ o puxão): bem abaixo de um salto
      const teto = v * (1 - Math.exp(-DT / RECEPCAO.amortecimentoS)) + RECEPCAO.puxao * DT + 0.5;
      expect(r.maiorSalto, `ângulo ${angulo}°`).toBeLessThan(teto);
      // E a bola nunca "pula" de lugar: no máximo a distância que a velocidade dela permite num passo
      expect(r.maiorPasso, `ângulo ${angulo}°`).toBeLessThan((v + 1) * DT + 0.02);
    }
  });

  it("a bola é puxada para o pé: com a recepção ela chega a ficar perto do ponto de condução em menos de 1 s depois de entrar no raio", () => {
    const r = lancar(0, 12, 0.9);
    expect(r.dominou).toBe(true);
    // 10 m a 12 m/s = ~0,9 s para chegar; domina logo depois (a recepção dura 0,2 s)
    expect(r.tickDoDomínio).toBeLessThan(2 * 60);
  });
});

describe("recepção da bola: a animação", () => {
  it("o jogador amortece com uma animação curta (entre 0,15 e 0,25 s)", () => {
    const r = lancar(0, 12, 0.5);
    expect(r.ticksDeRecepcao).toBeGreaterThanOrEqual(Math.round(0.15 / DT) - 1);
    expect(r.ticksDeRecepcao).toBeLessThanOrEqual(Math.round(0.25 / DT) + 1);
    expect(RECEPCAO.duracaoS).toBeGreaterThanOrEqual(0.15);
    expect(RECEPCAO.duracaoS).toBeLessThanOrEqual(0.25);
  });
});

describe("recepção da bola: quando ela NÃO atua", () => {
  it("bola que passa longe (2,5 m do jogador) segue seu caminho, sem animação", () => {
    const r = lancar(0, 12, 2.5);
    expect(r.dominou).toBe(false);
    expect(r.ticksDeRecepcao).toBe(0);
  });

  it("bola alta (2 m) passa por cima, sem recepção", () => {
    const r = lancar(0, 12, 0.3, 2.5, 4); // lançada em arco: chega ao jogador a ~2,4 m de altura
    expect(r.ticksDeRecepcao).toBe(0);
  });

  it("chute forte demais (30 m/s) não é amortecido: nem começa a recepção", () => {
    const r = lancar(0, 30, 0.3);
    expect(r.ticksDeRecepcao).toBe(0);
  });

  it("bola que se afasta do jogador (ele acabou de chutar) não é puxada de volta", () => {
    const p = criar();
    p.posicionarParaTeste(1, 0, 0, 0.6, 0, 0);
    for (let i = 0; i < 10; i++) p.passo();
    expect(p.dominante).toBe(1);
    // Chuta: a bola sai e o jogador fica bloqueado por 0,25 s
    p.chutarComo(p.jogador(1)!, 1, 1, 0);
    let recepcao = 0;
    for (let i = 0; i < 60; i++) {
      p.passo();
      if (p.snapshot().jogadores[0]!.anim === ANIM.recepcao) recepcao++;
    }
    expect(recepcao).toBe(0);
    expect(p.bola.x).toBeGreaterThan(5); // a bola foi embora
  });

  it("uma recepção só por vez: não recomeça enquanto está em recarga", () => {
    const r = lancar(0, 5, 0.3);
    expect(r.ticksDeRecepcao).toBeLessThanOrEqual(Math.round(RECEPCAO.duracaoS / DT) + 1);
  });
});
