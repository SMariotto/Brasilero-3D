import { describe, expect, it } from "vitest";
import { JOGADOR } from "../constantes";
import { criarCampo } from "./campo";
import { colidirJogadores, fracaoDaInclinacao, inclinacaoParaFracao, limitarAoCampo, novoCorpo, passoJogador, velocidade, type EntradaMovimento } from "./jogador";

const DT = 1 / 60;
const direita: EntradaMovimento = { dx: 1, dz: 0, mag: 1, comBola: false };
const parado: EntradaMovimento = { dx: 0, dz: 0, mag: 0, comBola: false };

function rodar(c: ReturnType<typeof novoCorpo>, e: EntradaMovimento, segundos: number): void {
  for (let i = 0; i < Math.round(segundos / DT); i++) passoJogador(c, e, DT);
}

describe("jogador: movimento", () => {
  it("acelera até a velocidade máxima e não passa disso", () => {
    const c = novoCorpo(0, 0);
    rodar(c, direita, 2);
    expect(velocidade(c)).toBeCloseTo(JOGADOR.velocidadeMax, 5);
  });

  it("na largada acelera com JOGADOR.aceleracao", () => {
    const c = novoCorpo(0, 0);
    rodar(c, direita, 0.2);
    expect(velocidade(c)).toBeCloseTo(JOGADOR.aceleracao * 0.2, 1);
  });

  it("com a bola nos pés corre a 90% da velocidade máxima", () => {
    const a = novoCorpo(0, 0);
    rodar(a, { ...direita, comBola: true }, 2);
    expect(velocidade(a)).toBeCloseTo(JOGADOR.velocidadeMax * JOGADOR.fatorVelocidadeComBola, 5);
  });

  it("joystick pela metade anda (curva suave): velocidade = fracaoDaInclinacao(0,5) da máxima", () => {
    const c = novoCorpo(0, 0);
    rodar(c, { ...direita, mag: 0.5 }, 2);
    expect(velocidade(c)).toBeCloseTo(fracaoDaInclinacao(0.5) * JOGADOR.velocidadeMax, 5);
    expect(velocidade(c)).toBeGreaterThan(0.3 * JOGADOR.velocidadeMax);
    expect(velocidade(c)).toBeLessThan(0.6 * JOGADOR.velocidadeMax);
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
    passoJogador(c, { dx: -1, dz: 0, mag: 1, comBola: false }, DT);
    expect(c.vx).toBeLessThan(0.5); // já começou a mudar de direção
    expect(Math.abs(c.dir)).toBeCloseTo((720 * Math.PI) / 180 / 60, 5);
    for (let i = 0; i < 20; i++) passoJogador(c, { dx: -1, dz: 0, mag: 1, comBola: false }, DT);
    expect(Math.abs(Math.abs(c.dir) - Math.PI)).toBeLessThan(0.01);
  });

  it("o corpo não gira com o joystick solto", () => {
    const c = novoCorpo(0, 0, 1);
    rodar(c, parado, 1);
    expect(c.dir).toBe(1);
  });
});

describe("jogador: sem stamina, a velocidade segue a inclinação do joystick (H3)", () => {
  it("o corpo não tem energia nem estado de arrancada", () => {
    const c = novoCorpo(0, 0);
    expect("energia" in c).toBe(false);
    expect("arrancando" in c).toBe(false);
    expect("exausto" in c).toBe(false);
  });

  it("correr sempre: 30 s com o joystick cheio e a velocidade não cai (sem cansaço)", () => {
    const c = novoCorpo(0, 0);
    rodar(c, direita, 30);
    expect(velocidade(c)).toBeCloseTo(JOGADOR.velocidadeMax, 5);
  });

  it("a curva vai de zero (inclinação mínima) a 1 (inclinação de correr), sem degrau e sempre subindo", () => {
    expect(fracaoDaInclinacao(0)).toBe(0);
    expect(fracaoDaInclinacao(JOGADOR.inclinacaoAnda)).toBe(0);
    expect(fracaoDaInclinacao(JOGADOR.inclinacaoCorre)).toBe(1);
    expect(fracaoDaInclinacao(1)).toBe(1);
    let anterior = 0;
    let maiorSalto = 0;
    for (let m = 0; m <= 1.0001; m += 0.005) {
      const f = fracaoDaInclinacao(m);
      expect(f).toBeGreaterThanOrEqual(anterior);
      maiorSalto = Math.max(maiorSalto, f - anterior);
      anterior = f;
    }
    // Entre duas inclinações vizinhas (0,005) a velocidade nunca dá um pulo: no máximo 3% da máxima
    expect(maiorSalto).toBeLessThan(0.03);
  });

  it("inclinação leve anda e dá para conduzir a bola devagar; inclinação total corre", () => {
    const v = (mag: number): number => fracaoDaInclinacao(mag) * JOGADOR.velocidadeMax;
    expect(v(0.3)).toBeLessThan(2); // andando devagar
    expect(v(0.5)).toBeGreaterThan(2);
    expect(v(0.5)).toBeLessThan(0.6 * JOGADOR.velocidadeMax);
    expect(v(0.8)).toBeGreaterThan(0.8 * JOGADOR.velocidadeMax);
    expect(v(1)).toBe(JOGADOR.velocidadeMax);
  });

  it("o inverso (usado pelos bots) devolve a inclinação que dá a fração pedida", () => {
    for (const f of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      expect(fracaoDaInclinacao(inclinacaoParaFracao(f)), `fração ${f}`).toBeCloseTo(f, 3);
    }
    expect(inclinacaoParaFracao(2)).toBeLessThanOrEqual(1);
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
