import { describe, expect, it } from "vitest";
import { PARTIDA } from "../constantes";
import { CONFIG_PADRAO, lerConfigParcial } from "../protocolo/config";
import { ACAO, BOTAO, FASE, anguloParaByte, comandoParado, magParaByte, type Comando } from "../protocolo/binario";
import { Partida, type VagaPartida } from "./partida";

// Gol de ouro (F8b): empate no tempo normal vai para uma prorrogação em que o primeiro gol decide.

const CASA = 1;
const VISITANTE = 7;

const vaga = (slot: number, time: 0 | 1): VagaPartida => ({ slot, time, numero: slot + 6, nome: `J${slot}`, humano: true, idControle: slot, goleiro: false });

function criar(golDeOuro: boolean): Partida {
  return new Partida({
    config: { ...CONFIG_PADRAO, modo: "arena", duracao: 2, golDeOuro },
    elenco: [vaga(CASA, 0), vaga(VISITANTE, 1)],
    semente: 1,
    semBots: true,
  });
}

const rodar = (p: Partida, segundos: number): void => {
  for (let i = 0; i < Math.round(segundos * 60); i++) p.passo();
};

const cmd = (extra: Partial<Comando> = {}): Comando => ({ ...comandoParado(), ang: anguloParaByte(0), mag: magParaByte(0), ...extra });

let seq = 0;
function chutarNoGol(p: Partida, slot: number): void {
  p.posicionarParaTeste(slot, 20, 0, 20.55, 0, 0);
  rodar(p, 0.1);
  p.definirComando(slot, cmd({ ang: anguloParaByte(0), mag: magParaByte(1), seguros: BOTAO.chute }));
  rodar(p, 0.8);
  seq = (seq + 1) & 255;
  p.definirComando(slot, cmd({ ang: anguloParaByte(0), mag: magParaByte(1), seguros: 0, acao: ACAO.chute, forca: 255, acaoSeq: seq }));
  p.passo();
  p.definirComando(slot, cmd());
  rodar(p, 1.5);
}

/** Roda até o fim do tempo normal (2 min + pré-jogo e saída), parando assim que a fase deixa de ser o jogo normal. */
function ateOTempoAcabar(p: Partida): void {
  for (let i = 0; i < 140 * 60 && !p.emProrrogacao && !p.terminou; i++) p.passo();
}

describe("configuração", () => {
  it("golDeOuro é um boolean, desligado por padrão", () => {
    expect(CONFIG_PADRAO.golDeOuro).toBe(false);
    expect(lerConfigParcial({ golDeOuro: true })).toEqual({ golDeOuro: true });
    expect(lerConfigParcial({ golDeOuro: "sim" })).toBeNull();
  });
});

describe("gol de ouro", () => {
  it("desligado: empate acaba o jogo, sem prorrogação", () => {
    const p = criar(false);
    ateOTempoAcabar(p);
    expect(p.terminou).toBe(true);
    expect(p.emProrrogacao).toBe(false);
    expect(p.resumo().prorrogacao).toBeUndefined();
  });

  it("ligado e empatado: começa a prorrogação com o relógio de 2 min, bola ao centro e aviso a todos", () => {
    const p = criar(true);
    ateOTempoAcabar(p);
    expect(p.terminou).toBe(false);
    expect(p.emProrrogacao).toBe(true);
    expect(p.relogio).toBe(PARTIDA.prorrogacaoS);
    expect(p.bola.x).toBe(0);
    expect(p.fase).toBe(FASE.reinicio);
    const tipos = p.eventosPendentes().map((e) => e.tipo);
    expect(tipos).toContain("prorrogacao");
    expect(tipos).not.toContain("fim");
  });

  it("sem gol na prorrogação o jogo termina empatado, e o resumo diz que teve prorrogação", () => {
    const p = criar(true);
    ateOTempoAcabar(p);
    for (let i = 0; i < 130 * 60 && !p.terminou; i++) p.passo();
    expect(p.terminou).toBe(true);
    expect(p.placar).toEqual([0, 0]);
    expect(p.resumo().prorrogacao).toBe(true);
  });

  it("o primeiro gol da prorrogação decide: a comemoração passa e o jogo acaba, sem nova saída de bola", () => {
    const p = criar(true);
    ateOTempoAcabar(p);
    // Solta a saída e faz o gol
    for (let i = 0; i < 4 * 60 && p.fase !== FASE.jogo; i++) p.passo();
    expect(p.fase).toBe(FASE.jogo);
    p.eventosPendentes();
    chutarNoGol(p, CASA);
    expect(p.placar).toEqual([1, 0]);
    expect(p.fase).toBe(FASE.gol);
    expect(p.terminou).toBe(false); // ainda comemorando (e passando o replay)
    rodar(p, PARTIDA.golComemoracaoS + 0.2);
    expect(p.terminou).toBe(true);
    expect(p.placar).toEqual([1, 0]);
    const tipos = p.eventosPendentes().map((e) => e.tipo);
    expect(tipos).toContain("fim");
    expect(tipos).not.toContain("saida");
    expect(p.resumo().prorrogacao).toBe(true);
  });

  it("ligado mas com placar desempatado no tempo normal: acaba normalmente", () => {
    const p = criar(true);
    for (let i = 0; i < 4 * 60 && p.fase !== FASE.jogo; i++) p.passo();
    p.eventosPendentes();
    chutarNoGol(p, CASA); // 1 x 0 no tempo normal
    expect(p.placar).toEqual([1, 0]);
    ateOTempoAcabar(p);
    expect(p.terminou).toBe(true);
    expect(p.emProrrogacao).toBe(false);
  });
});
