import { describe, expect, it } from "vitest";
import { BOLA, CAMPOS, CHUTE, DOMINIO, GOLEIRO, JOGADOR, PASSE, PARTIDA, SERVIDOR, TEMPO } from "./constantes";

// Travas simples: pegam erro de digitação ao mexer nos números.
describe("constantes", () => {
  it("os três tamanhos de campo crescem junto com N", () => {
    expect(CAMPOS[3].comp).toBeLessThan(CAMPOS[4].comp);
    expect(CAMPOS[4].comp).toBeLessThan(CAMPOS[5].comp);
    expect(CAMPOS[5]).toEqual({ comp: 60, larg: 38, golLarg: 6, golAlt: 2.2, areaLarg: 12, areaProf: 8 });
    for (const n of [3, 4, 5] as const) {
      expect(CAMPOS[n].golLarg).toBeLessThan(CAMPOS[n].areaLarg);
      expect(CAMPOS[n].areaLarg).toBeLessThan(CAMPOS[n].larg);
    }
  });

  it("o passo é de 1/60 s e o snapshot sai a cada 2 passos", () => {
    expect(TEMPO.tickHz).toBe(60);
    expect(TEMPO.tickHz / TEMPO.snapHz).toBe(2);
  });

  it("o domínio aceita a velocidade com que um passe chega (correção da R0)", () => {
    expect(DOMINIO.velocidadeRelativaMax).toBeGreaterThan(PASSE.velocidadeMax * 0.8);
    expect(PASSE.velocidadeMax).toBeLessThanOrEqual(DOMINIO.velocidadeRelativaMax + 2);
  });

  it("o chute mais fraco é mais lento que o limite de encaixe do goleiro", () => {
    const maisFraco = CHUTE.velocidadeBase + CHUTE.velocidadeExtra * CHUTE.forcaToque;
    expect(maisFraco).toBeLessThan(GOLEIRO.encaixaAteVelocidade);
  });

  it("H3: sem stamina nem arrancada: a velocidade máxima é uma só, entre a antiga corrida normal (6,5) e a arrancada (8,2)", () => {
    expect(JOGADOR.velocidadeMax).toBeGreaterThan(6.5);
    expect(JOGADOR.velocidadeMax).toBeLessThanOrEqual(8.2);
    expect(JOGADOR.inclinacaoAnda).toBeLessThan(JOGADOR.inclinacaoCorre);
    expect("energiaMax" in JOGADOR).toBe(false);
    expect("arrancada" in JOGADOR).toBe(false);
  });

  it("a bola cabe no gol e o código de sala não tem letras confusas", () => {
    expect(BOLA.raio * 2).toBeLessThan(CAMPOS[3].golLarg);
    expect(SERVIDOR.alfabetoSala).not.toMatch(/[IO]/);
    expect(SERVIDOR.alfabetoSala.length).toBe(24);
  });

  it("a partida aceita 3 humanos por time (6 controles por sala) e as durações da SPEC", () => {
    expect(PARTIDA.maxHumanosPorTime).toBe(3);
    expect(SERVIDOR.maxControlesPorSala).toBe(6);
    // Os 3 humanos de um time sempre cabem, mesmo com o menor número de jogadores de linha
    expect(PARTIDA.maxHumanosPorTime).toBeLessThanOrEqual(Math.min(...[3, 4, 5]));
    expect([...PARTIDA.duracoesMin]).toEqual([2, 4, 6, 8]);
  });
});
