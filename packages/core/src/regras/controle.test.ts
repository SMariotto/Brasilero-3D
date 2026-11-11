import { describe, expect, it } from "vitest";
import { PARTIDA, TROCA } from "../constantes";
import { ACAO, BOTAO, FASE, anguloParaByte, comandoParado, magParaByte, type Comando } from "../protocolo/binario";
import { CONFIG_PADRAO } from "../protocolo/config";
import { criarRng } from "../util/rng";
import { GestorDeControle } from "./controle";
import { aplicarDonos, donosDoElenco } from "./donos";
import { Partida, type VagaPartida } from "./partida";
import type { JogadorPartida } from "./tipos-partida";

// ---------------------------------------------------------------------------
// Parte 1: as regras puras, com uma partida de mentira (posições e bola na mão do teste)
// ---------------------------------------------------------------------------

interface Falso {
  p: Partida;
  g: GestorDeControle;
  jogadores: JogadorPartida[];
  mudar: { dominante: (slot: number | null) => void; tempo: (t: number) => void; fase: (f: number) => void };
  pos: (slot: number, x: number, z: number) => void;
  bola: (x: number, z: number) => void;
  /** A velocidade da bola no chão do campo (m/s). */
  velBola: (vx: number, vz: number) => void;
}

/** Casa: slots 0 (goleiro) a 5; Visitante: 6 (goleiro) a 11. Todos longe da bola e bots, até o teste dizer o contrário. */
function falso(humanos: Array<{ slot: number; id: number }>, dinamico = true): Falso {
  const jogadores: JogadorPartida[] = [];
  for (let slot = 0; slot < 12; slot++) {
    const time: 0 | 1 = slot < 6 ? 0 : 1;
    jogadores.push({
      vaga: { slot, time, numero: slot, nome: `Bot${slot}`, nomeBot: `Bot${slot}`, humano: false, goleiro: slot % 6 === 0 },
      corpo: { x: (time === 0 ? -1 : 1) * 20, z: (slot % 6) * 3 - 6 },
      cmd: comandoParado(),
      chute: { apertado: false, comBola: false, desde: 0 },
      passe: { apertado: false, comBola: false, desde: 0 },
      acaoSeq: null,
      ausente: false,
      cerebro: { proximaDecisao: 5 },
    } as unknown as JogadorPartida);
  }
  const estado = { dominante: null as number | null, t: 10, fase: FASE.jogo as number };
  const p = {
    jogadores,
    bola: { x: 0, z: 0, vx: 0, vz: 0 },
    reinicio: null,
    get dominante() {
      return estado.dominante;
    },
    get t() {
      return estado.t;
    },
    get fase() {
      return estado.fase;
    },
    jogador: (slot: number) => jogadores.find((j) => j.vaga.slot === slot),
    noChao: () => false,
    temBola: (j: JogadorPartida) => estado.dominante === j.vaga.slot,
  } as unknown as Partida;
  const g = new GestorDeControle(p, dinamico);
  for (const h of humanos) {
    const j = p.jogador(h.slot)!;
    Object.assign(j.vaga, { humano: true, idControle: h.id, nome: `H${h.id}` });
    g.registrarInicial(j);
  }
  return {
    p,
    g,
    jogadores,
    mudar: {
      dominante: (s) => (estado.dominante = s),
      tempo: (t) => (estado.t = t),
      fase: (f) => (estado.fase = f),
    },
    pos: (slot, x, z) => {
      const c = p.jogador(slot)!.corpo;
      c.x = x;
      c.z = z;
    },
    bola: (x, z) => {
      p.bola.x = x;
      p.bola.z = z;
    },
    velBola: (vx, vz) => {
      p.bola.vx = vx;
      p.bola.vz = vz;
    },
  };
}

describe("controle estilo FIFA: regras", () => {
  it("cada humano começa no jogador em que está, e a lista de donos sai ordenada", () => {
    const f = falso([
      { slot: 2, id: 11 },
      { slot: 1, id: 10 },
      { slot: 7, id: 20 },
    ]);
    expect(f.g.slotDe(10)).toBe(1);
    expect(f.g.slotDe(11)).toBe(2);
    expect(f.g.donos()).toEqual([
      { slot: 1, id: 10, nome: "H10" },
      { slot: 2, id: 11, nome: "H11" },
      { slot: 7, id: 20, nome: "H20" },
    ]);
    expect(f.g.fila(0)).toEqual([11, 10]);
  });

  it("histerese: só troca de jogador se o outro estiver mais de TROCA.histereseM (4 m) mais perto da bola, e depois fica TROCA.travaAposTrocaS (1,5 s) sem trocar sozinho", () => {
    expect(TROCA.histereseM).toBe(4); // H6: era 2,5
    expect(TROCA.travaAposTrocaS).toBe(1.5); // H6: era 0,6
    const f = falso([{ slot: 1, id: 10 }]);
    f.bola(0, 0);
    f.pos(1, 8, 0); // o dele, a 8 m
    f.pos(2, -7, 0); // 1 m mais perto: não basta
    f.g.atualizar();
    expect(f.g.slotDe(10)).toBe(1);

    f.pos(2, 8 - TROCA.histereseM + 0.1, 0); // um pouco menos que a histerese mais perto: não basta
    f.g.atualizar();
    expect(f.g.slotDe(10)).toBe(1);

    f.pos(2, 8 - TROCA.histereseM - 0.1, 0); // um pouco mais que a histerese mais perto: troca
    f.g.atualizar();
    expect(f.g.slotDe(10)).toBe(2);
    // O jogador largado vira bot, com o nome de bot, parado e sem botão seguro
    const largado = f.p.jogador(1)!;
    expect(largado.vaga).toMatchObject({ humano: false, nome: "Bot1" });
    expect(largado.vaga.idControle).toBeUndefined();

    // Logo depois, o jogador dele se afasta e outro fica bem mais perto (mais que a histerese), mas a pausa segura a troca
    f.pos(2, 9, 0);
    f.pos(3, 1, 0);
    f.g.atualizar();
    expect(f.g.slotDe(10)).toBe(2);
    f.mudar.tempo(10 + TROCA.travaAposTrocaS + 0.01);
    f.g.atualizar();
    expect(f.g.slotDe(10)).toBe(3);
  });

  describe("H6: a troca sozinha sem a bola é menos intrusiva", () => {
    /** O humano (id 10) está no slot 1, a `d` m da bola em (0, 0); o companheiro livre (slot 2) está 6 m mais perto (passa da histerese de 4 m). */
    const cena = (d: number): Falso => {
      const f = falso([{ slot: 1, id: 10 }]);
      f.bola(0, 0);
      f.pos(1, d, 0);
      f.pos(2, d - 6, 0);
      return f;
    };
    const empurrar = (f: Falso, mag: number): void => f.g.comando(10, { ...comandoParado(), mag });

    it("as duas condições novas têm constantes próprias em TROCA (12 m e 12 m/s)", () => {
      expect(TROCA.semTrocaComJoystickAteM).toBe(12);
      expect(TROCA.semTrocaBolaAcimaDeMs).toBe(12);
    });

    it("a) com o joystick empurrado e o jogador dele a menos de 12 m da bola, não troca; solto, troca", () => {
      const f = cena(8);
      empurrar(f, magParaByte(1));
      f.g.atualizar();
      expect(f.g.slotDe(10)).toBe(1);
      // Qualquer empurrão conta, mesmo leve
      empurrar(f, magParaByte(0.1));
      f.g.atualizar();
      expect(f.g.slotDe(10)).toBe(1);
      // Soltou o joystick: a troca acontece
      empurrar(f, 0);
      f.g.atualizar();
      expect(f.g.slotDe(10)).toBe(2);
    });

    it("a) a 12 m da bola ou mais, mesmo com o joystick empurrado, troca (o humano não fica preso num jogador longe da jogada)", () => {
      const perto = cena(TROCA.semTrocaComJoystickAteM - 0.1);
      empurrar(perto, magParaByte(1));
      perto.g.atualizar();
      expect(perto.g.slotDe(10)).toBe(1);

      const longe = cena(TROCA.semTrocaComJoystickAteM + 0.1);
      empurrar(longe, magParaByte(1));
      longe.g.atualizar();
      expect(longe.g.slotDe(10)).toBe(2);
    });

    it("a) a condição não gasta a pausa: troca na hora que o joystick solta, e aí a pausa da troca segura a seguinte", () => {
      const f = cena(8);
      empurrar(f, magParaByte(1));
      f.g.atualizar();
      expect(f.g.slotDe(10)).toBe(1); // preso pelo joystick
      empurrar(f, 0);
      f.g.atualizar();
      expect(f.g.slotDe(10)).toBe(2); // trocou assim que soltou
      f.pos(2, 8, 0); // o jogador dele se afasta e o 3 fica a 3 m (5 m mais perto, mais que a histerese): a pausa segura
      f.pos(3, 3, 0);
      f.g.atualizar();
      expect(f.g.slotDe(10)).toBe(2);
    });

    it("b) com a bola acima de 12 m/s (no chão do campo) não troca; a 12 m/s ou menos, troca", () => {
      const rapida = cena(8);
      rapida.velBola(TROCA.semTrocaBolaAcimaDeMs + 0.1, 0);
      rapida.g.atualizar();
      expect(rapida.g.slotDe(10)).toBe(1);

      const diagonal = cena(8); // a velocidade é a do conjunto, não de um eixo
      diagonal.velBola(9, 9); // 12,7 m/s
      diagonal.g.atualizar();
      expect(diagonal.g.slotDe(10)).toBe(1);

      const limite = cena(8);
      limite.velBola(TROCA.semTrocaBolaAcimaDeMs, 0);
      limite.g.atualizar();
      expect(limite.g.slotDe(10)).toBe(2);

      const lenta = cena(8);
      lenta.velBola(5, 5);
      lenta.g.atualizar();
      expect(lenta.g.slotDe(10)).toBe(2);
    });

    it("b) a bola rápida só segura a troca: quando desacelera, a troca acontece", () => {
      const f = cena(8);
      f.velBola(20, 0);
      f.g.atualizar();
      expect(f.g.slotDe(10)).toBe(1);
      f.velBola(3, 0);
      f.g.atualizar();
      expect(f.g.slotDe(10)).toBe(2);
    });

    it("as outras regras não mudam: a bola rápida e o joystick não seguram a regra 1 (portador) nem a troca à mão (regra 4)", () => {
      const f = falso([{ slot: 1, id: 10 }]);
      f.bola(0, 0);
      f.pos(1, -20, 10);
      f.pos(4, 0, 0);
      f.velBola(25, 0);
      f.g.comando(10, { ...comandoParado(), mag: 255 });
      f.mudar.dominante(4);
      f.g.atualizar();
      expect(f.g.slotDe(10)).toBe(4); // regra 1: assume o portador

      const m = cena(8);
      m.velBola(25, 0);
      empurrar(m, 255);
      expect(m.g.trocarManual(1)).toBe(true); // regra 4: CHUTE sem a bola
      expect(m.g.slotDe(10)).toBe(2);
    });
  });

  it("time com a bola: o humano assume quem está com ela", () => {
    const f = falso([{ slot: 1, id: 10 }]);
    f.pos(1, -20, 10);
    f.pos(4, 0, 0);
    f.bola(0, 0);
    f.mudar.dominante(4);
    f.g.atualizar();
    expect(f.g.slotDe(10)).toBe(4);
    expect(f.p.jogador(4)!.vaga).toMatchObject({ humano: true, idControle: 10, nome: "H10" });
  });

  it("com vários humanos, quem já controla o portador continua; senão o primeiro da fila assume", () => {
    const f = falso([
      { slot: 1, id: 10 },
      { slot: 2, id: 11 },
    ]);
    f.pos(1, -20, 10);
    f.pos(2, 20, 10);
    f.bola(0, 0);
    f.mudar.dominante(2);
    f.g.atualizar();
    expect(f.g.slotDe(11)).toBe(2); // já controlava o portador
    expect(f.g.slotDe(10)).toBe(1);

    f.mudar.dominante(4); // um bot do time pega a bola
    f.g.atualizar();
    expect(f.g.slotDe(10)).toBe(4); // 10 é o primeiro da fila (entrou primeiro)
    expect(f.g.slotDe(11)).toBe(2);
  });

  it("goleiro nunca é controlado por humano, nem perto da bola nem com ela na mão", () => {
    const f = falso([{ slot: 1, id: 10 }]);
    f.pos(0, -29, 0);
    f.pos(1, -10, 0);
    f.bola(-28, 0); // o goleiro é quem está mais perto
    f.g.atualizar();
    expect(f.g.slotDe(10)).not.toBe(0);
    f.mudar.dominante(0);
    f.g.atualizar();
    expect(f.g.slotDe(10)).not.toBe(0);
    expect(f.g.trocarManual(f.g.slotDe(10)!)).toBe(true);
    expect(f.g.slotDe(10)).not.toBe(0);
  });

  it("passe com um humano só: o controle vai para quem recebe, na hora", () => {
    const f = falso([{ slot: 1, id: 10 }]);
    f.mudar.dominante(1);
    f.g.aoPassar(1, 4);
    expect(f.g.slotDe(10)).toBe(4);
    expect(f.p.jogador(1)!.vaga.humano).toBe(false);
  });

  it("passe com vários humanos: o passador vai para o fim da fila e o primeiro da fila assume o bot que recebe", () => {
    const f = falso([
      { slot: 1, id: 10 },
      { slot: 2, id: 11 },
      { slot: 3, id: 12 },
    ]);
    expect(f.g.fila(0)).toEqual([10, 11, 12]);
    f.g.aoPassar(1, 4); // 10 passa para o bot 4
    expect(f.g.fila(0)).toEqual([11, 12, 10]);
    expect(f.g.slotDe(11)).toBe(4); // o primeiro da fila assume
    expect(f.g.slotDe(10)).toBe(1); // o passador fica onde estava
    expect(f.p.jogador(2)!.vaga.humano).toBe(false); // o que o 11 largou virou bot

    f.g.aoPassar(4, 5); // agora o 11 (no jogador 4) passa para o bot 5
    expect(f.g.fila(0)).toEqual([12, 10, 11]);
    expect(f.g.slotDe(12)).toBe(5);
  });

  it("passe para um companheiro que já é de outro humano: ele continua com esse humano e a fila não muda", () => {
    const f = falso([
      { slot: 1, id: 10 },
      { slot: 2, id: 11 },
    ]);
    f.g.aoPassar(1, 2);
    expect(f.g.fila(0)).toEqual([10, 11]);
    expect(f.g.slotDe(10)).toBe(1);
    expect(f.g.slotDe(11)).toBe(2);
  });

  it("passe sem destino, para o goleiro ou para o adversário não muda nada", () => {
    const f = falso([{ slot: 1, id: 10 }]);
    f.g.aoPassar(1, undefined);
    f.g.aoPassar(1, 0);
    f.g.aoPassar(1, 8);
    expect(f.g.slotDe(10)).toBe(1);
  });

  it("passe de bot não mexe na fila nem no controle", () => {
    const f = falso([{ slot: 1, id: 10 }]);
    f.g.aoPassar(3, 4); // o 3 é bot
    expect(f.g.slotDe(10)).toBe(1);
  });

  it("CHUTE sem a bola: troca para o companheiro livre mais perto da bola, sem pegar os de outros humanos nem o atual", () => {
    const f = falso([
      { slot: 1, id: 10 },
      { slot: 2, id: 11 },
    ]);
    f.bola(0, 0);
    f.pos(1, 8, 0);
    f.pos(2, 1, 0); // do outro humano: nunca é escolhido
    f.pos(3, 3, 0);
    f.pos(4, 5, 0);
    expect(f.g.trocarManual(1)).toBe(true);
    expect(f.g.slotDe(10)).toBe(3);
    expect(f.g.slotDe(11)).toBe(2);
    // Apertando de novo vai para o próximo mais perto (o 4), e depois volta a alternar
    f.mudar.tempo(12);
    expect(f.g.trocarManual(3)).toBe(true);
    expect(f.g.slotDe(10)).toBe(4);
    // A troca à mão segura a troca sozinha por TROCA.travaAposManualS, que não é menor que a da troca sozinha
    expect(TROCA.travaAposManualS).toBeGreaterThanOrEqual(TROCA.travaAposTrocaS);
    f.pos(3, 0.5, 0); // 4,5 m mais perto que o 4 (a 5 m): passa da histerese
    f.mudar.tempo(12 + TROCA.travaAposManualS - 0.1);
    f.g.atualizar();
    expect(f.g.slotDe(10)).toBe(4);
    f.mudar.tempo(12 + TROCA.travaAposManualS + 0.1);
    f.g.atualizar();
    expect(f.g.slotDe(10)).toBe(3);
  });

  it("quem não é humano não troca à mão", () => {
    const f = falso([{ slot: 1, id: 10 }]);
    expect(f.g.trocarManual(3)).toBe(false);
  });

  it("humano que cai: o jogador dele vira bot e ele sai da fila; ao voltar entra no fim da fila e já ganha um jogador", () => {
    const f = falso([
      { slot: 1, id: 10 },
      { slot: 2, id: 11 },
    ]);
    f.bola(0, 0);
    f.pos(3, 2, 0); // o livre mais perto da bola
    f.g.definirAusente(10, true);
    expect(f.g.slotDe(10)).toBeNull();
    expect(f.p.jogador(1)!.vaga.humano).toBe(false);
    expect(f.g.fila(0)).toEqual([11]);
    expect(f.g.donos().map((d) => d.id)).toEqual([11]);

    f.g.definirAusente(10, false);
    expect(f.g.fila(0)).toEqual([11, 10]);
    expect(f.g.slotDe(10)).toBe(3);
    expect(f.p.jogador(3)!.vaga).toMatchObject({ humano: true, idControle: 10 });
  });

  it("quem cai na vez de passar não atrapalha: o passe vai para o próximo da fila que está presente", () => {
    const f = falso([
      { slot: 1, id: 10 },
      { slot: 2, id: 11 },
      { slot: 3, id: 12 },
    ]);
    f.g.definirAusente(11, true);
    f.g.aoPassar(1, 4);
    expect(f.g.fila(0)).toEqual([12, 10]);
    expect(f.g.slotDe(12)).toBe(4);
  });

  it("humano que entra no meio: ganha o companheiro livre mais perto da bola; no máximo 3 por time", () => {
    const f = falso([{ slot: 1, id: 10 }]);
    f.bola(0, 0);
    f.pos(4, 1, 0);
    const vaga = f.g.adicionar(0, "Novo", 30);
    expect(vaga).toMatchObject({ slot: 4, humano: true, idControle: 30, nome: "Novo" });
    expect(f.g.fila(0)).toEqual([10, 30]);
    expect(f.g.adicionar(0, "Outro", 31)).not.toBeNull(); // 3º humano
    expect(f.g.quantidade(0)).toBe(PARTIDA.maxHumanosPorTime);
    expect(f.g.adicionar(0, "Quarto", 32)).toBeNull(); // 4º não cabe
    expect(f.g.quantidade(0)).toBe(3);
  });

  it("humano que sai de vez libera o jogador (bot) e tira o nome dele da fila", () => {
    const f = falso([
      { slot: 1, id: 10 },
      { slot: 2, id: 11 },
    ]);
    f.g.remover(10);
    expect(f.g.fila(0)).toEqual([11]);
    expect(f.p.jogador(1)!.vaga).toMatchObject({ humano: false, nome: "Bot1" });
    expect(f.g.donos().map((d) => d.id)).toEqual([11]);
  });

  it("ao trocar, o botão que o humano já estava segurando não vira aperto novo (senão a troca à mão repetiria)", () => {
    const f = falso([{ slot: 1, id: 10 }]);
    const segurando: Comando = { ...comandoParado(), seguros: BOTAO.chute, acaoSeq: 7 };
    f.g.comando(10, segurando);
    f.bola(0, 0);
    f.pos(2, 1, 0);
    f.g.trocarManual(1);
    const novo = f.p.jogador(2)!;
    expect(novo.chute.apertado).toBe(true);
    expect(novo.acaoSeq).toBe(7); // o que já foi tocado antes não dispara de novo
    expect(novo.cmd).toBe(segurando);
  });

  it("a versão sobe a cada mudança de mãos", () => {
    const f = falso([{ slot: 1, id: 10 }]);
    const v = f.g.versao;
    f.g.aoPassar(1, 4);
    expect(f.g.versao).toBeGreaterThan(v);
  });

  it("modo fixo (testes antigos): nada troca sozinho", () => {
    const f = falso([{ slot: 1, id: 10 }], false);
    f.mudar.dominante(4);
    f.pos(1, -20, 10);
    f.g.atualizar();
    f.g.aoPassar(1, 4);
    expect(f.g.trocarManual(1)).toBe(false);
    expect(f.g.slotDe(10)).toBe(1);
  });
});

describe("donos: aplicar a mensagem no elenco do aparelho", () => {
  const base: VagaPartida[] = [
    { slot: 1, time: 0, numero: 7, nome: "Ana", nomeBot: "Caio", humano: true, idControle: 5, goleiro: false },
    { slot: 2, time: 0, numero: 8, nome: "Davi", nomeBot: "Davi", humano: false, goleiro: false },
    { slot: 0, time: 0, numero: 1, nome: "Zé", humano: false, goleiro: true },
  ];

  it("o humano passa para o novo jogador e o que ele largou volta ao nome de bot", () => {
    const novo = aplicarDonos(base, [{ slot: 2, id: 5, nome: "Ana" }]);
    expect(novo.find((v) => v.slot === 2)).toMatchObject({ humano: true, idControle: 5, nome: "Ana" });
    expect(novo.find((v) => v.slot === 1)).toMatchObject({ humano: false, nome: "Caio" });
    expect(novo.find((v) => v.slot === 1)!.idControle).toBeUndefined();
    expect(novo.find((v) => v.slot === 0)).toMatchObject({ humano: false, nome: "Zé" });
    expect(base[0]!.humano).toBe(true); // não mexe no que veio
  });

  it("ida e volta com donosDoElenco", () => {
    const donos = [{ slot: 2, id: 5, nome: "Ana" }];
    expect(donosDoElenco(aplicarDonos(base, donos))).toEqual(donos);
  });
});

// ---------------------------------------------------------------------------
// Parte 2: a partida de verdade (bots, goleiros, física), controle FIFA ligado
// ---------------------------------------------------------------------------

const vaga = (slot: number, time: 0 | 1, id: number): VagaPartida => ({
  slot,
  time,
  numero: 7 + (slot % 6),
  nome: `H${id}`,
  humano: true,
  idControle: id,
  goleiro: false,
});

function criar(casa: number[], visitante: number[], extra: { semBots?: boolean; elenco?: VagaPartida[] } = {}): Partida {
  return new Partida({
    config: { ...CONFIG_PADRAO, modo: "arena", duracao: 8 },
    elenco: extra.elenco ?? [...casa.map((id, i) => vaga(1 + i, 0, id)), ...visitante.map((id, i) => vaga(7 + i, 1, id))],
    semente: 11,
    ...(extra.semBots ? { semBots: true } : {}),
    controleFifa: true,
  });
}

const rodar = (p: Partida, s: number): void => {
  for (let i = 0; i < Math.round(s * 60); i++) p.passo();
};

const cmd = (extra: Partial<Comando> & { dirRad?: number; forca01?: number } = {}): Comando => {
  const { dirRad, forca01, ...resto } = extra;
  return { ...comandoParado(), ang: anguloParaByte(dirRad ?? 0), mag: magParaByte(forca01 ?? 0), ...resto };
};

/** As garantias da G1, conferidas a cada passo. */
function conferirInvariantes(p: Partida, presentes: number[]): void {
  const donos = p.donos();
  const slots = donos.map((d) => d.slot);
  // Nunca dois humanos no mesmo jogador
  expect(new Set(slots).size).toBe(slots.length);
  // Todo humano presente controla exatamente um jogador (não goleiro, do próprio time)
  for (const id of presentes) {
    const slot = p.slotDoHumano(id);
    expect(slot, `humano ${id} sem jogador no tick ${p.tick}`).not.toBeNull();
    const j = p.jogador(slot!)!;
    expect(j.vaga.goleiro).toBe(false);
    expect(j.vaga.humano).toBe(true);
    expect(j.vaga.idControle).toBe(id);
  }
  // E só eles são humanos no elenco
  const humanosNoElenco = p.elenco.filter((v) => v.humano).map((v) => v.idControle);
  expect(humanosNoElenco.sort()).toEqual([...presentes].sort());
}

describe("controle estilo FIFA: partida de verdade", () => {
  it("passe de verdade: o evento aponta o recebedor e o controle já está com ele no mesmo passo", () => {
    const p = criar([10], []);
    rodar(p, 6.3);
    expect(p.fase).toBe(FASE.jogo);
    const h = p.jogador(1)!;
    p.posicionarParaTeste(1, 0, 0, 0.55, 0, 0);
    const amigo = p.jogador(4)!.corpo; // um companheiro (bot) bem à frente, no cone do passe
    amigo.x = 12;
    amigo.z = 0;
    rodar(p, 0.1);
    expect(p.dominante).toBe(1);
    p.eventosPendentes();
    // PASSE: aperta, solta (toque) e o servidor manda a bola
    p.definirComandoDoHumano(10, cmd({ seguros: BOTAO.passe }));
    rodar(p, 0.05);
    p.definirComandoDoHumano(10, cmd({ acao: ACAO.passeToque, acaoSeq: 1 }));
    p.passo();
    const passe = p.eventosPendentes().find((e) => e.tipo === "passe");
    expect(passe).toBeDefined();
    const para = (passe as { dados: { para?: number } }).dados.para;
    expect(para).toBeDefined();
    expect(para).not.toBe(1);
    expect(p.slotDoHumano(10)).toBe(para);
    expect(h.vaga.humano).toBe(false);
    conferirInvariantes(p, [10]);
  });

  it("o gol e a assistência saem no nome de quem tocou, mesmo que o humano já tenha trocado de jogador", () => {
    // Sem bots nem goleiros: o gol está vazio. O 2 é um companheiro de bot que só serve de destino da troca.
    const p = new Partida({
      config: { ...CONFIG_PADRAO, modo: "arena", duracao: 8 },
      elenco: [vaga(1, 0, 10), { slot: 2, time: 0, numero: 9, nome: "Bot Dois", humano: false, goleiro: false }, vaga(7, 1, 20)],
      semente: 5,
      semBots: true,
      controleFifa: true,
    });
    rodar(p, 6.3);
    p.posicionarParaTeste(1, 20, 0, 20.55, 0, 0);
    rodar(p, 0.1);
    expect(p.dominante).toBe(1);
    p.eventosPendentes();
    p.chutarComo(p.jogador(1)!, 1, 1, 0); // chute forte para o gol
    p.controle.trocarManual(1); // e logo troca de jogador, antes de a bola entrar
    expect(p.slotDoHumano(10)).toBe(2);
    rodar(p, 3);
    const gol = p.eventosPendentes().find((e) => e.tipo === "gol") as { dados: { slot: number; nome?: string; contra: boolean } } | undefined;
    expect(gol).toBeDefined();
    expect(gol!.dados).toMatchObject({ slot: 1, nome: "H10", contra: false });
    expect(p.gols[0]).toMatchObject({ slot: 1, nome: "H10" });
    expect(p.resumo().destaques.artilheiro).toMatchObject({ nome: "H10", quantidade: 1 });
    // Para o campeonato: o humano H10 fez o gol, mesmo estando no jogador 2 agora
    expect(p.estatisticas.find((c) => c.nome === "H10")).toMatchObject({ humano: true, gols: 1 });
    expect(p.estatisticas.find((c) => c.nome === "Bot Dois")).toBeUndefined();
  });

  it("humano sem lance nenhum aparece nas estatísticas com zeros", () => {
    const p = criar([10], [20]);
    expect(p.estatisticas.filter((c) => c.humano).map((c) => [c.nome, c.gols, c.assistencias, c.desarmes])).toEqual([
      ["H10", 0, 0, 0],
      ["H20", 0, 0, 0],
    ]);
  });

  it("a mensagem do elenco tem um nome de bot para cada jogador de linha, também nas vagas em que o humano começa", () => {
    const p = criar([10, 11], [20]);
    for (const v of p.elenco.filter((x) => !x.goleiro)) expect(v.nomeBot, `slot ${v.slot}`).toBeTruthy();
    expect(p.elenco.find((v) => v.slot === 1)).toMatchObject({ nome: "H10" });
    expect(p.elenco.find((v) => v.slot === 1)!.nomeBot).not.toBe("H10");
  });

  it("5 contra 5 com 3 + 2 humanos, 90 s de comandos aleatórios, com queda e volta: nunca dois no mesmo, todos sempre com um jogador", () => {
    const p = criar([10, 11, 12], [20, 21]);
    const rng = criarRng(99);
    const presentes = new Set([10, 11, 12, 20, 21]);
    let seq = 0;
    for (let tick = 0; tick < 90 * 60; tick++) {
      if (tick % 15 === 0) {
        for (const id of presentes) {
          const botoes = (rng.sorteio(0.3) ? BOTAO.chute : 0) | (rng.sorteio(0.3) ? BOTAO.passe : 0);
          const acao = rng.sorteio(0.2) ? [ACAO.chute, ACAO.passeToque, ACAO.passeSegurado][rng.inteiro(0, 2)]! : 0;
          p.definirComandoDoHumano(
            id,
            cmd({ dirRad: rng.entre(0, Math.PI * 2), forca01: rng.entre(0, 1), seguros: botoes, acao, forca: rng.inteiro(0, 255), acaoSeq: acao ? ++seq & 255 : 0 }),
          );
        }
      }
      if (tick === 1500) {
        p.definirAusenteHumano(11, true);
        presentes.delete(11);
        expect(p.slotDoHumano(11)).toBeNull();
        expect(p.controle.fila(0)).not.toContain(11);
      }
      if (tick === 2500) {
        p.definirAusenteHumano(11, false);
        presentes.add(11);
        expect(p.controle.fila(0).at(-1)).toBe(11);
      }
      if (tick === 3000) {
        const vaga = p.promoverHumano(1, "Chegou", 22);
        expect(vaga).not.toBeNull();
        presentes.add(22);
      }
      if (tick === 4000) {
        p.removerHumano(20);
        presentes.delete(20);
      }
      p.passo();
      conferirInvariantes(p, [...presentes]);
    }
  });
});
