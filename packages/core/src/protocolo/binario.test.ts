import { describe, expect, it } from "vitest";
import { criarRng } from "../util/rng";
import {
  ACAO,
  ANIM,
  BOTAO,
  COMANDO_BYTES,
  FASE,
  SEM_DOMINANTE,
  anguloParaByte,
  byteParaAngulo,
  codificarComando,
  codificarSnapshot,
  decodificarComando,
  decodificarSnapshot,
  magParaByte,
  tamanhoSnapshot,
  type Comando,
  type JogadorSnap,
  type Snapshot,
} from "./binario";

describe("comando de 7 bytes", () => {
  it("tem 7 bytes, tipo 1 e cada campo no lugar certo", () => {
    const c: Comando = { ang: 64, mag: 119, seguros: BOTAO.chute | BOTAO.correr, acao: ACAO.passeSegurado, forca: 200, acaoSeq: 9 };
    const b = codificarComando(c);
    expect(b.length).toBe(COMANDO_BYTES);
    expect([...b]).toEqual([1, 64, 119, 5, 3, 200, 9]);
  });

  it("ida e volta com todos os campos, em todos os valores de byte", () => {
    const rng = criarRng(42);
    for (let i = 0; i < 500; i++) {
      const c: Comando = {
        ang: rng.inteiro(0, 256),
        mag: rng.inteiro(0, 16) * 17,
        seguros: rng.inteiro(0, 8),
        acao: rng.inteiro(0, 4),
        forca: rng.inteiro(0, 256),
        acaoSeq: rng.inteiro(0, 256),
      };
      expect(decodificarComando(codificarComando(c))).toEqual(c);
    }
  });

  it("recusa tamanho errado, tipo errado e ação inexistente", () => {
    expect(decodificarComando(new Uint8Array(6))).toBeNull();
    expect(decodificarComando(new Uint8Array(8))).toBeNull();
    expect(decodificarComando(new Uint8Array([2, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(decodificarComando(new Uint8Array([1, 0, 0, 0, 9, 0, 0]))).toBeNull();
  });

  it("ignora bits acima dos 3 botões", () => {
    expect(decodificarComando(new Uint8Array([1, 0, 0, 0xff, 0, 0, 0]))?.seguros).toBe(7);
  });

  it("ângulo: 0 = direita, 64 = cima da tela, 128 = esquerda, 192 = baixo", () => {
    expect(anguloParaByte(0)).toBe(0);
    expect(anguloParaByte(Math.PI / 2)).toBe(64);
    expect(anguloParaByte(Math.PI)).toBe(128);
    expect(anguloParaByte((3 * Math.PI) / 2)).toBe(192);
    expect(anguloParaByte(-Math.PI / 2)).toBe(192);
    expect(anguloParaByte(2 * Math.PI)).toBe(0);
    expect(byteParaAngulo(64)).toBeCloseTo(Math.PI / 2, 12);
  });

  it("força do joystick vira 16 níveis, múltiplos de 17", () => {
    expect(magParaByte(0)).toBe(0);
    expect(magParaByte(1)).toBe(255);
    expect(magParaByte(0.5)).toBe(136); // 8 · 17
    expect(magParaByte(2)).toBe(255);
    expect(magParaByte(-1)).toBe(0);
    for (let i = 0; i <= 100; i++) expect(magParaByte(i / 100) % 17).toBe(0);
  });
});

function jogadorAleatorio(rng: ReturnType<typeof criarRng>, slot: number): JogadorSnap {
  return {
    slot,
    x: rng.entre(-30, 30),
    z: rng.entre(-19, 19),
    dir: rng.entre(0, Math.PI * 2),
    vel: rng.entre(0, 8.5),
    anim: rng.inteiro(0, 14),
    caido: rng.sorteio(0.5),
    arrancando: rng.sorteio(0.5),
    comBola: rng.sorteio(0.5),
    carregandoChute: rng.sorteio(0.5),
    humano: rng.sorteio(0.5),
    carga: rng.proximo(),
  };
}

describe("snapshot", () => {
  it("com 12 jogadores tem 144 bytes (12 + 12 + 12 · 10)", () => {
    expect(tamanhoSnapshot(12)).toBe(144);
    const s: Snapshot = {
      tick: 1,
      relogio: 100,
      golsCasa: 0,
      golsVisitante: 0,
      fase: FASE.jogo,
      dominante: SEM_DOMINANTE,
      bola: { x: 0, y: 0.11, z: 0, vx: 0, vy: 0, vz: 0 },
      jogadores: Array.from({ length: 12 }, (_, i) => jogadorAleatorio(criarRng(i), i)),
    };
    expect(codificarSnapshot(s).length).toBe(144);
  });

  it("ida e volta com valores aleatórios dentro das resoluções do protocolo", () => {
    const rng = criarRng(2026);
    for (let rodada = 0; rodada < 200; rodada++) {
      const n = rng.inteiro(0, 13);
      const original: Snapshot = {
        tick: rng.inteiro(0, 4_000_000_000),
        relogio: rng.inteiro(0, 4801),
        golsCasa: rng.inteiro(0, 30),
        golsVisitante: rng.inteiro(0, 30),
        fase: rng.inteiro(0, 6),
        dominante: rng.sorteio(0.3) ? SEM_DOMINANTE : rng.inteiro(0, 12),
        bola: {
          x: rng.entre(-31, 31),
          y: rng.entre(0.11, 12),
          z: rng.entre(-20, 20),
          vx: rng.entre(-35, 35),
          vy: rng.entre(-20, 20),
          vz: rng.entre(-35, 35),
        },
        jogadores: Array.from({ length: n }, (_, i) => jogadorAleatorio(rng, i)),
      };

      const volta = decodificarSnapshot(codificarSnapshot(original));
      expect(volta).not.toBeNull();
      const s = volta!;

      expect(s.tick).toBe(original.tick);
      expect(s.relogio).toBe(original.relogio);
      expect(s.golsCasa).toBe(original.golsCasa);
      expect(s.golsVisitante).toBe(original.golsVisitante);
      expect(s.fase).toBe(original.fase);
      expect(s.dominante).toBe(original.dominante);
      for (const k of ["x", "y", "z", "vx", "vy", "vz"] as const) expect(Math.abs(s.bola[k] - original.bola[k])).toBeLessThanOrEqual(0.0051);

      expect(s.jogadores.length).toBe(n);
      original.jogadores.forEach((o, i) => {
        const d = s.jogadores[i]!;
        expect(d.slot).toBe(o.slot);
        expect(Math.abs(d.x - o.x)).toBeLessThanOrEqual(0.0051);
        expect(Math.abs(d.z - o.z)).toBeLessThanOrEqual(0.0051);
        // direção: 1/256 de volta
        const volta = Math.PI * 2;
        const dif = Math.abs(d.dir - o.dir) % volta;
        expect(Math.min(dif, volta - dif)).toBeLessThanOrEqual(volta / 256 / 2 + 1e-9);
        expect(Math.abs(d.vel - o.vel)).toBeLessThanOrEqual(0.0251);
        expect(d.anim).toBe(o.anim);
        expect(d.caido).toBe(o.caido);
        expect(d.arrancando).toBe(o.arrancando);
        expect(d.comBola).toBe(o.comBola);
        expect(d.carregandoChute).toBe(o.carregandoChute);
        expect(d.humano).toBe(o.humano);
        expect(Math.abs(d.carga - o.carga)).toBeLessThanOrEqual(1 / 255 / 2 + 1e-9);
      });
    }
  });

  it("valores negativos e nos extremos do int16 sobrevivem", () => {
    const s: Snapshot = {
      tick: 0xffffffff,
      relogio: 65535,
      golsCasa: 255,
      golsVisitante: 255,
      fase: FASE.fim,
      dominante: SEM_DOMINANTE,
      bola: { x: -30, y: 0, z: -19, vx: -327, vy: 327, vz: -100.5 },
      jogadores: [{ slot: 11, x: -327.68, z: 327.67, dir: 0, vel: 12.75, anim: ANIM.cobranca, caido: true, arrancando: false, comBola: true, carregandoChute: false, humano: true, carga: 1 }],
    };
    const d = decodificarSnapshot(codificarSnapshot(s))!;
    expect(d.tick).toBe(0xffffffff);
    expect(d.relogio).toBe(65535);
    expect(d.bola.x).toBe(-30);
    expect(d.bola.vz).toBe(-100.5);
    expect(d.jogadores[0]!.x).toBeCloseTo(-327.68, 5);
    expect(d.jogadores[0]!.z).toBeCloseTo(327.67, 5);
    expect(d.jogadores[0]!.vel).toBeCloseTo(12.75, 5);
    expect(d.jogadores[0]!.carga).toBe(1);
  });

  it("fora do alcance de int16 é cortado, não estoura", () => {
    const s: Snapshot = {
      tick: 1,
      relogio: 1,
      golsCasa: 0,
      golsVisitante: 0,
      fase: 0,
      dominante: SEM_DOMINANTE,
      bola: { x: 9999, y: 0, z: -9999, vx: 0, vy: 0, vz: 0 },
      jogadores: [],
    };
    const d = decodificarSnapshot(codificarSnapshot(s))!;
    expect(d.bola.x).toBeCloseTo(327.67, 5);
    expect(d.bola.z).toBeCloseTo(-327.68, 5);
  });

  it("recusa tipo errado, tamanho que não bate e lixo", () => {
    const bom = codificarSnapshot({
      tick: 1,
      relogio: 1,
      golsCasa: 0,
      golsVisitante: 0,
      fase: 0,
      dominante: SEM_DOMINANTE,
      bola: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 },
      jogadores: [jogadorAleatorio(criarRng(1), 0)],
    });
    expect(decodificarSnapshot(bom)).not.toBeNull();
    expect(decodificarSnapshot(bom.slice(0, bom.length - 1))).toBeNull();
    const errado = bom.slice();
    errado[0] = 1;
    expect(decodificarSnapshot(errado)).toBeNull();
    expect(decodificarSnapshot(new Uint8Array(5))).toBeNull();
    const mentiroso = bom.slice();
    mentiroso[1] = 7; // diz 7 jogadores mas só tem 1
    expect(decodificarSnapshot(mentiroso)).toBeNull();
  });

  it("decodifica de um pedaço de buffer maior (byteOffset diferente de zero)", () => {
    const bom = codificarSnapshot({
      tick: 77,
      relogio: 5,
      golsCasa: 1,
      golsVisitante: 2,
      fase: 2,
      dominante: 3,
      bola: { x: 1, y: 1, z: 1, vx: 0, vy: 0, vz: 0 },
      jogadores: [],
    });
    const grande = new Uint8Array(bom.length + 10);
    grande.set(bom, 6);
    expect(decodificarSnapshot(grande.subarray(6, 6 + bom.length))?.tick).toBe(77);
  });
});
