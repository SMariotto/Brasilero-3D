import { describe, expect, it } from "vitest";
import { CONFIG_PADRAO, type Config } from "../protocolo/config";
import { ACAO, BOTAO, FASE, SEM_DOMINANTE, anguloParaByte, comandoParado, magParaByte, type Comando } from "../protocolo/binario";
import { Partida, type VagaPartida } from "./partida";

const TICKS_POR_S = 60;
const CASA = 1;
const VISITANTE = 7;
const CASA_2 = 2;

const vaga = (slot: number, time: 0 | 1): VagaPartida => ({
  slot,
  time,
  numero: slot + 6,
  nome: `J${slot}`,
  humano: true,
  idControle: slot,
  goleiro: false,
});

function criar(opcoes: { duracao?: Config["duracao"]; elenco?: VagaPartida[]; semente?: number } = {}): Partida {
  return new Partida({
    config: { ...CONFIG_PADRAO, modo: "arena", duracao: opcoes.duracao ?? 2 },
    elenco: opcoes.elenco ?? [vaga(CASA, 0), vaga(VISITANTE, 1)],
    semente: opcoes.semente ?? 1,
    semBots: true, // estes testes são do 1 contra 1 puro; bots e goleiros têm testes próprios

  });
}

function rodar(p: Partida, segundos: number): void {
  for (let i = 0; i < Math.round(segundos * TICKS_POR_S); i++) p.passo();
}

/** Comando de um controle: direção em radianos (0 = direita da tela), força 0 a 1 e botões. */
function cmd(extra: Partial<Comando> & { dirRad?: number; forca01?: number } = {}): Comando {
  const { dirRad, forca01, ...resto } = extra;
  return { ...comandoParado(), ang: anguloParaByte(dirRad ?? 0), mag: magParaByte(forca01 ?? 0), ...resto };
}

/** Joga até soltar a saída de bola (3 s de pré-jogo e 3 s de saída). */
function ateOJogoRolar(p: Partida): void {
  rodar(p, 3.1);
  expect(p.fase).toBe(FASE.reinicio);
  rodar(p, 3.1);
  expect(p.fase).toBe(FASE.jogo);
}

/** Põe o jogador com a bola dominada, pronto para agir. */
function comABola(p: Partida, slot: number, x: number, z: number, dir = 0): void {
  p.posicionarParaTeste(slot, x, z, x + Math.cos(dir) * 0.55, z + Math.sin(dir) * 0.55, dir);
  rodar(p, 0.1);
  expect(p.dominante).toBe(slot);
}

let seq = 0;
/** Segura CHUTE por `segundos` e solta com a carga medida, como o celular faz. */
function chutar(p: Partida, slot: number, segundos: number, joystick: Partial<Comando> & { dirRad?: number; forca01?: number } = {}): void {
  p.definirComando(slot, cmd({ ...joystick, seguros: BOTAO.chute }));
  rodar(p, segundos);
  const forca = Math.round(Math.min(1, segundos / 0.8) * 255);
  seq = (seq + 1) & 255;
  p.definirComando(slot, cmd({ ...joystick, seguros: 0, acao: ACAO.chute, forca, acaoSeq: seq }));
  p.passo();
  p.definirComando(slot, cmd({ ...joystick, seguros: 0 }));
}

function passar(p: Partida, slot: number, joystick: Partial<Comando> & { dirRad?: number; forca01?: number } = {}): void {
  p.definirComando(slot, cmd({ ...joystick, seguros: BOTAO.passe }));
  rodar(p, 0.08);
  seq = (seq + 1) & 255;
  p.definirComando(slot, cmd({ ...joystick, seguros: 0, acao: ACAO.passeToque, forca: 0, acaoSeq: seq }));
  p.passo();
  p.definirComando(slot, cmd({ ...joystick, seguros: 0 }));
}

describe("partida: começo e saída de bola", () => {
  it("começa no pré-jogo, com os times cada um na sua metade e a bola no centro", () => {
    const p = criar();
    expect(p.fase).toBe(FASE.preJogo);
    expect(p.jogador(CASA)!.corpo.x).toBeLessThan(0);
    expect(p.jogador(VISITANTE)!.corpo.x).toBeGreaterThan(0);
    expect(p.bola.x).toBe(0);
    expect(p.bola.z).toBe(0);
    expect(p.relogio).toBe(120);
  });

  it("depois de 3 s apita o início e a Casa sai jogando; o relógio ainda não corre", () => {
    const p = criar();
    rodar(p, 3.1);
    expect(p.fase).toBe(FASE.reinicio);
    const motivos = p.eventosPendentes().map((e) => e.tipo);
    expect(motivos).toEqual(["apito", "saida"]);
    expect(p.saidaTime).toBe(0);
    rodar(p, 1);
    expect(p.relogio).toBe(120);
  });

  it("a saída solta quando quem cobra toca na bola e o relógio começa a correr", () => {
    const p = criar();
    rodar(p, 3.1);
    p.definirComando(CASA, cmd({ dirRad: 0, forca01: 1 }));
    rodar(p, 0.5);
    expect(p.dominante).toBe(CASA);
    expect(p.fase).toBe(FASE.jogo);
    const antes = p.relogio;
    rodar(p, 1);
    expect(p.relogio).toBeCloseTo(antes - 1, 1);
  });

  it("a saída solta sozinha depois de 3 s mesmo se ninguém tocar", () => {
    const p = criar();
    rodar(p, 3.1);
    rodar(p, 2.7);
    expect(p.fase).toBe(FASE.reinicio);
    rodar(p, 0.5);
    expect(p.fase).toBe(FASE.jogo);
  });

  it("na saída, o adversário fica a 4 m da bola e cada um na sua metade", () => {
    const p = criar();
    rodar(p, 3.1);
    // O Visitante tenta correr para a bola, a Casa tenta passar do meio-campo
    p.definirComando(VISITANTE, cmd({ dirRad: Math.PI, forca01: 1 }));
    p.definirComando(CASA, cmd({ dirRad: 0, forca01: 0 }));
    for (let i = 0; i < 120; i++) {
      p.passo();
      if (p.fase !== FASE.reinicio) break;
      const v = p.jogador(VISITANTE)!.corpo;
      expect(Math.hypot(v.x - p.bola.x, v.z - p.bola.z)).toBeGreaterThanOrEqual(3.99);
      expect(p.jogador(CASA)!.corpo.x).toBeLessThanOrEqual(-0.39);
    }
  });
});

describe("partida: domínio e condução", () => {
  it("domina a bola parada perto do pé e a conduz à frente enquanto corre", () => {
    const p = criar();
    ateOJogoRolar(p);
    comABola(p, CASA, -10, 0);
    p.definirComando(CASA, cmd({ dirRad: 0, forca01: 1 }));
    for (let i = 0; i < 180; i++) {
      p.passo();
      const c = p.jogador(CASA)!.corpo;
      expect(Math.hypot(p.bola.x - c.x, p.bola.z - c.z)).toBeLessThan(0.9);
    }
    const c = p.jogador(CASA)!.corpo;
    expect(p.dominante).toBe(CASA);
    expect(p.bola.x).toBeGreaterThan(c.x); // à frente
    expect(c.x).toBeGreaterThan(-10 + 10); // correu uns 15 m
  });

  it("não domina bola acima de 0,6 m nem bola rápida demais", () => {
    const p = criar();
    ateOJogoRolar(p);
    p.posicionarParaTeste(CASA, 0, 0, 0.5, 0);
    p.bola.y = 1.2; // no ar, mas vai passar pela altura depois
    p.bola.vy = 0;
    p.passo();
    expect(p.dominante).toBeNull();

    p.posicionarParaTeste(CASA, 0, 0, 0.5, 0);
    p.bola.vx = -20; // 20 m/s contra o jogador (acima de 14)
    p.passo();
    expect(p.dominante).toBeNull();
  });

  it("bola rápida bate no corpo e volta (bloqueio)", () => {
    const p = criar();
    ateOJogoRolar(p);
    p.posicionarParaTeste(VISITANTE, 20, 0, 18, 0);
    p.bola.vx = 25;
    rodar(p, 0.2);
    expect(p.dominante).toBeNull();
    expect(p.bola.vx).toBeLessThan(0);
  });

  it("quem acabou de chutar não domina de novo por 0,25 s", () => {
    const p = criar();
    ateOJogoRolar(p);
    comABola(p, CASA, -10, 0);
    const antes = p.t;
    passar(p, CASA);
    expect(p.jogador(CASA)!.bloqueioAte).toBeGreaterThanOrEqual(antes + 0.25 - 0.2);
    expect(p.dominante).toBeNull();
  });

  it("na disputa fica com quem está mais perto do alvo e, no empate, com quem já tinha", () => {
    const p = criar();
    ateOJogoRolar(p);
    comABola(p, CASA, 5, 0);
    // O Visitante chega junto, mas a bola está no alvo do Casa: o Casa continua
    const v = p.jogador(VISITANTE)!.corpo;
    v.x = 5.9;
    v.z = 0.2;
    v.dir = Math.PI;
    for (let i = 0; i < 30; i++) {
      v.x = 5.9;
      v.z = 0.2;
      p.passo();
      expect(p.dominante).toBe(CASA);
    }
  });
});

describe("partida: chute e passe", () => {
  it("segurar CHUTE carrega e soltar chuta forte; o celular dita a força", () => {
    const p = criar({ semente: 5 });
    ateOJogoRolar(p);
    comABola(p, CASA, 0, -10);
    p.definirComando(CASA, cmd({ seguros: BOTAO.chute, dirRad: 0 }));
    rodar(p, 0.4);
    const snap = p.snapshot().jogadores.find((j) => j.slot === CASA)!;
    expect(snap.carregandoChute).toBe(true);
    expect(snap.carga).toBeGreaterThan(0.45);
    expect(snap.carga).toBeLessThan(0.55);
    p.eventosPendentes();
    p.definirComando(CASA, cmd({ seguros: 0, dirRad: 0, acao: ACAO.chute, forca: 255, acaoSeq: 1 }));
    p.passo();
    const velH = Math.hypot(p.bola.vx, p.bola.vz);
    expect(velH).toBeGreaterThan(28);
    expect(velH).toBeLessThan(30.5);
    expect(p.bola.vy).toBeGreaterThan(5);
    expect(p.dominante).toBeNull();
    const ev = p.eventosPendentes();
    expect(ev.find((e) => e.tipo === "chute")).toMatchObject({ dados: { slot: CASA, forca: 1 } });
  });

  it("toque rápido dá chute fraco (0,15)", () => {
    const p = criar();
    ateOJogoRolar(p);
    comABola(p, CASA, 0, -10);
    chutar(p, CASA, 0.05);
    expect(Math.hypot(p.bola.vx, p.bola.vz)).toBeGreaterThan(15.5);
    expect(Math.hypot(p.bola.vx, p.bola.vz)).toBeLessThan(17.5);
  });

  it("o chute vai na direção do joystick (para cima do celular = -Z)", () => {
    const p = criar();
    ateOJogoRolar(p);
    comABola(p, CASA, 0, 0, -Math.PI / 2);
    chutar(p, CASA, 0.8, { dirRad: Math.PI / 2, forca01: 1 });
    expect(p.bola.vz).toBeLessThan(-25);
    expect(Math.abs(p.bola.vx)).toBeLessThan(5);
  });

  it("chute sem a bola não faz nada (carrinho só na F3)", () => {
    const p = criar();
    ateOJogoRolar(p);
    p.posicionarParaTeste(CASA, 0, 0, 10, 10);
    p.definirComando(CASA, cmd({ seguros: BOTAO.chute }));
    rodar(p, 0.3);
    p.definirComando(CASA, cmd({ seguros: 0, acao: ACAO.chute, forca: 255, acaoSeq: 1 }));
    rodar(p, 0.1);
    expect(Math.hypot(p.bola.vx, p.bola.vz)).toBe(0);
  });

  it("ação só vale se a bola já estava com o jogador quando ele apertou", () => {
    const p = criar();
    ateOJogoRolar(p);
    // Aperta CHUTE sem a bola (com o carrinho em recarga, para ele não deslizar)...
    p.posicionarParaTeste(CASA, 0, 0, 3, 0);
    p.jogador(CASA)!.carrinhoProntoEm = 999;
    p.definirComando(CASA, cmd({ seguros: BOTAO.chute }));
    p.passo();
    // ...a bola chega ao pé dele (domina)...
    p.bola.x = 0.55;
    p.bola.z = 0;
    rodar(p, 0.2);
    expect(p.dominante).toBe(CASA);
    // ...e ele solta: não pode sair chute.
    p.definirComando(CASA, cmd({ seguros: 0, acao: ACAO.chute, forca: 255, acaoSeq: 1 }));
    p.passo();
    expect(p.dominante).toBe(CASA);
  });

  it("a mesma ação (mesmo acaoSeq) não dispara duas vezes", () => {
    const p = criar();
    ateOJogoRolar(p);
    comABola(p, CASA, -10, 0);
    chutar(p, CASA, 0.8);
    const vx = p.bola.vx;
    // O celular repete o último pacote a cada 1 s, com a mesma ação e o mesmo acaoSeq
    p.definirComando(CASA, cmd({ seguros: 0, acao: ACAO.chute, forca: 255, acaoSeq: seq }));
    rodar(p, 0.05);
    p.eventosPendentes();
    expect(p.eventosPendentes().filter((e) => e.tipo === "chute")).toHaveLength(0);
    expect(p.bola.vx).toBeLessThanOrEqual(vx + 1);
  });

  it("uma ação velha no primeiro pacote (reconexão) é ignorada", () => {
    const p = criar();
    ateOJogoRolar(p);
    comABola(p, CASA, -10, 0);
    // Nunca mandou pacote, então o primeiro define o acaoSeq de referência
    const novo = criar();
    ateOJogoRolar(novo);
    novo.posicionarParaTeste(CASA, -10, 0, -9.45, 0);
    novo.definirComando(CASA, cmd({ seguros: 0, acao: ACAO.chute, forca: 255, acaoSeq: 77 }));
    rodar(novo, 0.2);
    expect(novo.eventosPendentes().filter((e) => e.tipo === "chute")).toHaveLength(0);
  });

  it("PASSE com toque manda a bola rasteira a 12 m/s na direção do joystick", () => {
    const p = criar();
    ateOJogoRolar(p);
    comABola(p, CASA, -10, 0);
    passar(p, CASA, { dirRad: Math.PI / 2, forca01: 1 });
    expect(p.bola.vz).toBeCloseTo(-12, 0);
    expect(Math.abs(p.bola.vx)).toBeLessThan(0.5);
    expect(p.bola.vy).toBe(0);
    expect(p.eventosPendentes().some((e) => e.tipo === "passe")).toBe(true);
  });
});

describe("partida: gol", () => {
  /** Casa chuta de (20, 0) em direção ao gol de X positivo. */
  function golDaCasa(semente = 1): Partida {
    const p = criar({ semente });
    ateOJogoRolar(p);
    p.eventosPendentes();
    comABola(p, CASA, 20, 0);
    chutar(p, CASA, 0.8, { dirRad: 0, forca01: 1 });
    rodar(p, 1.5);
    return p;
  }

  it("a bola entra, o placar sobe, vira fase de gol e sai o evento com quem fez", () => {
    const p = golDaCasa();
    expect(p.placar).toEqual([1, 0]);
    expect(p.fase).toBe(FASE.gol);
    const gol = p.eventosPendentes().find((e) => e.tipo === "gol");
    expect(gol).toMatchObject({ dados: { time: 0, slot: CASA, contra: false, placar: [1, 0] } });
    expect(p.gols).toEqual([{ slot: CASA, tick: expect.any(Number), contra: false }]);
  });

  it("durante a comemoração o relógio e os jogadores ficam parados", () => {
    const p = golDaCasa();
    const relogio = p.relogio;
    p.definirComando(VISITANTE, cmd({ dirRad: Math.PI, forca01: 1 }));
    const x = p.jogador(VISITANTE)!.corpo.x;
    rodar(p, 1);
    expect(p.relogio).toBe(relogio);
    expect(Math.abs(p.jogador(VISITANTE)!.corpo.x - x)).toBeLessThan(0.5);
  });

  it("depois da comemoração a bola volta ao centro e quem sofreu o gol sai jogando", () => {
    const p = golDaCasa();
    p.eventosPendentes();
    rodar(p, 3);
    expect(p.fase).toBe(FASE.reinicio);
    expect(p.saidaTime).toBe(1);
    expect(p.bola.x).toBe(0);
    expect(p.bola.naRede).toBe(0);
    expect(p.jogador(CASA)!.corpo.x).toBeLessThan(0);
    expect(p.jogador(VISITANTE)!.corpo.x).toBeGreaterThan(0);
    expect(p.eventosPendentes().map((e) => e.tipo)).toEqual(expect.arrayContaining(["apito", "saida"]));
  });

  it("o relógio só volta a correr quando a saída é tocada", () => {
    const p = golDaCasa();
    rodar(p, 3.1);
    const relogio = p.relogio;
    rodar(p, 1);
    expect(p.relogio).toBe(relogio);
  });

  it("não conta gol duas vezes enquanto a bola está na rede", () => {
    const p = golDaCasa();
    rodar(p, 2);
    expect(p.placar).toEqual([1, 0]);
  });

  it("gol contra: o jogador chuta no próprio gol e conta para o adversário", () => {
    const p = criar();
    ateOJogoRolar(p);
    p.eventosPendentes();
    comABola(p, VISITANTE, 20, 0); // o Visitante defende o gol de X positivo
    chutar(p, VISITANTE, 0.8, { dirRad: 0, forca01: 1 });
    rodar(p, 1.5);
    expect(p.placar).toEqual([1, 0]);
    const gol = p.eventosPendentes().find((e) => e.tipo === "gol");
    expect(gol).toMatchObject({ dados: { time: 0, slot: VISITANTE, contra: true } });
    expect(p.gols[0]!.contra).toBe(true);
  });

  it("assistência: o toque anterior do mesmo time, até 6 s antes, vira assistência", () => {
    const p = criar({ elenco: [vaga(CASA, 0), vaga(CASA_2, 0), vaga(VISITANTE, 1)] });
    ateOJogoRolar(p);
    p.eventosPendentes();
    comABola(p, CASA, 10, 0);
    // O parceiro espera mais à frente, na linha do passe
    p.jogador(VISITANTE)!.corpo.x = 0; // fora da linha do passe
    p.jogador(VISITANTE)!.corpo.z = 15;
    const parceiro = p.jogador(CASA_2)!.corpo;
    parceiro.x = 20;
    parceiro.z = 0;
    parceiro.dir = 0;
    passar(p, CASA, { dirRad: 0, forca01: 1 });
    p.definirComando(CASA, cmd()); // o passador para, senão corre atrás da bola e domina de novo
    rodar(p, 1.5);
    expect(p.dominante).toBe(CASA_2);
    chutar(p, CASA_2, 0.8, { dirRad: 0, forca01: 1 });
    rodar(p, 1.5);
    expect(p.placar).toEqual([1, 0]);
    const gol = p.eventosPendentes().find((e) => e.tipo === "gol");
    expect(gol).toMatchObject({ dados: { slot: CASA_2, assistencia: CASA, contra: false } });
    expect(p.resumo().destaques.assistencias).toEqual({ slot: CASA, quantidade: 1 });
    expect(p.resumo().destaques.artilheiro).toEqual({ slot: CASA_2, quantidade: 1 });
  });

  it("sem assistência quando o passe foi há mais de 6 s", () => {
    const p = criar({ elenco: [vaga(CASA, 0), vaga(CASA_2, 0), vaga(VISITANTE, 1)] });
    ateOJogoRolar(p);
    comABola(p, CASA, 10, 0);
    p.jogador(VISITANTE)!.corpo.x = 0; // fora da linha do passe
    p.jogador(VISITANTE)!.corpo.z = 15;
    const parceiro = p.jogador(CASA_2)!.corpo;
    parceiro.x = 15;
    parceiro.z = 0;
    passar(p, CASA, { dirRad: 0, forca01: 1 });
    p.definirComando(CASA, cmd());
    rodar(p, 1);
    expect(p.dominante).toBe(CASA_2);
    rodar(p, 7);
    chutar(p, CASA_2, 0.8, { dirRad: 0, forca01: 1 });
    rodar(p, 1.5);
    const gol = p.eventosPendentes().find((e) => e.tipo === "gol");
    expect(gol).toBeDefined();
    expect((gol as { dados: { assistencia?: number } }).dados.assistencia).toBeUndefined();
  });

  it("chute para fora do gol (longe da trave) não é gol: quica na parede da Arena", () => {
    const p = criar();
    ateOJogoRolar(p);
    comABola(p, CASA, 20, 10);
    chutar(p, CASA, 0.8, { dirRad: 0, forca01: 1 });
    rodar(p, 2);
    expect(p.placar).toEqual([0, 0]);
    expect(p.bola.x).toBeLessThanOrEqual(p.campo.metadeComp);
  });
});

describe("partida: relógio e fim", () => {
  it("o jogo de 2 minutos acaba em 2 min de jogo corrido, com apito final e resumo", () => {
    const p = criar({ duracao: 2 });
    ateOJogoRolar(p);
    p.eventosPendentes();
    rodar(p, 119);
    expect(p.fase).toBe(FASE.jogo);
    rodar(p, 1.1);
    expect(p.fase).toBe(FASE.fim);
    expect(p.terminou).toBe(true);
    const tipos = p.eventosPendentes().map((e) => e.tipo);
    expect(tipos).toEqual(["apito", "fim"]);
    const r = p.resumo();
    expect(r).toMatchObject({ t: "fim", placar: [0, 0], gols: [] });
    expect(r.destaques).toEqual({ artilheiro: null, assistencias: null, desarmes: null });
  });

  it("depois do fim nada mais anda e o relógio fica em zero", () => {
    const p = criar({ duracao: 2 });
    ateOJogoRolar(p);
    rodar(p, 121);
    p.definirComando(CASA, cmd({ dirRad: 0, forca01: 1 }));
    const x = p.jogador(CASA)!.corpo.x;
    rodar(p, 1);
    expect(p.fase).toBe(FASE.fim);
    expect(p.relogio).toBe(0);
    expect(Math.abs(p.jogador(CASA)!.corpo.x - x)).toBeLessThan(0.5);
  });

  it("empate no fim termina empatado", () => {
    const p = criar({ duracao: 2 });
    ateOJogoRolar(p);
    rodar(p, 121);
    expect(p.placar).toEqual([0, 0]);
    expect(p.resumo().placar).toEqual([0, 0]);
  });

  it("o relógio sai no snapshot em décimos de segundo", () => {
    const p = criar({ duracao: 4 });
    expect(p.snapshot().relogio).toBe(2400);
  });
});

describe("partida: determinismo e snapshot", () => {
  function partidaComRoteiro(semente: number): Partida {
    const p = criar({ semente });
    ateOJogoRolar(p);
    p.definirComando(CASA, cmd({ dirRad: 0.3, forca01: 1, seguros: BOTAO.correr }));
    p.definirComando(VISITANTE, cmd({ dirRad: 3, forca01: 0.6 }));
    rodar(p, 5);
    chutar(p, CASA, 0.5, { dirRad: 0.1, forca01: 1 });
    rodar(p, 5);
    return p;
  }

  it("mesma semente e mesmos comandos dão exatamente o mesmo jogo", () => {
    const a = partidaComRoteiro(123).snapshot();
    const b = partidaComRoteiro(123).snapshot();
    expect(a).toEqual(b);
  });

  it("sementes diferentes mudam o erro do chute", () => {
    const a = partidaComRoteiro(1).bola;
    const b = partidaComRoteiro(2).bola;
    expect(a.x === b.x && a.z === b.z).toBe(false);
  });

  it("o snapshot traz os jogadores, o dominante e a fase", () => {
    const p = criar();
    const s = p.snapshot();
    expect(s.jogadores.map((j) => j.slot)).toEqual([CASA, VISITANTE]);
    expect(s.fase).toBe(FASE.preJogo);
    expect(s.dominante).toBe(SEM_DOMINANTE);
    expect(s.jogadores.every((j) => j.humano)).toBe(true);
  });

  it("estadoDe diz se tem a bola e a energia (para o celular)", () => {
    const p = criar();
    ateOJogoRolar(p);
    comABola(p, CASA, -10, 0);
    expect(p.estadoDe(CASA)).toEqual({ comBola: true, energia: 100, situacao: "normal" });
    expect(p.estadoDe(VISITANTE)).toEqual({ comBola: false, energia: 100, situacao: "normal" });
    expect(p.estadoDe(99)).toBeNull();
  });

  it("arrancar gasta energia e ela aparece no estado", () => {
    const p = criar();
    ateOJogoRolar(p);
    p.definirComando(CASA, cmd({ dirRad: Math.PI, forca01: 1, seguros: BOTAO.correr }));
    rodar(p, 1);
    expect(p.estadoDe(CASA)!.energia).toBeLessThan(80);
    expect(p.snapshot().jogadores.find((j) => j.slot === CASA)!.arrancando).toBe(true);
  });
});
