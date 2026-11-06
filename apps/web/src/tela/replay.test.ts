import { describe, expect, it } from "vitest";
import { FASE, SEM_DOMINANTE, type Snapshot } from "@b3d/core";
import { amostrarEmTick } from "./interpolacao";
import { ANTES_DO_GOL_S, DEPOIS_DO_GOL_S, GravadorDeReplay, JANELA_S, Reproducao, VELOCIDADE } from "./replay";

function snap(tick: number, x = tick * 0.1): Snapshot {
  return {
    tick,
    relogio: 1000,
    golsCasa: 0,
    golsVisitante: 0,
    fase: FASE.jogo,
    dominante: SEM_DOMINANTE,
    bola: { x, y: 0.11, z: 0, vx: 0, vy: 0, vz: 0 },
    jogadores: [{ slot: 1, x, z: 0, dir: 0, vel: 0, anim: 0, caido: false, comBola: false, carregandoChute: false, humano: true, carga: 0 }],
  };
}

function gravar(g: GravadorDeReplay, ate: number): void {
  for (let t = 0; t <= ate; t += 2) g.capturar(snap(t));
}

describe("amostrarEmTick", () => {
  it("interpola entre os snapshots que cercam o tick e para nas pontas", () => {
    // Os saltos entre snapshots são pequenos (menos de 8 m); salto grande é teletransporte e não desliza
    const seq = [snap(0, 0), snap(2, 4), snap(4, 10)];
    expect(amostrarEmTick(seq, 1)!.bola.x).toBeCloseTo(2, 6);
    expect(amostrarEmTick(seq, 3)!.bola.x).toBeCloseTo(7, 6);
    expect(amostrarEmTick(seq, -5)!.bola.x).toBe(0);
    expect(amostrarEmTick(seq, 99)!.bola.x).toBe(10);
    expect(amostrarEmTick([], 1)).toBeNull();
  });
});

describe("GravadorDeReplay", () => {
  it("guarda só os últimos 6 s (360 ticks)", () => {
    const g = new GravadorDeReplay();
    gravar(g, 2000);
    const t = g.trecho(2000 - 60);
    expect(t.length).toBeGreaterThan(0);
    expect(g.tamanho).toBeLessThanOrEqual((JANELA_S * 60) / 2 + 3);
    // O que ficou para trás da janela foi descartado
    expect(g.trecho(100)).toEqual([]);
  });

  it("o trecho do gol vai de 3,2 s antes até 0,4 s depois", () => {
    const g = new GravadorDeReplay();
    gravar(g, 1000);
    const t = g.trecho(900);
    expect(t[0]!.tick).toBeGreaterThanOrEqual(900 - ANTES_DO_GOL_S * 60 - 2);
    expect(t[0]!.tick).toBeLessThanOrEqual(900 - ANTES_DO_GOL_S * 60 + 2);
    expect(t[t.length - 1]!.tick).toBeLessThanOrEqual(900 + DEPOIS_DO_GOL_S * 60);
    expect(t[t.length - 1]!.tick).toBeGreaterThanOrEqual(900 + DEPOIS_DO_GOL_S * 60 - 2);
  });

  it("tick que volta (partida nova) limpa o buffer e tick repetido é ignorado", () => {
    const g = new GravadorDeReplay();
    gravar(g, 100);
    const n = g.tamanho;
    g.capturar(snap(100));
    expect(g.tamanho).toBe(n);
    g.capturar(snap(2));
    expect(g.tamanho).toBe(1);
  });

  it("reiniciar esvazia", () => {
    const g = new GravadorDeReplay();
    gravar(g, 100);
    g.reiniciar();
    expect(g.tamanho).toBe(0);
  });
});

describe("Reproducao", () => {
  const seq = Array.from({ length: 100 }, (_, i) => snap(i * 2, i * 2));

  it("toca em câmera lenta: dura (ticks / 60) / 0,8 segundos", () => {
    const r = new Reproducao(seq, 0, 1);
    expect(r.duracaoS).toBeCloseTo(198 / 60 / VELOCIDADE, 6);
    expect(r.terminou(r.duracaoS * 1000 - 50)).toBe(false);
    expect(r.terminou(r.duracaoS * 1000 + 50)).toBe(true);
  });

  it("a bola anda a 80% da velocidade normal", () => {
    const r = new Reproducao(seq, 1000, 1);
    const a = r.amostrar(1000 + 1000)!; // 1 s depois
    // Em 1 s real a 0,8x passam 48 ticks: a bola (x = tick) está em 48
    expect(a.bola.x).toBeCloseTo(48, 3);
  });

  it("trecho com menos de 2 snapshots é vazio e já termina", () => {
    const r = new Reproducao([snap(0)], 0, -1);
    expect(r.vazia).toBe(true);
    expect(r.terminou(0)).toBe(true);
  });

  it("guarda de qual gol é o replay", () => {
    expect(new Reproducao(seq, 0, -1).lado).toBe(-1);
  });
});
