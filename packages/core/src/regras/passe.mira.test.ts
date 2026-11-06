import { describe, expect, it } from "vitest";
import { PASSE } from "../constantes";
import { criarCampo } from "../fisica/campo";
import { novaBola, passoBola } from "../fisica/bola";
import { calcularPasseAssistido, escolherAlvoDoPasse, tempoDeVoo, type Alvo, type EntradaPasse } from "./acoes";

// H1/H3: passe com ajuda de mira. Escolhe o companheiro mais alinhado (ou, sem joystick, o mais à frente e livre) e mira onde ele
// VAI ESTAR quando a bola chegar; a ajuda é a mesma em todas as dificuldades.

const DT = 1 / 60;
const campo = criarCampo(5, "campo");

/** Solta a bola do ponto `de` com a velocidade do passe e devolve o quanto ela chega perto do companheiro que anda em linha reta. */
function simular(entrada: EntradaPasse, alvo: Alvo): { menorDistancia: number; tempoAteLa: number } {
  const v = calcularPasseAssistido(entrada);
  const b = novaBola();
  b.x = entrada.de.x;
  b.y = 0.11;
  b.z = entrada.de.z;
  b.vx = v.vx;
  b.vy = v.vy;
  b.vz = v.vz;
  let menor = Infinity;
  let quando = 0;
  for (let i = 0; i < 6 * 60; i++) {
    passoBola(b, campo, DT);
    const t = (i + 1) * DT;
    const d = Math.hypot(b.x - (alvo.x + alvo.vx * t), b.z - (alvo.z + alvo.vz * t));
    if (d < menor) {
      menor = d;
      quando = t;
    }
  }
  return { menorDistancia: menor, tempoAteLa: quando };
}

const base = (alvo: Alvo, extra: Partial<EntradaPasse> = {}): EntradaPasse => ({
  de: { x: 0, z: 0 },
  dirX: 1,
  dirZ: 0,
  companheiros: [alvo],
  adversarios: [],
  alto: false,
  ataque: 1,
  campo,
  ...extra,
});

describe("tempo de voo da bola rasteira", () => {
  it("bate com a física de verdade (atrito e arrasto): erro abaixo de 3% de 5 a 25 m, de 8 a 16 m/s", () => {
    for (const v0 of [8, 12, 16]) {
      for (const d of [5, 10, 15, 20, 25]) {
        // Só vale se a bola chega: com 8 m/s a bola para antes de 25 m
        const b = novaBola();
        b.y = 0.11;
        b.vx = v0;
        let t = 0;
        let chegou = false;
        for (let i = 0; i < 8 * 60 && !chegou; i++) {
          passoBola(b, campo, DT);
          t += DT;
          if (b.x >= d) chegou = true;
        }
        if (!chegou) continue;
        const estimado = tempoDeVoo(d, v0);
        expect(Math.abs(estimado - t) / t, `v0=${v0} d=${d}: estimado ${estimado.toFixed(2)} real ${t.toFixed(2)}`).toBeLessThan(0.03);
      }
    }
  });

  it("quando a bola para antes de chegar, devolve o tempo até parar (e não um número impossível)", () => {
    const t = tempoDeVoo(100, 8);
    expect(Number.isFinite(t)).toBe(true);
    expect(t).toBeLessThan(10);
    expect(t).toBeGreaterThan(2); // 8 m/s a 1,6 m/s² de atrito: segundos, não décimos
  });

  it("é crescente com a distância e decrescente com a velocidade", () => {
    expect(tempoDeVoo(20, 12)).toBeGreaterThan(tempoDeVoo(10, 12));
    expect(tempoDeVoo(15, 8)).toBeGreaterThan(tempoDeVoo(15, 16));
  });
});

describe("passe: mira para onde o companheiro vai estar", () => {
  it("companheiro correndo de lado: a bola mirada com força 1 passa a menos de 1 m dele; mirar onde ele está (força 0) erra por mais de 2 m", () => {
    for (const vz of [-6, -4, 4, 6]) {
      const alvo: Alvo = { slot: 2, x: 12, z: -vz, vx: 0, vz };
      const com = simular(base(alvo, { forcaDaAjuda: 1 }), alvo);
      const sem = simular(base(alvo, { forcaDaAjuda: 0, dirX: Math.hypot(12, -vz) ? 12 / Math.hypot(12, vz) : 1, dirZ: -vz / Math.hypot(12, vz) }), alvo);
      expect(com.menorDistancia, `vz=${vz} com ajuda`).toBeLessThan(1);
      expect(sem.menorDistancia, `vz=${vz} sem ajuda`).toBeGreaterThan(2);
    }
  });

  it("companheiro correndo para longe ou vindo na direção do passador também é alcançado", () => {
    for (const vx of [-4, 5.5]) {
      const alvo: Alvo = { slot: 2, x: 14, z: 3, vx, vz: 0 };
      const r = simular(base(alvo, { dirX: Math.cos(Math.atan2(3, 14)), dirZ: Math.sin(Math.atan2(3, 14)) }), alvo);
      expect(r.menorDistancia, `vx=${vx}`).toBeLessThan(1.2);
    }
  });

  it("a mira não sai das linhas do campo", () => {
    // O companheiro corre para fora pela lateral: o ponto de encontro fica dentro do campo
    const alvo: Alvo = { slot: 2, x: 10, z: campo.metadeLarg - 1, vx: 0, vz: 8 };
    const v = calcularPasseAssistido(base(alvo, { dirX: 0.8, dirZ: 0.6 }));
    const alcance = (v.vz / Math.hypot(v.vx, v.vz)) * Math.hypot(10, campo.metadeLarg - 1); // para onde aponta, à distância do alvo
    expect(alcance).toBeLessThan(campo.metadeLarg + 2);
    const aponta = Math.atan2(v.vz, v.vx);
    const emZ = Math.sin(aponta) * 40;
    expect(emZ).toBeLessThan(40); // sanidade
  });
});

describe("passe: a mesma ajuda em todas as dificuldades (H3)", () => {
  it("existe um conjunto único de ajuda (sem 'facil', 'medio' e 'dificil') e ele mira em cheio", () => {
    expect(PASSE.ajuda.forca).toBe(1);
    expect(PASSE.ajuda.coneGraus).toBeGreaterThanOrEqual(60);
    expect("facil" in PASSE.ajuda).toBe(false);
  });

  it("o joystick 20° torto para fora do companheiro parado a 14 m: a bola vai em cheio nele (menos de 0,5 m)", () => {
    const alvo: Alvo = { slot: 2, x: 14, z: 0, vx: 0, vz: 0 };
    const a = (20 * Math.PI) / 180;
    const e = base(alvo, { dirX: Math.cos(a), dirZ: Math.sin(a), coneGraus: PASSE.ajuda.coneGraus, forcaDaAjuda: PASSE.ajuda.forca });
    expect(simular(e, alvo).menorDistancia).toBeLessThan(0.5);
  });

  it("o cone de busca é um só: um companheiro a 30° do joystick é escolhido, um a 70° (fora do cone) só pelo 'mais perto da direção'", () => {
    const pos = (graus: number): Alvo => ({ slot: 2, x: Math.cos((graus * Math.PI) / 180) * 12, z: Math.sin((graus * Math.PI) / 180) * 12, vx: 0, vz: 0 });
    expect(escolherAlvoDoPasse(base(pos(30), { coneGraus: PASSE.ajuda.coneGraus }))?.slot).toBe(2);
    expect(escolherAlvoDoPasse(base(pos(70), { coneGraus: PASSE.ajuda.coneGraus }))).toBeNull();
    expect(escolherAlvoDoPasse(base(pos(70), { coneGraus: PASSE.ajuda.coneGraus, maisProximoDaDirecao: true }))?.slot).toBe(2);
  });

  it("sem ninguém no cone, vai para o mais perto da direção do joystick (e não para o mais bem posicionado)", () => {
    // Joystick para +Z; um companheiro a 100° (perto da direção) e outro a 170° (de costas); o de 100° ganha
    const pos = (slot: number, graus: number): Alvo => ({ slot, x: Math.cos((graus * Math.PI) / 180) * 12, z: Math.sin((graus * Math.PI) / 180) * 12, vx: 0, vz: 0 });
    const e = base(pos(2, 170), { dirX: 0, dirZ: 1, coneGraus: PASSE.ajuda.coneGraus, maisProximoDaDirecao: true, companheiros: [pos(2, 170), pos(3, 100)] });
    expect(escolherAlvoDoPasse(e)?.slot).toBe(3);
  });

  it("o passe é bem mais rápido que o da H1 (6 + 0,9·d, de 8 a 16 m/s): em 15 m sai a mais de 22 m/s ou no teto, e chega mais depressa", () => {
    const velAntes = (d: number): number => Math.min(16, Math.max(8, 6 + 0.9 * d));
    for (const d of [8, 12, 18, 25]) {
      const agora = Math.min(PASSE.velocidadeMax, Math.max(PASSE.velocidadeMin, PASSE.velocidadeBase + PASSE.velocidadePorMetro * d));
      expect(agora, `d=${d}`).toBeGreaterThan(velAntes(d) * 1.25);
      expect(tempoDeVoo(d, agora, PASSE.desaceleracaoFator), `d=${d}`).toBeLessThan(tempoDeVoo(d, velAntes(d)) * 0.8);
    }
  });
});

describe("passe sem joystick: o mais à frente e livre", () => {
  const de = { x: 0, z: 0 };
  const parado = (slot: number, x: number, z: number): Alvo => ({ slot, x, z, vx: 0, vz: 0 });

  it("prefere o companheiro à frente ao que está atrás, mesmo com o jogador olhando para outro lado", () => {
    const e: EntradaPasse = { ...base(parado(2, -12, 0)), de, dirX: -1, dirZ: 0, semDirecao: true, companheiros: [parado(2, -12, 0), parado(3, 14, 4)] };
    expect(escolherAlvoDoPasse(e)?.slot).toBe(3);
  });

  it("entre dois à frente, prefere o que tem a linha livre de adversários", () => {
    const livre = parado(3, 14, -6);
    const marcado = parado(4, 16, 6);
    const e: EntradaPasse = { ...base(livre), de, semDirecao: true, companheiros: [marcado, livre], adversarios: [{ x: 8, z: 3.2 }] };
    expect(escolherAlvoDoPasse(e)?.slot).toBe(3);
  });

  it("para o Visitante (ataca para X negativo), 'à frente' é para X negativo", () => {
    const e: EntradaPasse = { ...base(parado(2, 0, 0)), de, ataque: -1, semDirecao: true, companheiros: [parado(2, 12, 0), parado(3, -12, 2)] };
    expect(escolherAlvoDoPasse(e)?.slot).toBe(3);
  });

  it("com o joystick apontado, vale o mais alinhado com ele (e não o mais à frente)", () => {
    const e: EntradaPasse = { ...base(parado(2, 0, 12)), de, dirX: 0, dirZ: 1, semDirecao: false, companheiros: [parado(2, 0, 12), parado(3, 16, 0)], coneGraus: 60 };
    expect(escolherAlvoDoPasse(e)?.slot).toBe(2);
  });

  it("ninguém à vista (todos a menos de 2 m): sem alvo", () => {
    const e: EntradaPasse = { ...base(parado(2, 1, 0)), de, semDirecao: true };
    expect(escolherAlvoDoPasse(e)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Na partida de verdade: o humano passa, o companheiro corre de lado e a bola o encontra
// ---------------------------------------------------------------------------

import { ACAO, BOTAO, FASE, anguloParaByte, comandoParado, magParaByte, type Comando } from "../protocolo/binario";
import { CONFIG_PADRAO } from "../protocolo/config";
import { Partida } from "./partida";

const joy = (alvoX: number, alvoZ: number, deX: number, deZ: number, extra: Partial<Comando> = {}): Comando => ({
  ...comandoParado(),
  ang: anguloParaByte(Math.atan2(-(alvoZ - deZ), alvoX - deX)), // cima do celular = -Z (PROTOCOLO 4)
  mag: magParaByte(1),
  ...extra,
});

function partidaDePasse(dificuldade: "facil" | "medio" | "dificil"): Partida {
  const p = new Partida({
    config: { ...CONFIG_PADRAO, modo: "arena", duracao: 4, dificuldade },
    elenco: [
      { slot: 1, time: 0, numero: 7, nome: "Ana", humano: true, idControle: 1, goleiro: false },
      { slot: 2, time: 0, numero: 8, nome: "Bia", humano: true, idControle: 2, goleiro: false },
    ],
    semente: 9,
    semBots: true,
  });
  for (let i = 0; i < 400 && p.fase !== FASE.jogo; i++) p.passo();
  p.posicionarParaTeste(1, 0, 0, 0.55, 0, 0);
  const bia = p.jogador(2)!;
  bia.corpo.x = 14;
  bia.corpo.z = -6;
  return p;
}

/** Ana passa (toque no PASSE) mirando onde a Bia está; a Bia corre para +Z o tempo todo. */
function passar(p: Partida, comJoystick = true): { para: number | undefined; dominou: boolean } {
  const ana = p.jogador(1)!;
  const bia = p.jogador(2)!;
  // A Bia pega velocidade antes do passe
  for (let i = 0; i < 40; i++) {
    p.definirComando(2, { ...comandoParado(), ang: anguloParaByte(-Math.PI / 2), mag: magParaByte(1) });
    p.passo();
  }
  p.posicionarParaTeste(1, 0, 0, 0.55, 0, 0);
  p.passo();
  p.passo();
  const pos = { x: bia.corpo.x, z: bia.corpo.z };
  const dir = comJoystick ? joy(pos.x, pos.z, ana.corpo.x, ana.corpo.z) : comandoParado();
  p.eventosPendentes();
  p.definirComando(1, { ...dir, seguros: BOTAO.passe });
  for (let i = 0; i < 3; i++) p.passo();
  p.definirComando(1, { ...dir, seguros: 0, acao: ACAO.passeToque, acaoSeq: 1 });
  p.passo();
  const ev = p.eventosPendentes().find((e) => e.tipo === "passe");
  let dominou = false;
  for (let i = 0; i < 3 * 60 && !dominou; i++) {
    p.definirComando(2, { ...comandoParado(), ang: anguloParaByte(-Math.PI / 2), mag: magParaByte(1) });
    p.passo();
    if (p.dominante === 2) dominou = true;
  }
  return { para: ev && ev.tipo === "passe" ? ev.dados.para : undefined, dominou };
}

describe("passe na partida: mira à frente de um companheiro em movimento", () => {
  it("em todas as dificuldades: o passe mirado onde a Bia está chega a ela correndo de lado, e ela domina a bola (recepção)", () => {
    for (const dif of ["facil", "medio", "dificil"] as const) {
      const r = passar(partidaDePasse(dif));
      expect(r.para, dif).toBe(2);
      expect(r.dominou, dif).toBe(true);
    }
  });

  it("sem joystick o jogo escolhe o companheiro à frente e manda a bola para ele", () => {
    const r = passar(partidaDePasse("facil"), false);
    expect(r.para).toBe(2);
    expect(r.dominou).toBe(true);
  });

  it("alvoDaMira diz quem receberia o passe agora (e muda quando o joystick muda)", () => {
    const p = partidaDePasse("medio");
    const ana = p.jogador(1)!;
    ana.cmd = joy(14, -6, 0, 0);
    expect(p.alvoDaMira(ana, false)).toBe(2);
    // Joystick para trás (a Bia está à frente): fora do cone, mas o passe do humano vai para o mais perto da direção (H3)
    ana.cmd = joy(-14, 0, 0, 0);
    expect(p.alvoDaMira(ana, false)).toBe(2);
    // Joystick solto: o mais à frente
    ana.cmd = comandoParado();
    expect(p.alvoDaMira(ana, false)).toBe(2);
  });
});
