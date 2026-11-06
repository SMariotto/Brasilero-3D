import { describe, expect, it } from "vitest";
import { GOLEIRO } from "../constantes";
import { ACAO, ANIM, BOTAO, FASE, anguloParaByte, comandoParado, magParaByte, type Comando } from "../protocolo/binario";
import { CONFIG_PADRAO } from "../protocolo/config";
import { Partida, type VagaPartida } from "./partida";
import { posicoesDeChute, simularChute } from "./simulacao";

// H4: o goleiro segura o que defende, protege a bola, distribui rápido (de mão ou de pé), não se joga na bola recuada pelo companheiro
// (nada de gol contra), sai da linha no 1 contra 1 e o lançamento dele chega ao companheiro por regra de jogo.

const vaga = (slot: number, time: 0 | 1, goleiro = false, humano = !goleiro): VagaPartida => ({ slot, time, numero: slot + 1, nome: `J${slot}`, humano, ...(humano ? { idControle: slot + 1 } : {}), goleiro });

const ANA = 1; // humano da Casa
const GK_CASA = 0;
const GK_VIS = 6;

/** Partida em jogo (campo 5). `extra` entra no elenco. Os humanos ficam parados; os bots de linha que existirem jogam. */
function criar(extra: VagaPartida[] = [], semente = 1): Partida {
  const p = new Partida({
    config: { ...CONFIG_PADRAO, modo: "campo", duracao: 4, dificuldade: "medio" },
    elenco: [vaga(ANA, 0), vaga(GK_CASA, 0, true), vaga(GK_VIS, 1, true), ...extra],
    semente,
    semBots: true,
  });
  for (let i = 0; i < 6.3 * 60 && p.fase !== FASE.jogo; i++) p.passo();
  for (let i = 0; i < 20; i++) p.passo();
  expect(p.fase).toBe(FASE.jogo);
  p.soltarReinicio(); // a bola já está em jogo (sem a saída de bola esperando alguém)
  p.eventosPendentes();
  return p;
}

const rodar = (p: Partida, s: number): void => {
  for (let i = 0; i < Math.round(s * 60); i++) p.passo();
};

/** Pôe todo mundo que não é o goleiro Visitante e o `quem` longe, num canto parado (para a cena ficar limpa). */
function afastar(p: Partida, manter: number[]): void {
  let k = 0;
  for (const j of p.jogadores) {
    if (manter.includes(j.vaga.slot)) continue;
    j.corpo.x = -26 + (k % 5) * 2.5;
    j.corpo.z = k < 5 ? -17 : 17;
    j.corpo.vx = j.corpo.vz = 0;
    k++;
  }
}

/** Faz a bola chegar ao goleiro Visitante devagar (rel < 18 m/s) para o canto, como um chute fraco: ele mergulha e segura. */
function chuteFracoParaOCanto(p: Partida): void {
  const b = p.bola;
  b.x = 20;
  b.y = 0.11;
  b.z = 0;
  b.vx = 13;
  b.vz = 1.9;
  b.vy = 0;
  p.dominante = null;
}

function ateGoleiroPegar(p: Partida, limiteS = 2): number {
  const t0 = p.t;
  for (let i = 0; i < limiteS * 60 && p.dominante !== GK_VIS; i++) p.passo();
  return p.dominante === GK_VIS ? p.t - t0 : -1;
}

describe("goleiro H4: segura depois da defesa", () => {
  it("chute devagar no canto, no mergulho: a bola fica nas mãos (nada de rebote)", () => {
    for (let semente = 1; semente <= 6; semente++) {
      const p = criar([], semente);
      afastar(p, [GK_VIS, GK_CASA]);
      chuteFracoParaOCanto(p);
      const tempo = ateGoleiroPegar(p);
      expect(tempo, `semente ${semente}`).toBeGreaterThan(0);
      // Nos 0,3 s seguintes a bola não sai de perto dele
      const g = p.jogador(GK_VIS)!;
      for (let i = 0; i < 18; i++) {
        p.passo();
        expect(Math.hypot(p.bola.x - g.corpo.x, p.bola.z - g.corpo.z), `semente ${semente}`).toBeLessThan(1.6);
        expect(p.dominante).toBe(GK_VIS);
      }
      expect(p.placar).toEqual([0, 0]);
    }
  });

  it("chute forte demais para segurar continua sendo espalmado (a bola sai para o lado)", () => {
    let espalmou = 0;
    for (let semente = 1; semente <= 12; semente++) {
      const p = criar([], semente);
      afastar(p, [GK_VIS, GK_CASA]);
      const b = p.bola;
      b.x = 12;
      b.y = 0.11;
      b.z = 0;
      b.vx = 27;
      b.vz = 1.4;
      b.vy = 1;
      p.dominante = null;
      rodar(p, 0.9);
      if (p.eventosPendentes().some((e) => e.tipo === "defesa" && !e.dados.encaixou)) espalmou++;
    }
    expect(espalmou).toBeGreaterThanOrEqual(9);
  });
});

describe("goleiro H4: proteger a bola", () => {
  it("com um adversário por perto, o corpo vira de costas para ele (a bola fica do lado oposto) e ninguém rouba a bola das mãos", () => {
    const p = criar([vaga(7, 1)]);
    afastar(p, [GK_VIS, GK_CASA, 7]);
    chuteFracoParaOCanto(p);
    expect(ateGoleiroPegar(p)).toBeGreaterThan(0);
    const g = p.jogador(GK_VIS)!;
    const adv = p.jogador(ANA)!;
    // Ana (da Casa) fica a 3 m, de frente para o gol, pelo lado do campo
    adv.corpo.x = g.corpo.x - 2.6;
    adv.corpo.z = g.corpo.z + 1.4;
    rodar(p, 0.32);
    const rumoParaLongeDela = Math.atan2(g.corpo.z - adv.corpo.z, g.corpo.x - adv.corpo.x);
    expect(Math.cos(g.corpo.dir - rumoParaLongeDela)).toBeGreaterThan(0.85);
    // A bola está do lado de lá: mais perto do gol que o goleiro, e longe da Ana
    expect(Math.hypot(p.bola.x - adv.corpo.x, p.bola.z - adv.corpo.z)).toBeGreaterThan(Math.hypot(g.corpo.x - adv.corpo.x, g.corpo.z - adv.corpo.z));
    expect(p.eventosPendentes().some((e) => e.tipo === "roubo")).toBe(false);
  });

  it("bote e carrinho do atacante não tiram a bola do goleiro", () => {
    for (const carrinho of [false, true]) {
      const p = criar();
      afastar(p, [GK_VIS, GK_CASA]);
      chuteFracoParaOCanto(p);
      expect(ateGoleiroPegar(p)).toBeGreaterThan(0);
      const g = p.jogador(GK_VIS)!;
      const ana = p.jogador(ANA)!;
      ana.corpo.x = g.corpo.x - 1.2;
      ana.corpo.z = g.corpo.z;
      p.definirComando(ANA, { ...comandoParado(), ang: anguloParaByte(0), mag: 0, seguros: BOTAO.passe });
      rodar(p, carrinho ? 0.32 : 0.2);
      const rouboAntes = p.eventosPendentes().some((e) => e.tipo === "roubo");
      expect(rouboAntes, carrinho ? "carrinho" : "bote").toBe(false);
    }
  });
});

describe("goleiro H4: distribuir de mão em até ~1,5 s", () => {
  /** Goleiro com a bola nas mãos, companheiros e adversários posicionados pelo teste. */
  function comABola(extra: VagaPartida[], semente = 1): { p: Partida; tPegou: number } {
    const p = criar(extra, semente);
    afastar(p, [GK_VIS, GK_CASA, ...extra.map((e) => e.slot)]);
    chuteFracoParaOCanto(p);
    for (const e of extra) {
      const j = p.jogador(e.slot)!;
      j.cmd = comandoParado();
    }
    return { p, tPegou: -1 };
  }

  it("lança em até 1,5 s depois de pegar a bola", () => {
    const { p } = comABola([vaga(8, 1)]);
    const b = p.jogador(8)!;
    b.corpo.x = 8;
    b.corpo.z = 9;
    expect(ateGoleiroPegar(p)).toBeGreaterThan(0);
    const t0 = p.t;
    p.eventosPendentes();
    let quando = -1;
    for (let i = 0; i < 3 * 60 && quando < 0; i++) {
      p.passo();
      if (p.eventosPendentes().some((e) => e.tipo === "passe" && e.dados.de === GK_VIS)) quando = p.t - t0;
    }
    expect(quando).toBeGreaterThan(0);
    expect(quando).toBeLessThanOrEqual(1.5);
  });

  it("lança por cima no companheiro livre MAIS PRÓXIMO, e não no que está marcado", () => {
    const { p } = comABola([vaga(8, 1), vaga(9, 1), vaga(2, 0)]);
    p.jogador(8)!.corpo.x = 14; // o mais perto, mas com a Bia (adversária) colada
    p.jogador(8)!.corpo.z = -8;
    p.jogador(2)!.corpo.x = 15;
    p.jogador(2)!.corpo.z = -8.5;
    p.jogador(9)!.corpo.x = 6; // livre, um pouco mais longe
    p.jogador(9)!.corpo.z = 10;
    expect(ateGoleiroPegar(p)).toBeGreaterThan(0);
    p.eventosPendentes();
    let ev: ReturnType<Partida["eventosPendentes"]>[number] | undefined;
    for (let i = 0; i < 3 * 60 && !ev; i++) {
      p.passo();
      ev = p.eventosPendentes().find((e) => e.tipo === "passe" && e.dados.de === GK_VIS);
    }
    expect(ev).toMatchObject({ dados: { de: GK_VIS, para: 9, alto: true } });
  });

  it("sem ninguém livre: lança longe e para o lado, nunca para o meio na frente do próprio gol", () => {
    for (let semente = 1; semente <= 6; semente++) {
      const { p } = comABola([vaga(8, 1), vaga(2, 0), vaga(3, 0)], semente);
      // O único companheiro está marcado; outro adversário perto da bola
      p.jogador(8)!.corpo.x = 12;
      p.jogador(8)!.corpo.z = 5;
      p.jogador(2)!.corpo.x = 12.5;
      p.jogador(2)!.corpo.z = 5.5;
      p.jogador(3)!.corpo.x = 18;
      p.jogador(3)!.corpo.z = 4;
      expect(ateGoleiroPegar(p)).toBeGreaterThan(0);
      let ev: ReturnType<Partida["eventosPendentes"]>[number] | undefined;
      for (let i = 0; i < 3 * 60 && !ev; i++) {
        p.passo();
        ev = p.eventosPendentes().find((e) => e.tipo === "passe" && e.dados.de === GK_VIS);
      }
      expect(ev, `semente ${semente}`).toBeDefined();
      expect((ev as { dados: { para?: number } }).dados.para).toBeUndefined();
      // Para onde a bola cai: longe (para o campo do adversário, X negativo) e perto da lateral
      let x = 0;
      let z = 0;
      for (let i = 0; i < 200; i++) {
        p.passo();
        if (i > 20 && p.bola.y < 0.2) {
          x = p.bola.x;
          z = p.bola.z;
          break;
        }
      }
      expect(x, `semente ${semente}`).toBeLessThan(p.jogador(GK_VIS)!.corpo.x - 15);
      expect(Math.abs(z), `semente ${semente}`).toBeGreaterThan(p.campo.areaLarg / 2 + 3);
    }
  });
});

describe("goleiro H4: o lançamento dele chega ao companheiro (regra de jogo, não física)", () => {
  function lance(semente: number, humano: boolean, comAdversarioNoCaminho: boolean) {
    const p = criar([vaga(8, 1, false, humano)], semente);
    afastar(p, [GK_VIS, GK_CASA, 8, ANA]);
    const rec = p.jogador(8)!;
    rec.corpo.x = 6;
    rec.corpo.z = 8;
    chuteFracoParaOCanto(p);
    const ana = p.jogador(ANA)!;
    ana.corpo.x = -30; // longe até pegar
    ana.corpo.z = 0;
    ateGoleiroPegar(p);
    p.eventosPendentes();
    let lancou = false;
    let roubos = 0;
    let dominou = false;
    for (let i = 0; i < 6 * 60 && !dominou; i++) {
      p.passo();
      const evs = p.eventosPendentes();
      if (evs.some((e) => e.tipo === "passe" && e.dados.de === GK_VIS)) {
        lancou = true;
        if (comAdversarioNoCaminho) {
          // O adversário (Ana) corre para o ponto onde a bola vai cair, e tenta o bote em cima do receptor
          ana.corpo.x = rec.corpo.x + 1.5;
          ana.corpo.z = rec.corpo.z - 0.5;
          p.definirComando(ANA, { ...comandoParado(), seguros: BOTAO.passe });
        }
      }
      roubos += evs.filter((e) => e.tipo === "roubo").length;
      if (p.dominante === 8) dominou = true;
    }
    return { lancou, dominou, roubos, dono: p.dominante };
  }

  it("o receptor controla a bola com certeza, humano ou bot, em 16 jogadas diferentes", () => {
    for (const humano of [true, false]) {
      for (let semente = 1; semente <= 8; semente++) {
        const r = lance(semente, humano, false);
        expect(r.lancou, `${humano ? "humano" : "bot"} ${semente}`).toBe(true);
        expect(r.dominou, `${humano ? "humano" : "bot"} ${semente}`).toBe(true);
      }
    }
  });

  it("o adversário que corre para a bola e tenta bote ou roubar não consegue: a bola é do receptor", () => {
    for (const humano of [true, false]) {
      for (let semente = 1; semente <= 5; semente++) {
        const r = lance(semente, humano, true);
        expect(r.dominou, `${humano ? "humano" : "bot"} ${semente}`).toBe(true);
        expect(r.roubos, `${humano ? "humano" : "bot"} ${semente}`).toBe(0);
      }
    }
  });
});

describe("goleiro H4: bola recuada pelo companheiro é só de pé (nada de gol contra)", () => {
  /** Um companheiro (humano, da Casa) recua a bola para o goleiro da Casa com um adversário (bot) pressionando a Ana por trás/pelo lado (se ele fica NA frente da bola, o passe vira bloqueio, que é outra jogada). */
  function recuo(distancia: number, semente: number, adversarioX: number, adversarioZ: number) {
    const p = new Partida({
      config: { ...CONFIG_PADRAO, modo: "campo", duracao: 4, dificuldade: "dificil" },
      elenco: [vaga(ANA, 0), vaga(GK_CASA, 0, true), vaga(GK_VIS, 1, true), vaga(7, 1, false, false)],
      semente,
    });
    for (let i = 0; i < 6.3 * 60 && p.fase !== FASE.jogo; i++) p.passo();
    for (let i = 0; i < 20; i++) p.passo();
    p.soltarReinicio();
    p.eventosPendentes();
    const gx = -p.campo.metadeComp;
    afastar(p, [ANA, GK_CASA, GK_VIS, 7]);
    const ana = p.jogador(ANA)!;
    const dan = p.jogador(7)!;
    const gk = p.jogador(GK_CASA)!;
    p.posicionarParaTeste(ANA, gx + 1.5 + distancia, 2.5, gx + 2 + distancia, 2.5, Math.PI);
    gk.corpo.x = gx + 2;
    gk.corpo.z = 0;
    dan.corpo.x = gx + distancia + adversarioX;
    dan.corpo.z = adversarioZ;
    for (let i = 0; i < 20; i++) p.passo();
    // A Ana passa para o goleiro (joystick para o gol dela, toque no PASSE)
    const dir: Comando = { ...comandoParado(), ang: anguloParaByte(Math.atan2(-(0 - ana.corpo.z), gx - ana.corpo.x)), mag: magParaByte(1) };
    p.definirComando(ANA, { ...dir, seguros: BOTAO.passe });
    for (let i = 0; i < 3; i++) p.passo();
    p.eventosPendentes();
    p.definirComando(ANA, { ...dir, seguros: 0, acao: ACAO.passeToque, acaoSeq: 1 });
    p.passo();
    p.definirComando(ANA, comandoParado());
    const passou = p.eventosPendentes().find((e) => e.tipo === "passe");
    let mergulhou = false;
    let golContra = false;
    let jogouDePe: number | null = null;
    let jogouDeMao = false;
    const t0 = p.t;
    let pegouAs: number | null = null;
    const trace: string[] = [];
    for (let i = 0; i < 6 * 60; i++) {
      p.passo();
      if (i % 6 === 0 && i < 150) trace.push(`${i}: bola ${p.bola.x.toFixed(1)},${p.bola.z.toFixed(1)} v${p.bola.vx.toFixed(1)},${p.bola.vz.toFixed(1)} gk ${p.jogador(GK_CASA)!.corpo.x.toFixed(1)},${p.jogador(GK_CASA)!.corpo.z.toFixed(1)} dan ${dan.corpo.x.toFixed(1)},${dan.corpo.z.toFixed(1)} dom ${p.dominante}`);
      const g = p.snapshot().jogadores.find((j) => j.slot === GK_CASA)!;
      // só vale como erro se mergulhou enquanto a bola ainda era "recuada" (depois que o adversário toca nela, o chute dele é jogo normal)
      if ((g.anim === ANIM.goleiroMergulhoEsq || g.anim === ANIM.goleiroMergulhoDir) && p.bolaRecuadaPara(p.jogador(GK_CASA)!)) mergulhou = true;
      if (p.dominante === GK_CASA && pegouAs === null) pegouAs = p.t;
      for (const e of p.eventosPendentes()) {
        if (e.tipo === "gol") golContra = true;
        if ((e.tipo === "passe" || e.tipo === "chute") && (e.dados as { de?: number }).de === GK_CASA && jogouDePe === null) {
          jogouDePe = p.t - (pegouAs ?? t0);
          if (e.tipo === "passe" && e.dados.alto) jogouDeMao = true;
        }
        if (e.tipo === "chute" && e.dados.slot === GK_CASA && jogouDePe === null) jogouDePe = p.t - (pegouAs ?? t0);
      }
    }
    return { passou, mergulhou, golContra, jogouDePe, jogouDeMao, pegouAs, placar: p.placar, trace: trace.join(" | ") };
  }

  it("um passe de 5 a 14 m para o goleiro com o adversário em cima NÃO vira gol contra, em várias situações", () => {
    let total = 0;
    for (const distancia of [5, 8, 11, 14]) {
      for (const semente of [1, 2, 3, 4]) {
        for (const [ax, az] of [[4, 1.5], [5, -2], [3.5, 3.5]] as const) {
          const r = recuo(distancia, semente, ax, az);
          total++;
          expect(r.golContra, `dist ${distancia} semente ${semente} adv ${ax},${az}: ${r.trace}`).toBe(false);
          expect(r.placar[1], `dist ${distancia} semente ${semente}`).toBe(0);
        }
      }
    }
    expect(total).toBe(48);
  });

  it("o goleiro não mergulha na bola recuada, domina com o pé e joga de pé (passe rasteiro ou chute), não de mão", () => {
    let comPe = 0;
    for (const distancia of [8, 11]) {
      for (const semente of [1, 2, 3]) {
        const r = recuo(distancia, semente, 4, 2);
        expect(r.mergulhou, `MERGULHOU dist ${distancia} semente ${semente}: ${r.trace}`).toBe(false);
        expect(r.jogouDeMao, `DE MÃO dist ${distancia} semente ${semente}: ${r.trace}`).toBe(false);
        if (r.jogouDePe !== null) {
          comPe++;
          expect(r.jogouDePe, `dist ${distancia} semente ${semente}`).toBeLessThanOrEqual(1.3); // ~1 s depois de dominar
        }
      }
    }
    expect(comPe).toBeGreaterThanOrEqual(4);
  });
});

describe("goleiro H4: saída no 1 contra 1", () => {
  const golX = (p: Partida): number => p.campo.metadeComp;

  function noUmContraUm(defensor: boolean, atacanteX: number): number {
    const p = criar(defensor ? [vaga(9, 1)] : []);
    afastar(p, [GK_VIS, ANA, ...(defensor ? [9] : [])]);
    if (defensor) {
      const d = p.jogador(9)!;
      d.corpo.x = atacanteX + 4;
      d.corpo.z = 1;
    }
    p.posicionarParaTeste(ANA, atacanteX, 2, atacanteX + 0.55, 2, 0);
    p.jogador(ANA)!.bloqueioAte = 0;
    rodar(p, 1.6);
    return golX(p) - p.jogador(GK_VIS)!.corpo.x;
  }

  it("sozinho com o atacante a uns 14 m, o goleiro sai da linha (bem mais que de costume), mas sem passar do limite da constante", () => {
    const sai = noUmContraUm(false, golX(criar()) - 14);
    expect(sai).toBeGreaterThan(2.8);
    expect(sai).toBeLessThanOrEqual(GOLEIRO.saida.adiantadoMaxM + 0.3);
  });

  it("com um zagueiro entre o atacante e o gol, o goleiro fica no lugar de sempre (não é 1 contra 1)", () => {
    const sozinho = noUmContraUm(false, golX(criar()) - 14);
    const comZagueiro = noUmContraUm(true, golX(criar()) - 14);
    expect(comZagueiro).toBeLessThan(sozinho - 0.8);
    expect(comZagueiro).toBeLessThanOrEqual(2.2);
  });

  it("atacante longe (mais de 20 m): sem saída especial; a velocidade do goleiro não mudou", () => {
    const longe = noUmContraUm(false, golX(criar()) - 26);
    expect(longe).toBeLessThanOrEqual(GOLEIRO.adiantadoMax + 0.2);
  });

  it("a saída torna a cavadinha viável nesses lances (o simulador de chutes escolhe cavadinha em parte deles)", () => {
    let cavadinhas = 0;
    let chutes = 0;
    for (const { x, z } of posicoesDeChute()) {
      if (Math.abs(z) > 4 || x < 14 || x > 22) continue; // de 8 a 16 m do gol, de frente
      for (let s = 0; s < 3; s++) {
        const c = simularChute(x, z, "auto", 100 + s * 37, { dificuldade: "medio", mira: "centro" });
        chutes++;
        if (c.tipo === "cavadinha") cavadinhas++;
      }
    }
    expect(chutes).toBeGreaterThan(5);
    expect(cavadinhas).toBeGreaterThan(0);
  });
});
