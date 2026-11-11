import { describe, expect, it } from "vitest";
import { BOLA, DEFESA, DOMINIO, FACILIDADE_DO_HUMANO, JOGADOR } from "../constantes";
import { FASE } from "../protocolo/binario";
import { CONFIG_PADRAO } from "../protocolo/config";
import { Partida } from "./partida";
import { simularBote, type JeitoDeChegar } from "./simulacao";

// H6: o roubo de bola do humano (bote e carrinho). Os números moram em FACILIDADE_DO_HUMANO.roubo; os do bot, em DEFESA, não mudam.

const F = FACILIDADE_DO_HUMANO.roubo;

/** Um defensor humano (slot 7) e um defensor bot (slot 8) do Visitante, parados, para comparar o bote dos dois. */
function partidaComDefensores(): Partida {
  const p = new Partida({
    config: { ...CONFIG_PADRAO, modo: "campo", n: 5, dificuldade: "medio", duracao: 4 },
    elenco: [
      { slot: 1, time: 0, numero: 7, nome: "Portador", humano: false, goleiro: false },
      { slot: 7, time: 1, numero: 8, nome: "Humano", humano: true, idControle: 1, goleiro: false },
      { slot: 8, time: 1, numero: 9, nome: "Bot", humano: false, goleiro: false },
    ],
    semente: 5,
    semBots: true,
  });
  p.jogador(7)!.corpo.x = 0;
  p.jogador(7)!.corpo.z = 0;
  p.jogador(8)!.corpo.x = 0;
  p.jogador(8)!.corpo.z = 0;
  return p;
}

describe("os números do bote: humano e bot", () => {
  it("o bote do bot continua com os números de DEFESA.bote (a H6 só mexe no humano)", () => {
    expect(DEFESA.bote).toMatchObject({ duracaoS: 0.25, velocidade: 9.5, raioRoubo: 0.8, recargaS: 0.8, distanciaMaxM: 6 });
    expect(DEFESA.carrinho.alcanceExtraM).toBe(0.45);
    const p = partidaComDefensores();
    const bot = p.jogador(8)!;
    expect(p.iniciarBote(bot)).toBe(true);
    expect(bot.bote).toMatchObject({ velocidade: DEFESA.bote.velocidade, raioRoubo: DEFESA.bote.raioRoubo });
    expect(bot.bote!.ate - p.t).toBeCloseTo(DEFESA.bote.duracaoS, 5);
    expect(bot.boteProntoEm - p.t).toBeCloseTo(DEFESA.bote.recargaS, 5);
  });

  it("o bote do humano usa os números da FACILIDADE_DO_HUMANO.roubo", () => {
    const p = partidaComDefensores();
    const h = p.jogador(7)!;
    expect(p.iniciarBote(h)).toBe(true);
    expect(h.bote).toMatchObject({ velocidade: F.boteVelocidade, raioRoubo: F.boteRaioRoubo });
    expect(h.bote!.ate - p.t).toBeCloseTo(F.boteDuracaoS, 5);
    expect(h.boteProntoEm - p.t).toBeCloseTo(F.boteRecargaS, 5);
  });

  it("o bote do humano é mais forte que o de antes da H6 em tudo que ajuda a roubar", () => {
    expect(F.boteRaioRoubo).toBeGreaterThan(DEFESA.bote.raioRoubo);
    expect(F.boteVelocidade * F.boteDuracaoS).toBeGreaterThanOrEqual(DEFESA.bote.velocidade * DEFESA.bote.duracaoS);
    expect(F.boteRecargaS).toBeLessThanOrEqual(DEFESA.bote.recargaS);
    expect(F.boteDistanciaMaxM).toBeGreaterThan(DEFESA.bote.distanciaMaxM);
  });
});

describe("a mira do bote do humano", () => {
  const miraDaBola = (bx: number, bz: number, vx: number, vz: number, humano: boolean): { dx: number; dz: number } => {
    const p = partidaComDefensores();
    p.bola.x = bx;
    p.bola.z = bz;
    p.bola.vx = vx;
    p.bola.vz = vz;
    const j = p.jogador(humano ? 7 : 8)!;
    p.iniciarBote(j);
    return { dx: j.bote!.dx, dz: j.bote!.dz };
  };

  it("com a bola se afastando, mira onde ela vai estar (à frente dela)", () => {
    const m = miraDaBola(3, 0, 5, 5, true);
    expect(m.dz).toBeGreaterThan(0.05); // a bola foge para +Z: o bote já vai um pouco para lá
    expect(Math.hypot(m.dx, m.dz)).toBeCloseTo(1, 5);
  });

  it("com a bola vindo na direção dele, vai onde ela está agora (mirar à frente desviaria o bote)", () => {
    const m = miraDaBola(3, 0, -5, 5, true);
    expect(m.dz).toBeCloseTo(0, 5);
    expect(m.dx).toBeCloseTo(1, 5);
  });

  it("o bot não ganha a mira do humano (miraS 0 por padrão): vai onde a bola está", () => {
    const m = miraDaBola(3, 0, 5, 5, false);
    expect(m.dz).toBeCloseTo(0, 5);
  });
});

describe("o carrinho do humano alcança a bola de mais longe", () => {
  /** Carrinho para +X com a bola solta parada ao lado do trajeto, a `lado` m. Devolve se o carrinho tocou na bola. */
  function tocouNaBola(lado: number, humano: boolean): boolean {
    const p = partidaComDefensores();
    p.fase = FASE.jogo; // o carrinho só vale com a bola em jogo
    const j = p.jogador(humano ? 7 : 8)!;
    p.bola.x = 4;
    p.bola.z = lado;
    p.bola.vx = 0;
    p.bola.vz = 0;
    p.bola.y = BOLA.raio;
    p.definirComando(j.vaga.slot, { ...j.cmd, ang: 0, mag: 255 }); // o carrinho desliza na direção do joystick (para +X)
    expect(p.iniciarCarrinho(j)).toBe(true);
    for (let i = 0; i < 40 && j.carrinho; i++) p.passo();
    return p.bola.vz !== 0 || Math.hypot(p.bola.vx, p.bola.vz) > 1;
  }

  it("a bola ao lado do trajeto, entre o alcance de antes e o de agora, só o humano alcança", () => {
    const antes = JOGADOR.raio + BOLA.raio + DEFESA.carrinho.alcanceExtraM; // 0,96 m
    const agora = JOGADOR.raio + BOLA.raio + F.carrinhoAlcanceExtraM;
    expect(agora).toBeGreaterThan(antes);
    const lado = (antes + agora) / 2;
    expect(tocouNaBola(lado, true)).toBe(true);
    expect(tocouNaBola(antes + 0.2 + (agora - antes), true)).toBe(false); // longe demais até para o humano
  });
});

describe("a pegada: o roubo do humano gruda na bola", () => {
  /** O Visitante (slot 7, humano, parado) está com a bola em x=3; o ladrão (Casa) está a 1,3 m e dá o bote para +X. */
  function roubo(ladraoHumano: boolean): { p: Partida; ladrao: ReturnType<Partida["jogador"]>; dono: ReturnType<Partida["jogador"]> } {
    const p = new Partida({
      config: { ...CONFIG_PADRAO, modo: "campo", n: 5, dificuldade: "medio", duracao: 4 },
      elenco: [
        { slot: 1, time: 0, numero: 7, nome: "Ladrão", humano: ladraoHumano, ...(ladraoHumano ? { idControle: 1 } : {}), goleiro: false },
        { slot: 7, time: 1, numero: 8, nome: "Dono", humano: true, idControle: 2, goleiro: false },
      ],
      semente: 3,
      semBots: true,
    });
    p.fase = FASE.jogo;
    p.posicionarParaTeste(7, 3, 0, 3 - 0.55, 0, Math.PI);
    for (let i = 0; i < 6; i++) p.passo();
    const ladrao = p.jogador(1)!;
    ladrao.corpo.x = 1.3;
    ladrao.corpo.z = 0;
    ladrao.corpo.dir = 0;
    expect(p.dominante).toBe(7);
    expect(p.iniciarBote(ladrao)).toBe(true);
    return { p, ladrao, dono: p.jogador(7)! };
  }

  it("o humano que rouba bloqueia o dono antigo pela pegada; o bot, pelo tempo de sempre", () => {
    const h = roubo(true);
    for (let i = 0; i < 4 && h.p.dominante !== 1; i++) h.p.passo();
    expect(h.p.dominante).toBe(1);
    expect(h.dono!.bloqueioAte - h.p.t).toBeGreaterThan(F.pegadaS - 0.1);

    const b = roubo(false);
    for (let i = 0; i < 4 && b.p.dominante !== 1; i++) b.p.passo();
    expect(b.p.dominante).toBe(1);
    expect(b.dono!.bloqueioAte - b.p.t).toBeLessThanOrEqual(DOMINIO.bloqueioAposChuteS + 1e-9);
  });

  it("o humano sai do avanço na velocidade de correr com a bola (não a 10 m/s) e fica com a bola por 0,4 s sem usar o joystick", () => {
    const { p, ladrao } = roubo(true);
    let maior = 0;
    for (let i = 0; i < 24; i++) {
      p.passo();
      if (!ladrao!.bote) maior = Math.max(maior, Math.hypot(ladrao!.corpo.vx, ladrao!.corpo.vz));
      if (i === 0) maior = 0;
    }
    expect(maior).toBeLessThanOrEqual(JOGADOR.velocidadeMax * JOGADOR.fatorVelocidadeComBola + 0.01);
    expect(p.dominante).toBe(1); // 0,4 s depois do bote, a bola ainda é dele
  });

  it("de frente, a bola que vem contra o avanço (acima do limite de velocidade relativa do domínio) não ricocheteia", () => {
    expect(F.boteVelocidade + 6.84).toBeGreaterThan(DOMINIO.velocidadeRelativaMax); // o caso que quebrava: 16 m/s contra 14
    const taxa = (zigue: boolean): number => {
      let ok = 0;
      for (let s = 0; s < 30; s++) if (simularBote("frente", 1.6, zigue, 10 + s * 17).roubou) ok++;
      return ok / 30;
    };
    expect(taxa(false)).toBeGreaterThanOrEqual(0.95);
    expect(taxa(true)).toBeGreaterThanOrEqual(0.95);
  });
});

describe("taxa de roubo do bote do humano (simularBote)", () => {
  const taxa = (jeito: JeitoDeChegar, D: number, zigue = false, n = 40): number => {
    let apertou = 0;
    let roubou = 0;
    for (let s = 0; s < n; s++) {
      const r = simularBote(jeito, D, zigue, 10 + s * 17);
      if (r.apertou) apertou++;
      if (r.roubou) roubou++;
    }
    return apertou === 0 ? 0 : roubou / apertou;
  };

  it("a 1,5 m da bola: de frente >= 95%, de lado >= 55%, por trás >= 40% (era 100% / 0% / 0%)", () => {
    for (const zigue of [false, true]) {
      expect(taxa("frente", 1.5, zigue)).toBeGreaterThanOrEqual(0.95);
      expect(taxa("lado", 1.5, zigue)).toBeGreaterThanOrEqual(0.55);
      expect(taxa("tras", 1.5, zigue)).toBeGreaterThanOrEqual(0.4);
    }
  });

  it("a chance cai com a distância: roubar de lado ou por trás ainda pede chegar perto", () => {
    expect(taxa("lado", 2.5)).toBeLessThanOrEqual(0.35);
    expect(taxa("tras", 2.5)).toBeLessThanOrEqual(0.15);
    expect(taxa("lado", 3)).toBeLessThanOrEqual(0.1);
    expect(taxa("tras", 3)).toBeLessThanOrEqual(0.1);
    expect(taxa("lado", 2.5)).toBeLessThan(taxa("lado", 1.5));
  });
});
