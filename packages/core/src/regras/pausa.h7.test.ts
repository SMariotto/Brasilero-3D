import { describe, expect, it } from "vitest";
import { ACAO, BOTAO, anguloParaByte, comandoParado, magParaByte, type Comando } from "../protocolo/binario";
import { CONFIG_PADRAO } from "../protocolo/config";
import { Partida, type VagaPartida } from "./partida";

// H7: retomar depois de uma pausa. A sala não roda passos pausada, mas continua recebendo comandos; `aoRetomar` descarta o que veio
// com o jogo parado (ação nova, CHUTE e PASSE apertados), para nada disparar de uma vez na primeira volta.

const humano = (slot: number, time: 0 | 1, id: number): VagaPartida => ({ slot, time, numero: 7 + (slot % 6), nome: `H${id}`, humano: true, idControle: id, goleiro: false });
const bot = (slot: number, time: 0 | 1): VagaPartida => ({ slot, time, numero: 7 + (slot % 6), nome: `Bot${slot}`, humano: false, goleiro: false });

const cmd = (extra: Partial<Comando> = {}): Comando => ({ ...comandoParado(), ang: anguloParaByte(0), mag: magParaByte(0), ...extra });

const rodar = (p: Partida, s: number): void => {
  for (let i = 0; i < Math.round(s * 60); i++) p.passo();
};

/** O humano H10 (slot 1, Casa) com a bola nos pés, no meio do campo aberto, e mais nada em jogo: o chute dele não encontra ninguém. */
function comABola(): Partida {
  const p = new Partida({
    config: { ...CONFIG_PADRAO, modo: "arena", duracao: 8 },
    elenco: [humano(1, 0, 10), bot(2, 0), humano(7, 1, 20)],
    semente: 5,
    semBots: true,
    controleFifa: true,
  });
  rodar(p, 6.3); // acaba o pré-jogo e a saída de bola
  p.posicionarParaTeste(1, -5, 0, -4.45, 0, 0);
  rodar(p, 0.1);
  expect(p.dominante).toBe(1);
  p.eventosPendentes();
  return p;
}

const chutes = (p: Partida): number => p.eventosPendentes().filter((e) => e.tipo === "chute").length;

describe("Partida.aoRetomar (H7)", () => {
  it("sem ele, um chute soltado durante a pausa dispara na primeira volta depois de retomar (é o defeito que ele corrige)", () => {
    const p = comABola();
    p.definirComandoDoHumano(10, cmd({ seguros: BOTAO.chute, acaoSeq: 1 })); // aperta CHUTE (carregando) antes de pausar
    p.passo();
    // PAUSA: nenhum passo roda, mas o comando de soltar chega
    p.definirComandoDoHumano(10, cmd({ seguros: 0, acao: ACAO.chute, forca: 220, acaoSeq: 2 }));
    p.passo(); // retomou sem `aoRetomar`
    expect(chutes(p)).toBe(1);
  });

  it("o chute soltado durante a pausa é descartado ao retomar", () => {
    const p = comABola();
    p.definirComandoDoHumano(10, cmd({ seguros: BOTAO.chute, acaoSeq: 1 }));
    p.passo();
    p.definirComandoDoHumano(10, cmd({ seguros: 0, acao: ACAO.chute, forca: 220, acaoSeq: 2 }));
    p.aoRetomar();
    rodar(p, 0.5);
    expect(chutes(p)).toBe(0);
    expect(p.dominante).toBe(1); // a bola continua com ele
  });

  it("depois de retomar, o jogador chuta normalmente (só o que veio na pausa foi descartado)", () => {
    const p = comABola();
    p.definirComandoDoHumano(10, cmd({ seguros: BOTAO.chute, acaoSeq: 1 }));
    p.passo();
    p.definirComandoDoHumano(10, cmd({ seguros: 0, acao: ACAO.chute, forca: 220, acaoSeq: 2 }));
    p.aoRetomar();
    rodar(p, 0.2);
    // Novo aperto e novo toque, já com o jogo rodando
    p.definirComandoDoHumano(10, cmd({ seguros: BOTAO.chute, acaoSeq: 2 }));
    p.passo();
    p.definirComandoDoHumano(10, cmd({ seguros: 0, acao: ACAO.chute, forca: 220, acaoSeq: 3 }));
    p.passo();
    expect(chutes(p)).toBe(1);
  });

  it("um passe soltado durante a pausa também é descartado", () => {
    const p = comABola();
    p.definirComandoDoHumano(10, cmd({ seguros: BOTAO.passe, acaoSeq: 1 }));
    p.passo();
    p.definirComandoDoHumano(10, cmd({ seguros: 0, acao: ACAO.passeToque, acaoSeq: 2 }));
    p.aoRetomar();
    p.passo();
    expect(p.eventosPendentes().filter((e) => e.tipo === "passe")).toHaveLength(0);
  });

  describe("CHUTE sem a bola é troca de jogador (G1): apertado na pausa, não pode trocar ao retomar", () => {
    /** O humano H10 (slot 1) está sozinho junto da bola solta e os companheiros bots estão longe: a troca à mão iria para um deles. */
    function semABola(): Partida {
      const p = new Partida({
        config: { ...CONFIG_PADRAO, modo: "arena", duracao: 8 },
        elenco: [humano(1, 0, 10), bot(2, 0), bot(3, 0), humano(7, 1, 20)],
        semente: 5,
        semBots: true,
        controleFifa: true,
      });
      rodar(p, 6.3);
      p.posicionarParaTeste(1, 0, 0, 1, 0, 0);
      p.posicionarParaTeste(2, -20, 8, 1, 0, 0);
      p.posicionarParaTeste(3, -20, -8, 1, 0, 0);
      p.definirComandoDoHumano(10, cmd());
      p.definirComandoDoHumano(20, cmd());
      return p;
    }

    it("sem aoRetomar, o CHUTE apertado na pausa vira troca de jogador (é o defeito que ele corrige)", () => {
      const p = semABola();
      const antes = p.slotDoHumano(10);
      p.definirComandoDoHumano(10, cmd({ seguros: BOTAO.chute })); // aperta CHUTE com o jogo parado
      p.passo(); // retomou sem `aoRetomar`
      expect(p.slotDoHumano(10)).not.toBe(antes);
    });

    it("com aoRetomar, ele continua no mesmo jogador", () => {
      const p = semABola();
      const antes = p.slotDoHumano(10);
      p.definirComandoDoHumano(10, cmd({ seguros: BOTAO.chute }));
      p.aoRetomar();
      rodar(p, 0.2);
      expect(p.slotDoHumano(10)).toBe(antes);
    });

    it("um aperto novo, depois de retomar, troca normalmente", () => {
      const p = semABola();
      const antes = p.slotDoHumano(10);
      p.definirComandoDoHumano(10, cmd({ seguros: BOTAO.chute }));
      p.aoRetomar();
      rodar(p, 0.1);
      p.definirComandoDoHumano(10, cmd({ seguros: 0 })); // soltou
      rodar(p, 0.1);
      p.definirComandoDoHumano(10, cmd({ seguros: BOTAO.chute })); // aperta de novo, agora com o jogo rodando
      p.passo();
      expect(p.slotDoHumano(10)).not.toBe(antes);
    });
  });

  it("o botão que continua segurado depois de retomar não dispara ao soltar (a carga de antes da pausa se perde)", () => {
    const p = comABola();
    p.definirComandoDoHumano(10, cmd({ seguros: BOTAO.chute, acaoSeq: 1 }));
    p.passo();
    p.aoRetomar(); // ainda segurando CHUTE
    p.passo();
    p.definirComandoDoHumano(10, cmd({ seguros: 0, acao: ACAO.chute, forca: 255, acaoSeq: 2 }));
    p.passo();
    expect(chutes(p)).toBe(0); // soltar o que já estava segurado na pausa não chuta
  });

  it("não mexe no joystick, nos bots nem em quem ainda não mandou nenhum comando", () => {
    const p = comABola();
    p.definirComandoDoHumano(10, cmd({ mag: magParaByte(1), ang: anguloParaByte(Math.PI / 2) }));
    const antes = p.jogador(1)!.cmd;
    const botAntes = p.jogador(2)!.chute;
    p.aoRetomar();
    expect(p.jogador(1)!.cmd).toBe(antes);
    expect(p.jogador(1)!.cmd.mag).toBe(magParaByte(1));
    expect(p.jogador(2)!.chute).toBe(botAntes);

    // O humano que ainda não mandou nada (acaoSeq nulo) continua assim: o primeiro pacote ainda inicializa a sequência
    const q = new Partida({
      config: { ...CONFIG_PADRAO, modo: "arena", duracao: 8 },
      elenco: [humano(1, 0, 10), humano(7, 1, 20)],
      semente: 5,
      semBots: true,
      controleFifa: true,
    });
    expect(q.jogador(1)!.acaoSeq).toBeNull();
    q.aoRetomar();
    expect(q.jogador(1)!.acaoSeq).toBeNull();
  });
});
