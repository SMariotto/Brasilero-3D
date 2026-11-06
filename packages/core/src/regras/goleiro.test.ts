import { describe, expect, it } from "vitest";
import { GOLEIRO } from "../constantes";
import { CONFIG_PADRAO, type Config } from "../protocolo/config";
import { ACAO, ANIM, BOTAO, FASE, anguloParaByte, comandoParado, magParaByte, type Comando } from "../protocolo/binario";
import { Partida, type VagaPartida } from "./partida";

const CASA = 1;
const GOLEIRO_VIS = 6;
const GOLEIRO_CASA = 0;

const humano = (slot: number, time: 0 | 1): VagaPartida => ({ slot, time, numero: slot, nome: `J${slot}`, humano: true, idControle: slot, goleiro: false });
const goleiro = (slot: number, time: 0 | 1): VagaPartida => ({ slot, time, numero: 1, nome: `G${slot}`, humano: false, goleiro: true });

/** Um humano da Casa contra o goleiro do Visitante (que defende o gol de X positivo). Sem bots de linha. */
function criar(opcoes: Partial<Config> = {}, semente = 1, extra: VagaPartida[] = []): Partida {
  return new Partida({
    config: { ...CONFIG_PADRAO, modo: "campo", duracao: 4, ...opcoes },
    elenco: [humano(CASA, 0), goleiro(GOLEIRO_VIS, 1), goleiro(GOLEIRO_CASA, 0), ...extra],
    semente,
    semBots: true,
  });
}

function rodar(p: Partida, s: number): void {
  for (let i = 0; i < Math.round(s * 60); i++) p.passo();
}

const cmd = (extra: Partial<Comando> & { dirRad?: number; forca01?: number } = {}): Comando => {
  const { dirRad, forca01, ...resto } = extra;
  return { ...comandoParado(), ang: anguloParaByte(dirRad ?? 0), mag: magParaByte(forca01 ?? 0), ...resto };
};

/** Solta o jogo, põe a Casa e a bola e deixa o goleiro do Visitante ir para a posição. */
function emJogo(p: Partida): void {
  rodar(p, 6.2);
  expect(p.fase).toBe(FASE.jogo);
  p.eventosPendentes();
}

let seq = 0;
/** Chute com a carga dada (0 a 1), na direção do ponto (x, z). */
function chutarPara(p: Partida, slot: number, x: number, z: number, carga: number): void {
  const j = p.jogador(slot)!;
  const dx = x - j.corpo.x;
  const dz = z - j.corpo.z;
  const a = Math.atan2(-dz, dx); // direção do joystick (cima = -Z)
  // Joystick na força mínima: só mira, sem fazer o jogador correr durante a carga
  p.definirComando(slot, cmd({ dirRad: a, forca01: 1 / 15, seguros: BOTAO.chute }));
  rodar(p, Math.max(0.03, carga * 0.8));
  seq = (seq + 1) & 255;
  p.definirComando(slot, cmd({ dirRad: a, forca01: 1 / 15, seguros: 0, acao: ACAO.chute, forca: Math.round(carga * 255), acaoSeq: seq }));
  p.passo();
  p.definirComando(slot, cmd());
}

/** Prepara um chute: jogador em (x, z) com a bola dominada, goleiro já posicionado. */
function prepararChute(p: Partida, x: number, z: number): void {
  p.posicionarParaTeste(CASA, x, z, x + 0.55, z, 0);
  rodar(p, 1.2);
  expect(p.dominante).toBe(CASA);
}

describe("goleiro: posição", () => {
  it("fica sobre a linha entre a bola e o centro do gol, adiantado de 0,5 a 3 m", () => {
    const p = criar();
    emJogo(p);
    p.posicionarParaTeste(CASA, 0, 0, 0.55, 0);
    rodar(p, 3);
    const g = p.jogador(GOLEIRO_VIS)!.corpo;
    // Bola longe (30 m do gol): adiantado ~3 m
    expect(g.x).toBeGreaterThan(p.campo.metadeComp - 3.6);
    expect(g.x).toBeLessThan(p.campo.metadeComp - 2.4);
    expect(Math.abs(g.z)).toBeLessThan(0.3);

    // Bola perto (5 m do gol): quase na linha
    p.posicionarParaTeste(CASA, 24, 0, 25, 0);
    p.bola.vx = 0;
    p.jogador(CASA)!.bloqueioAte = 99;
    rodar(p, 3);
    expect(g.x).toBeGreaterThan(p.campo.metadeComp - 1.6);
  });

  it("acompanha a bola para o lado, na linha dela com o centro do gol, sem sair da área", () => {
    const p = criar();
    emJogo(p);
    p.posicionarParaTeste(CASA, 20, 14, 20.55, 14);
    p.jogador(CASA)!.bloqueioAte = 99;
    rodar(p, 3);
    const g = p.jogador(GOLEIRO_VIS)!.corpo;
    expect(g.z).toBeGreaterThan(0.3); // foi para o lado da bola
    expect(Math.abs(g.z)).toBeLessThanOrEqual(p.campo.areaLarg / 2);
    expect(g.x).toBeGreaterThanOrEqual(p.campo.metadeComp - p.campo.areaProf);
    expect(g.x).toBeLessThanOrEqual(p.campo.metadeComp);
  });

  it("o goleiro da Casa defende o gol de X negativo", () => {
    const p = criar();
    emJogo(p);
    p.posicionarParaTeste(CASA, 0, 0, 0.55, 0);
    rodar(p, 3);
    expect(p.jogador(GOLEIRO_CASA)!.corpo.x).toBeLessThan(-p.campo.metadeComp + 4);
  });
});

describe("goleiro: defesa", () => {
  it("encaixa um chute fraco no meio do gol (abaixo de 18 m/s)", () => {
    const p = criar();
    emJogo(p);
    prepararChute(p, 18, 0);
    chutarPara(p, CASA, p.campo.metadeComp, 0, 0.05);
    rodar(p, 1);
    expect(p.placar).toEqual([0, 0]);
    expect(p.dominante).toBe(GOLEIRO_VIS);
    expect(p.eventosPendentes().find((e) => e.tipo === "defesa")).toMatchObject({ dados: { slot: GOLEIRO_VIS, encaixou: true } });
  });

  it("encaixa o chute fraco em qualquer dificuldade (não há chance de falha abaixo de 18 m/s)", () => {
    for (const dificuldade of ["facil", "medio", "dificil"] as const) {
      for (let semente = 1; semente <= 6; semente++) {
        const p = criar({ dificuldade }, semente);
        emJogo(p);
        prepararChute(p, 18, 0);
        chutarPara(p, CASA, p.campo.metadeComp, 0, 0.05);
        rodar(p, 1);
        expect(p.placar).toEqual([0, 0]);
      }
    }
  });

  it("chute forte no meio do gol: ele espalma (a bola sai para o lado e não é gol)", () => {
    let defesas = 0;
    let gols = 0;
    for (let semente = 1; semente <= 30; semente++) {
      const p = criar({ dificuldade: "dificil" }, semente);
      emJogo(p);
      prepararChute(p, 10, 0); // 20 m: longe demais para a cavadinha (H4: o goleiro que sai da linha a tornou possível a até 16 m)
      chutarPara(p, CASA, p.campo.metadeComp, 0, 1);
      rodar(p, 0.8);
      if (p.placar[0] === 1) gols++;
      if (p.eventosPendentes().some((e) => e.tipo === "defesa")) defesas++;
    }
    expect(gols).toBeLessThanOrEqual(4); // falha só ~5% no Difícil
    expect(defesas).toBeGreaterThanOrEqual(25);
  });

  it("quem espalma deixa a bola sair para o lado, e ele não a encaixa na hora", () => {
    const p = criar({ dificuldade: "dificil" }, 4);
    emJogo(p);
    prepararChute(p, 18, 0);
    chutarPara(p, CASA, p.campo.metadeComp, 0.3, 1);
    rodar(p, 0.5);
    const defesa = p.eventosPendentes().find((e) => e.tipo === "defesa");
    if (defesa && (defesa as { dados: { encaixou: boolean } }).dados.encaixou === false) {
      expect(Math.abs(p.bola.vz)).toBeGreaterThan(3);
      expect(p.dominante).not.toBe(GOLEIRO_VIS);
    }
    expect(p.placar[0]).toBe(0);
  });

  it("o Fácil falha mais que o Difícil (chute forte, vários sorteios)", () => {
    const golsCom = (dificuldade: Config["dificuldade"]): number => {
      let gols = 0;
      for (let semente = 1; semente <= 60; semente++) {
        const p = criar({ dificuldade }, semente);
        emJogo(p);
        prepararChute(p, 10, 0);
        chutarPara(p, CASA, p.campo.metadeComp, 0, 1);
        rodar(p, 0.8);
        if (p.placar[0] === 1) gols++;
      }
      return gols;
    };
    const facil = golsCom("facil");
    const dificil = golsCom("dificil");
    expect(facil).toBeGreaterThan(dificil);
    expect(facil).toBeGreaterThan(5);
  });

  it("mergulha para o canto e defende um chute médio que ele alcança", () => {
    let mergulhou = false;
    let gols = 0;
    for (let semente = 1; semente <= 12; semente++) {
      const p = criar({ dificuldade: "dificil" }, semente);
      emJogo(p);
      prepararChute(p, 18, 0);
      chutarPara(p, CASA, p.campo.metadeComp, 2.2, 0.55); // ~24 m/s para o canto
      for (let i = 0; i < 60; i++) {
        p.passo();
        const g = p.snapshot().jogadores.find((j) => j.slot === GOLEIRO_VIS)!;
        if (g.anim === ANIM.goleiroMergulhoEsq || g.anim === ANIM.goleiroMergulhoDir) mergulhou = true;
      }
      if (p.placar[0] === 1) gols++;
    }
    expect(mergulhou).toBe(true);
    expect(gols).toBeLessThanOrEqual(5);
  });

  it("chute no ângulo, perto e rápido, o goleiro não chega: é gol", () => {
    let gols = 0;
    for (let semente = 1; semente <= 10; semente++) {
      const p = criar({ dificuldade: "dificil" }, semente);
      emJogo(p);
      prepararChute(p, 24, 0);
      chutarPara(p, CASA, p.campo.metadeComp, 2.7, 1);
      rodar(p, 1);
      if (p.placar[0] === 1) gols++;
    }
    expect(gols).toBeGreaterThanOrEqual(5); // H3: todo mundo corre sempre, o goleiro também (antes: 7)
  });

  it("o atraso de reação vem da dificuldade (Fácil 0,30 s, Médio 0,22 s, Difícil 0,15 s)", () => {
    expect(GOLEIRO.reacaoS).toEqual({ facil: 0.3, medio: 0.22, dificil: 0.15 });
  });

  it("goleiro de verdade com a bola na mão: ninguém tira (o bote é ignorado)", () => {
    const p = criar({ dificuldade: "dificil" });
    emJogo(p);
    prepararChute(p, 18, 0);
    chutarPara(p, CASA, p.campo.metadeComp, 0, 0.05);
    rodar(p, 0.7);
    expect(p.dominante).toBe(GOLEIRO_VIS);
    const g = p.jogador(GOLEIRO_VIS)!.corpo;
    const j = p.jogador(CASA)!;
    j.corpo.x = g.x - 1.1;
    j.corpo.z = g.z;
    p.definirComando(CASA, cmd({ seguros: BOTAO.passe }));
    rodar(p, 0.1);
    expect(p.dominante).toBe(GOLEIRO_VIS);
    // H4: com o adversário em cima ele solta a bola logo (lança), mas ninguém a rouba da mão dele
    rodar(p, 0.6);
    expect(p.eventosPendentes().some((e) => e.tipo === "roubo")).toBe(false);
    expect(p.dominante).not.toBe(CASA);
  });

  it("H4: com a bola na mão segura até ${GOLEIRO.maosS} s e lança (sem companheiro livre: longe e para o lado, nunca para o meio)", () => {
    const p = criar();
    emJogo(p);
    prepararChute(p, 18, 0);
    chutarPara(p, CASA, p.campo.metadeComp, 0, 0.05);
    let pegou = -1;
    for (let i = 0; i < 120 && pegou < 0; i++) {
      p.passo();
      if (p.dominante === GOLEIRO_VIS) pegou = p.t;
    }
    expect(pegou).toBeGreaterThan(0);
    p.eventosPendentes();
    while (p.t - pegou < GOLEIRO.maosS - 0.15) p.passo();
    expect(p.dominante).toBe(GOLEIRO_VIS);
    while (p.t - pegou < GOLEIRO.maosS + 0.3) p.passo();
    expect(p.dominante).toBeNull();
    const ev = p.eventosPendentes().find((e) => e.tipo === "passe");
    expect(ev).toMatchObject({ dados: { de: GOLEIRO_VIS, alto: true } });
    expect((ev as { dados: { para?: number } }).dados.para).toBeUndefined();
    expect(p.bola.vx).toBeLessThan(0); // o goleiro do Visitante repõe para o gol da Casa (X negativo)
    expect(p.bola.vy).toBeGreaterThan(4); // por cima
    // Para o lado: onde a bola vai cair, longe do meio do gol
    let zFinal = 0;
    for (let i = 0; i < 150; i++) {
      p.passo();
      if (p.bola.y < 0.2 && i > 20) {
        zFinal = p.bola.z;
        break;
      }
    }
    expect(Math.abs(zFinal)).toBeGreaterThan(p.campo.areaLarg / 2);
  });

  it("com um companheiro livre, repõe com passe para ele", () => {
    const p = criar({}, 1, [humano(8, 1)]);
    emJogo(p);
    const parceiro = p.jogador(8)!.corpo;
    parceiro.x = 10;
    parceiro.z = 0;
    prepararChute(p, 18, 0);
    chutarPara(p, CASA, p.campo.metadeComp, 0, 0.05);
    p.eventosPendentes();
    rodar(p, 2.8);
    const ev = p.eventosPendentes().find((e) => e.tipo === "passe");
    expect(ev).toMatchObject({ dados: { de: GOLEIRO_VIS, para: 8 } });
  });
});

describe("goleiro: tiro de meta", () => {
  it("H4: o goleiro do time que defende cobra o tiro de meta de pé, em até 0,8 s depois de chegar à bola", () => {
    const p = criar();
    emJogo(p);
    p.posicionarParaTeste(CASA, 24, 12, 24.55, 12, 0);
    rodar(p, 0.2);
    chutarPara(p, CASA, 40, 12, 0.8); // para fora, longe do gol
    rodar(p, 1.0);
    expect(p.reinicio).toMatchObject({ tipo: "tiroDeMeta", time: 1, cobrador: GOLEIRO_VIS });
    expect(p.estadoDe(GOLEIRO_VIS)!.situacao).toBe("lateral");
    p.eventosPendentes();
    rodar(p, 3);
    expect(p.fase).toBe(FASE.jogo);
    expect(p.eventosPendentes().some((e) => e.tipo === "passe" || e.tipo === "chute")).toBe(true);
  });
});
