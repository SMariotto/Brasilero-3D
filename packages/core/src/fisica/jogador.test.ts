import { describe, expect, it } from "vitest";
import { JOGADOR } from "../constantes";
import { criarCampo } from "./campo";
import { colidirJogadores, limitarAoCampo, novoCorpo, passoJogador, velocidade, type EntradaMovimento } from "./jogador";

const DT = 1 / 60;
const direita: EntradaMovimento = { dx: 1, dz: 0, mag: 1, correr: false, comBola: false };
const parado: EntradaMovimento = { dx: 0, dz: 0, mag: 0, correr: false, comBola: false };

function rodar(c: ReturnType<typeof novoCorpo>, e: EntradaMovimento, segundos: number): void {
  for (let i = 0; i < Math.round(segundos / DT); i++) passoJogador(c, e, DT);
}

describe("jogador: movimento", () => {
  it("acelera até 6,5 m/s e não passa disso", () => {
    const c = novoCorpo(0, 0);
    rodar(c, direita, 2);
    expect(velocidade(c)).toBeCloseTo(JOGADOR.velocidadeMax, 5);
  });

  it("leva cerca de 0,36 s para chegar a 6,5 m/s (aceleração 18 m/s²)", () => {
    const c = novoCorpo(0, 0);
    rodar(c, direita, 0.2);
    expect(velocidade(c)).toBeCloseTo(3.6, 1);
  });

  it("com a bola anda a 90% e arranca a 85% de 8,2", () => {
    const a = novoCorpo(0, 0);
    rodar(a, { ...direita, comBola: true }, 2);
    expect(velocidade(a)).toBeCloseTo(6.5 * 0.9, 5);
    const b = novoCorpo(0, 0);
    rodar(b, { ...direita, comBola: true, correr: true }, 1);
    expect(velocidade(b)).toBeCloseTo(8.2 * 0.85, 5);
  });

  it("joystick pela metade dá metade da velocidade", () => {
    const c = novoCorpo(0, 0);
    rodar(c, { ...direita, mag: 0.5 }, 2);
    expect(velocidade(c)).toBeCloseTo(3.25, 5);
  });

  it("ao soltar o joystick freia mais forte (JOGADOR.freadaSolto) do que acelera (JOGADOR.aceleracao)", () => {
    expect(JOGADOR.freadaSolto).toBeGreaterThan(JOGADOR.aceleracao);
    const c = novoCorpo(0, 0);
    rodar(c, direita, 2);
    const antes = velocidade(c);
    rodar(c, parado, 0.1);
    expect(antes - velocidade(c)).toBeCloseTo(JOGADOR.freadaSolto * 0.1, 1);
    rodar(c, parado, 1);
    expect(velocidade(c)).toBe(0);
  });

  it("a direção do movimento responde na hora e o corpo gira até 720°/s", () => {
    const c = novoCorpo(0, 0, 0);
    // Pede para ir para trás (180°): o corpo leva 0,25 s para virar.
    passoJogador(c, { dx: -1, dz: 0, mag: 1, correr: false, comBola: false }, DT);
    expect(c.vx).toBeLessThan(0.5); // já começou a mudar de direção
    expect(Math.abs(c.dir)).toBeCloseTo((720 * Math.PI) / 180 / 60, 5);
    for (let i = 0; i < 20; i++) passoJogador(c, { dx: -1, dz: 0, mag: 1, correr: false, comBola: false }, DT);
    expect(Math.abs(Math.abs(c.dir) - Math.PI)).toBeLessThan(0.01);
  });

  it("o corpo não gira com o joystick solto", () => {
    const c = novoCorpo(0, 0, 1);
    rodar(c, parado, 1);
    expect(c.dir).toBe(1);
  });
});

describe("jogador: energia e arrancada", () => {
  it("arrancada gasta 25/s e chega a 8,2 m/s", () => {
    const c = novoCorpo(0, 0);
    rodar(c, { ...direita, correr: true }, 1);
    expect(c.energia).toBeCloseTo(75, 0);
    expect(velocidade(c)).toBeCloseTo(8.2, 5);
    expect(c.arrancando).toBe(true);
  });

  it("CORRER sem mexer o joystick não gasta energia", () => {
    const c = novoCorpo(0, 0);
    c.energia = 50;
    rodar(c, { ...parado, correr: true }, 1);
    expect(c.arrancando).toBe(false);
    expect(c.energia).toBeGreaterThan(50);
  });

  it("recupera 12/s sem arrancar, até 100", () => {
    const c = novoCorpo(0, 0);
    c.energia = 40;
    rodar(c, direita, 1);
    expect(c.energia).toBeCloseTo(52, 0);
    rodar(c, parado, 10);
    expect(c.energia).toBe(100);
  });

  it("abaixo de 15 não arranca até voltar a 30", () => {
    const c = novoCorpo(0, 0);
    c.energia = 16;
    const correr = { ...direita, correr: true };
    rodar(c, correr, 0.1); // cai abaixo de 15
    expect(c.exausto).toBe(true);
    expect(c.arrancando).toBe(false);

    // Continua segurando CORRER: não arranca, recupera 12/s e só volta ao passar de 30
    let arrancouAntes = false;
    let tempo = 0;
    while (c.exausto && tempo < 5) {
      passoJogador(c, correr, DT);
      tempo += DT;
      if (c.arrancando) arrancouAntes = true;
    }
    expect(arrancouAntes).toBe(false);
    expect(c.energia).toBeGreaterThanOrEqual(30);
    // 15 → 30 a 12/s leva 1,25 s
    expect(tempo).toBeGreaterThan(1.0);
    expect(tempo).toBeLessThan(1.5);
    passoJogador(c, correr, DT);
    expect(c.arrancando).toBe(true);
  });

  it("a velocidade cai de volta a 6,5 m/s quando a energia acaba", () => {
    const c = novoCorpo(0, 0);
    rodar(c, { ...direita, correr: true }, 6);
    expect(velocidade(c)).toBeLessThan(7);
  });
});

describe("jogador: colisão e limites", () => {
  it("dois jogadores sobrepostos se separam até 0,8 m (dois raios)", () => {
    const a = novoCorpo(0, 0);
    const b = novoCorpo(0.3, 0);
    colidirJogadores([a, b]);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(0.8, 5);
    expect(a.x).toBeCloseTo(-0.25, 5);
    expect(b.x).toBeCloseTo(0.55, 5);
  });

  it("o goleiro (massa 1,3) é empurrado menos que um jogador de linha", () => {
    const a = novoCorpo(0, 0);
    const g = novoCorpo(0.4, 0, 0, true);
    colidirJogadores([a, g]);
    const moveuA = Math.abs(a.x - 0);
    const moveuG = Math.abs(g.x - 0.4);
    expect(moveuG).toBeLessThan(moveuA);
    expect(moveuA + moveuG).toBeCloseTo(0.4, 5);
  });

  it("quem corre contra outro parado perde a velocidade da batida", () => {
    const a = novoCorpo(0, 0);
    a.vx = 6;
    const b = novoCorpo(0.7, 0);
    colidirJogadores([a, b]);
    expect(a.vx).toBeCloseTo(3, 5);
    expect(b.vx).toBeCloseTo(3, 5);
  });

  it("jogadores no mesmo ponto não dão erro", () => {
    const a = novoCorpo(1, 1);
    const b = novoCorpo(1, 1);
    colidirJogadores([a, b]);
    expect(Number.isFinite(a.x) && Number.isFinite(b.x)).toBe(true);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(0.8, 5);
  });

  it("não sai do campo", () => {
    const campo = criarCampo(5, "arena");
    const c = novoCorpo(0, 0);
    c.x = 100;
    c.z = -100;
    c.vx = 5;
    limitarAoCampo(c, campo);
    expect(c.x).toBeCloseTo(campo.metadeComp - 0.4, 5);
    expect(c.z).toBeCloseTo(-(campo.metadeLarg - 0.4), 5);
    expect(c.vx).toBe(0);
  });
});
