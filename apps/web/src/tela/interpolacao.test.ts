import { describe, expect, it } from "vitest";
import { FASE, SEM_DOMINANTE, type Snapshot } from "@b3d/core";
import { ATRASO_INICIAL_MS, ATRASO_MAX_MS, ATRASO_MIN_MS, EXTRAPOLA_MAX_MS, Interpolador } from "./interpolacao";

/** Snapshot simples: a bola e um jogador no mesmo X, tick em múltiplos de 2 (30 Hz). */
function snap(tick: number, x: number, extra: Partial<Snapshot> = {}, dir = 0): Snapshot {
  return {
    tick,
    relogio: 1000,
    golsCasa: 0,
    golsVisitante: 0,
    fase: FASE.jogo,
    dominante: SEM_DOMINANTE,
    bola: { x, y: 0.11, z: 0, vx: 0, vy: 0, vz: 0 },
    jogadores: [{ slot: 1, x, z: 0, dir, vel: 0, anim: 0, caido: false, arrancando: false, comBola: false, carregandoChute: false, humano: true, carga: 0 }],
    ...extra,
  };
}

const MS_TICK = 1000 / 60;

/** Alimenta o interpolador como a rede faria: um snapshot a cada 2 ticks, chegando com `latencia` ms de atraso. */
function alimentar(it: Interpolador, de: number, ate: number, xPorTick: number, latencia: (i: number) => number = () => 20): void {
  for (let tick = de; tick <= ate; tick += 2) {
    it.adicionar(snap(tick, tick * xPorTick), tick * MS_TICK + latencia(tick));
  }
}

describe("Interpolador", () => {
  it("sem snapshot nenhum não devolve nada", () => {
    expect(new Interpolador().amostrar(1000)).toBeNull();
  });

  it("com um snapshot só, devolve ele", () => {
    const it = new Interpolador();
    it.adicionar(snap(10, 5), 100);
    expect(it.amostrar(5000)?.bola.x).toBe(5);
  });

  it("desenha no passado e interpola entre os dois snapshots que cercam o instante", () => {
    const it = new Interpolador();
    alimentar(it, 0, 120, 0.1); // 6 m/s
    // Agora local = tick 120 (2000 ms) + 20 ms de rede; o desenho fica `atrasoMs` atrás
    const agora = 120 * MS_TICK + 20;
    const a = it.amostrar(agora)!;
    const esperado = ((agora - 20 - it.atrasoMs) / MS_TICK) * 0.1;
    expect(a.bola.x).toBeCloseTo(esperado, 1);
    // E o jogador anda junto com a bola
    expect(a.jogadores[0]!.x).toBeCloseTo(a.bola.x, 5);
  });

  it("é contínuo: em passos de 4 ms a posição nunca dá salto", () => {
    const it = new Interpolador();
    alimentar(it, 0, 200, 0.1);
    let anterior = it.amostrar(1000)!.bola.x;
    for (let t = 1004; t < 3000; t += 4) {
      const x = it.amostrar(t)!.bola.x;
      expect(Math.abs(x - anterior)).toBeLessThan(0.05);
      expect(x).toBeGreaterThanOrEqual(anterior - 1e-9);
      anterior = x;
    }
  });

  it("começa com atraso de 100 ms e fica no mínimo de 66 ms com rede estável", () => {
    const it = new Interpolador();
    expect(it.atrasoMs).toBe(ATRASO_INICIAL_MS);
    alimentar(it, 0, 1200, 0.1, () => 20);
    expect(it.atrasoMs).toBeCloseTo(ATRASO_MIN_MS, 0);
  });

  it("com jitter alto o atraso sobe, e nunca passa de 200 ms", () => {
    const it = new Interpolador();
    // Latência alterna entre 20 e 200 ms
    alimentar(it, 0, 600, 0.1, (tick) => ((tick / 2) % 2 === 0 ? 20 : 200));
    expect(it.atrasoMs).toBeGreaterThan(ATRASO_MIN_MS + 30);
    expect(it.atrasoMs).toBeLessThanOrEqual(ATRASO_MAX_MS);
  });

  it("o atraso volta a baixar devagar quando a rede melhora", () => {
    const it = new Interpolador();
    alimentar(it, 0, 300, 0.1, (tick) => ((tick / 2) % 2 === 0 ? 20 : 200));
    const alto = it.atrasoMs;
    alimentar(it, 302, 1500, 0.1, () => 20);
    expect(it.atrasoMs).toBeLessThan(alto);
  });

  it("faltando snapshot, a bola segue com a velocidade por até 100 ms e depois congela", () => {
    const it = new Interpolador();
    for (let tick = 0; tick <= 20; tick += 2) {
      const s = snap(tick, tick * 0.1);
      s.bola.vx = 6;
      it.adicionar(s, tick * MS_TICK + 20);
    }
    const ultimoT = 20 * MS_TICK;
    // Hora local em que o instante desenhado cai `apos` ms depois do último snapshot (rede estável: 20 ms de caminho)
    const quando = (apos: number) => ultimoT + 20 + it.atrasoMs + apos;
    const x0 = it.amostrar(quando(0))!.bola.x;
    const x50 = it.amostrar(quando(50))!.bola.x;
    const x100 = it.amostrar(quando(EXTRAPOLA_MAX_MS))!.bola.x;
    const x500 = it.amostrar(quando(500))!.bola.x;
    expect(x50 - x0).toBeCloseTo(6 * 0.05, 1);
    expect(x100 - x0).toBeCloseTo(6 * 0.1, 1);
    expect(x500).toBeCloseTo(x100, 5);
  });

  it("o ângulo interpola pelo caminho mais curto (359° para 1° passa por 0°)", () => {
    const it = new Interpolador();
    const volta = Math.PI * 2;
    it.adicionar(snap(0, 0, {}, volta - 0.05), 0);
    it.adicionar(snap(2, 0, {}, 0.05), MS_TICK * 2);
    // Alvo bem no meio dos dois
    const meio = it.amostrar(MS_TICK + it.atrasoMs)!.jogadores[0]!.dir;
    const dist = Math.min(Math.abs(meio), Math.abs(meio - volta));
    expect(dist).toBeLessThan(0.02);
  });

  it("teletransporte (saída de bola) não desliza: pula direto", () => {
    const it = new Interpolador();
    it.adicionar(snap(0, 25), 0);
    it.adicionar(snap(2, 0), MS_TICK * 2); // reposicionou
    const meio = it.amostrar(MS_TICK + it.atrasoMs)!;
    expect(meio.bola.x).toBe(0);
    expect(meio.jogadores[0]!.x).toBe(0);
  });

  it("campos discretos (placar, fase, dominante) vêm do snapshot mais perto", () => {
    const it = new Interpolador();
    it.adicionar(snap(0, 0, { golsCasa: 0, dominante: 1 }), 0);
    it.adicionar(snap(2, 0, { golsCasa: 1, dominante: SEM_DOMINANTE }), MS_TICK * 2);
    const perto = (k: number) => it.amostrar(MS_TICK * 2 * k + it.atrasoMs)!;
    expect(perto(0.2).golsCasa).toBe(0);
    expect(perto(0.2).dominante).toBe(1);
    expect(perto(0.8).golsCasa).toBe(1);
    expect(perto(0.8).dominante).toBe(SEM_DOMINANTE);
  });

  it("tick que volta para trás (revanche) reinicia, e tick repetido é ignorado", () => {
    const it = new Interpolador();
    alimentar(it, 0, 100, 0.1);
    const n = it.tamanho;
    it.adicionar(snap(100, 10), 5000); // repetido
    expect(it.tamanho).toBe(n);
    it.adicionar(snap(2, 0), 6000); // partida nova
    expect(it.tamanho).toBe(1);
    expect(Math.abs(it.atrasoMs - ATRASO_INICIAL_MS)).toBeLessThan(5);
  });

  it("não deixa o buffer crescer sem limite", () => {
    const it = new Interpolador();
    alimentar(it, 0, 3000, 0.01);
    expect(it.tamanho).toBeLessThanOrEqual(150);
  });

  it("jogador que aparece só no snapshot novo não quebra", () => {
    const it = new Interpolador();
    it.adicionar(snap(0, 0), 0);
    const novo = snap(2, 1);
    novo.jogadores.push({ ...novo.jogadores[0]!, slot: 7, x: 3 });
    it.adicionar(novo, MS_TICK * 2);
    const a = it.amostrar(MS_TICK + it.atrasoMs)!;
    expect(a.jogadores.map((j) => j.slot)).toEqual([1, 7]);
  });
});
