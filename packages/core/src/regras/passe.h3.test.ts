import { describe, expect, it } from "vitest";
import { BOLA, PASSE, RECEPCAO, RECEPCAO_PASSE } from "../constantes";
import { ACAO, BOTAO, FASE, anguloParaByte, comandoParado, magParaByte, type Comando } from "../protocolo/binario";
import { CONFIG_PADRAO } from "../protocolo/config";
import type { Dificuldade } from "../constantes";
import { Partida } from "./partida";

// H3: o passe vai 100% mirado no companheiro (igual em todas as dificuldades), é mais rápido, "segue" o receptor no último terço do
// trajeto (sem teleporte, e para se alguém toca na bola) e o receptor pretendido, humano ou bot, amortece e controla a bola com
// mais raio e força que a recepção comum.

const DT = 1 / 60;

const joy = (de: { x: number; z: number }, para: { x: number; z: number }): Comando => ({
  ...comandoParado(),
  ang: anguloParaByte(Math.atan2(-(para.z - de.z), para.x - de.x)), // cima do celular = -Z (PROTOCOLO 4)
  mag: magParaByte(1),
});

/** Ana (slot 1) com a bola em (0, 0) e a Bia (slot 2) parada em (16, 0); todos os outros jogadores longe, parados. */
function cena(opcoes: { dificuldade?: Dificuldade; biaHumana?: boolean; comBots?: boolean } = {}): Partida {
  const p = new Partida({
    config: { ...CONFIG_PADRAO, modo: "arena", duracao: 4, dificuldade: opcoes.dificuldade ?? "medio" },
    elenco: [
      { slot: 1, time: 0, numero: 7, nome: "Ana", humano: true, idControle: 1, goleiro: false },
      { slot: 2, time: 0, numero: 8, nome: "Bia", humano: opcoes.biaHumana ?? true, ...(opcoes.biaHumana === false ? {} : { idControle: 2 }), goleiro: false },
      { slot: 7, time: 1, numero: 9, nome: "Dan", humano: false, goleiro: false },
    ],
    semente: 9,
    semBots: !opcoes.comBots,
  });
  for (let i = 0; i < 400 && p.fase !== FASE.jogo; i++) p.passo();
  expect(p.fase).toBe(FASE.jogo);
  let k = 0;
  for (const j of p.jogadores) {
    if (j.vaga.slot === 1 || j.vaga.slot === 2) continue;
    j.corpo.x = -24 + (k % 4) * 3;
    j.corpo.z = (k < 4 ? -1 : 1) * 14;
    j.corpo.vx = j.corpo.vz = 0;
    k++;
  }
  p.posicionarParaTeste(1, 0, 0, 0.55, 0, 0);
  const bia = p.jogador(2)!;
  bia.corpo.x = 16;
  bia.corpo.z = 0;
  bia.corpo.vx = bia.corpo.vz = 0;
  p.passo();
  p.passo(); // a Ana pega a bola
  expect(p.dominante).toBe(1);
  return p;
}

/** Ana solta um passe rasteiro com o joystick apontado para a Bia. Devolve a velocidade inicial da bola e quem foi escolhido. */
function passar(p: Partida): { vx: number; vz: number; para: number | undefined } {
  const ana = p.jogador(1)!;
  const dir = joy(ana.corpo, p.jogador(2)!.corpo);
  p.definirComando(1, { ...dir, seguros: BOTAO.passe });
  for (let i = 0; i < 3; i++) p.passo();
  p.eventosPendentes();
  p.definirComando(1, { ...dir, seguros: 0, acao: ACAO.passeToque, acaoSeq: 1 });
  p.passo();
  const ev = p.eventosPendentes().find((e) => e.tipo === "passe");
  return { vx: p.bola.vx, vz: p.bola.vz, para: ev && ev.tipo === "passe" ? ev.dados.para : undefined };
}

describe("passe H3: igual em todas as dificuldades", () => {
  it("a mesma cena dá exatamente o mesmo passe no Fácil, no Médio e no Difícil", () => {
    const rs = (["facil", "medio", "dificil"] as const).map((d) => {
      const p = cena({ dificuldade: d });
      p.jogador(2)!.corpo.z = 3;
      return passar(p);
    });
    expect(rs[0]).toEqual(rs[1]);
    expect(rs[1]).toEqual(rs[2]);
    expect(rs[0]!.para).toBe(2);
  });

  it("o joystick 25° torto para fora da Bia: a bola vai nela mesmo assim, em cheio (todas as dificuldades)", () => {
    for (const d of ["facil", "medio", "dificil"] as const) {
      const p = cena({ dificuldade: d });
      const ana = p.jogador(1)!;
      const torto = { ...joy(ana.corpo, p.jogador(2)!.corpo) };
      torto.ang = (torto.ang + Math.round((25 / 360) * 256)) & 255;
      p.definirComando(1, { ...torto, seguros: BOTAO.passe });
      for (let i = 0; i < 3; i++) p.passo();
      p.definirComando(1, { ...torto, seguros: 0, acao: ACAO.passeToque, acaoSeq: 1 });
      p.passo();
      expect(Math.abs(Math.atan2(p.bola.vz, p.bola.vx)), d).toBeLessThan(0.02);
    }
  });
});

describe("passe H3: a bola segue o receptor no último terço", () => {
  /** Roda o passe; quando a bola passa de `quando` (fração do trajeto), a Bia dá um passo de lado de `lado` m. Devolve o histórico. */
  function rodar(lado: number, giro: number, quando = 0.5) {
    const guardado = PASSE.seguir.giroMaxRadS;
    (PASSE.seguir as { giroMaxRadS: number }).giroMaxRadS = giro;
    try {
      const p = cena();
      passar(p);
      const bia = p.jogador(2)!;
      let moveu = false;
      let maiorPasso = 0;
      let maiorGiroPorPasso = 0;
      let maiorMudancaDeVelocidade = 0;
      let vzNoFim = 0;
      let antes = { x: p.bola.x, z: p.bola.z, vx: p.bola.vx, vz: p.bola.vz };
      let seguiuAteOFim = false;
      let recebeu = false;
      for (let i = 0; i < 90 && p.dominante === null; i++) {
        if (!moveu && p.bola.x > 16 * quando) {
          bia.corpo.z += lado;
          moveu = true;
        }
        p.passo();
        const b = p.bola;
        if (bia.recepcaoAte > p.t) recebeu = true;
        if (!recebeu) {
          // Só até a recepção da Bia começar: dali em diante quem manda é a recepção (testada à parte)
          maiorPasso = Math.max(maiorPasso, Math.hypot(b.x - antes.x, b.z - antes.z));
          const g = Math.abs(Math.atan2(b.vz, b.vx) - Math.atan2(antes.vz, antes.vx));
          if (Math.hypot(b.vx, b.vz) > 3 && g < 1) maiorGiroPorPasso = Math.max(maiorGiroPorPasso, g);
          maiorMudancaDeVelocidade = Math.max(maiorMudancaDeVelocidade, Math.abs(Math.hypot(b.vx, b.vz) - Math.hypot(antes.vx, antes.vz)));
          vzNoFim = Math.max(vzNoFim, Math.abs(b.vz));
        }
        if (p.passeEmVoo) seguiuAteOFim = true;
        antes = { x: b.x, z: b.z, vx: b.vx, vz: b.vz };
      }
      return { p, maiorPasso, maiorGiroPorPasso, maiorMudancaDeVelocidade, vzNoFim, seguiuAteOFim };
    } finally {
      (PASSE.seguir as { giroMaxRadS: number }).giroMaxRadS = guardado;
    }
  }

  it("se a Bia se desloca 1,2 m de lado no meio do caminho, a direção da bola gira para ela só no fim (e sem seguir ela passaria reto)", () => {
    const com = rodar(1.2, PASSE.seguir.giroMaxRadS);
    const sem = rodar(1.2, 0);
    expect(com.vzNoFim).toBeGreaterThan(0.8); // a bola já vira para o lado dela (antes da recepção)
    expect(Math.abs(sem.vzNoFim)).toBeLessThan(0.1); // sem a correção, segue reta
  });

  it("não há teleporte: a bola nunca anda mais que sua velocidade num passo, a velocidade escalar não dá salto e o giro respeita o limite por segundo", () => {
    const r = rodar(1.5, PASSE.seguir.giroMaxRadS);
    expect(r.maiorPasso).toBeLessThan(PASSE.velocidadeMax * DT + 0.02);
    expect(r.maiorMudancaDeVelocidade).toBeLessThan(1.5); // só o atrito/amortecimento de um passo, nada de salto
    expect(r.maiorGiroPorPasso).toBeLessThanOrEqual(PASSE.seguir.giroMaxRadS * DT + 1e-6);
  });

  it("não segue antes do último terço: a Bia sai 1,2 m do lugar quando a bola ainda está no começo e a bola não vira no meio do caminho", () => {
    const p = cena();
    passar(p);
    p.jogador(2)!.corpo.z = 1.2;
    let vzMax = 0;
    for (let i = 0; i < 90 && p.bola.x < 16 * (PASSE.seguir.inicioFracao - 0.03); i++) {
      p.passo();
      vzMax = Math.max(vzMax, Math.abs(p.bola.vz));
    }
    expect(vzMax).toBeLessThan(0.05);
  });

  it("um adversário que toca na bola acaba com o passe no ar: a bola não segue mais a Bia", () => {
    const p = cena();
    passar(p);
    const bia = p.jogador(2)!;
    bia.corpo.z = 2.5; // a Bia fica longe da linha: a bola vai curvar para ela se ninguém atrapalhar
    const dan = p.jogador(7)!;
    dan.corpo.x = 13.6;
    dan.corpo.z = 0;
    dan.corpo.vx = dan.corpo.vz = 0;
    let tocou = false;
    for (let i = 0; i < 60; i++) {
      p.passo();
      if (p.passeEmVoo === null) {
        tocou = true;
        break;
      }
    }
    expect(tocou).toBe(true);
    expect(p.dominante === 2).toBe(false);
    // E a direção da bola, depois do toque, não vira mais para a Bia
    const vz0 = p.bola.vz;
    for (let i = 0; i < 6; i++) p.passo();
    expect(Math.abs(p.bola.vz - vz0)).toBeLessThan(1.5);
  });

  it("a bola que o receptor já dominou, ou que passou dele, deixa de ser 'passe no ar'", () => {
    const p = cena();
    passar(p);
    expect(p.passeEmVoo?.para).toBe(2);
    for (let i = 0; i < 120 && p.dominante !== 2; i++) p.passo();
    expect(p.dominante).toBe(2);
    expect(p.passeEmVoo).toBeNull();
  });
});

describe("passe H3: o receptor pretendido controla a bola com mais raio e força", () => {
  /** A bola vem de 10 m de distância, a `v` m/s, passando a `desvio` m do receptor (parado em (0, 0)). */
  function lancar(slot: 1 | 2, comoPasse: boolean, v: number, desvio: number, humana: boolean) {
    const p = cena({ biaHumana: humana });
    p.jogador(slot === 1 ? 2 : 1)!.corpo.x = -30; // o outro jogador sai de perto
    const r = p.jogador(slot)!;
    p.posicionarParaTeste(slot, 0, 0, 10, desvio, 0);
    r.cmd = comandoParado();
    const b = p.bola;
    b.x = -10;
    b.y = BOLA.raio;
    b.z = desvio;
    b.vx = v;
    b.vz = 0;
    b.vy = 0;
    p.dominante = null;
    if (comoPasse) p.passeEmVoo = { para: slot, time: 0, x0: -10, z0: desvio, total: 10, alto: false, desde: p.t };
    let maiorSalto = 0;
    let dominou = false;
    let recepcaoForte = false;
    for (let i = 0; i < 120 && !dominou && b.x < 6; i++) {
      const vx = b.vx;
      p.passo();
      maiorSalto = Math.max(maiorSalto, Math.abs(b.vx - vx));
      if (r.recepcaoAte > p.t && r.recepcaoForte) recepcaoForte = true;
      if (p.dominante === slot) dominou = true;
    }
    return { dominou, maiorSalto, recepcaoForte };
  }

  it("humano: um passe a 18 m/s passando a 2 m do pé é dominado; a mesma bola solta (sem ser passe) passa direto", () => {
    expect(2).toBeGreaterThan(RECEPCAO.raio);
    expect(2).toBeLessThan(RECEPCAO_PASSE.raio);
    expect(lancar(1, true, 18, 2, true).dominou).toBe(true);
    expect(lancar(1, false, 18, 2, true).dominou).toBe(false);
  });

  it("bot: o receptor pretendido (um bot) também amortece e domina a bola do passe, com a recepção reforçada", () => {
    const r = lancar(2, true, 18, 2, false);
    expect(r.dominou).toBe(true);
    expect(r.recepcaoForte).toBe(true);
  });

  it("mesmo com mais força, a recepção só muda a velocidade aos poucos (sem teleporte)", () => {
    const r = lancar(1, true, 20, 1.5, true);
    expect(r.dominou).toBe(true);
    const teto = 20 * (1 - Math.exp(-DT / RECEPCAO_PASSE.amortecimentoS)) + RECEPCAO_PASSE.puxao * DT + 0.8;
    expect(r.maiorSalto).toBeLessThan(teto);
  });
});

describe("passe H3: o bot que vai receber corre ao encontro da bola", () => {
  it("o alvo do receptor (bot) fica na bola que vem, não na posição de formação dele", () => {
    const p = cena({ biaHumana: false, comBots: true });
    const bia = p.jogador(2)!;
    bia.cerebro.baseX = 30; // a posição de formação dela é longe da bola
    bia.cerebro.baseZ = 14;
    const r = passar(p);
    expect(r.para).toBe(2);
    expect(p.passeEmVoo?.para).toBe(2);
    for (let i = 0; i < 4; i++) p.passo();
    expect(p.passeEmVoo).not.toBeNull();
    const c = bia.cerebro;
    const h = Math.hypot(p.bola.vx, p.bola.vz);
    expect(Math.hypot(c.alvoX - p.bola.x, c.alvoZ - p.bola.z)).toBeLessThanOrEqual(0.6 * h + 0.5); // vai na bola, não na formação
  });
});
