import { describe, expect, it } from "vitest";
import { BOT } from "../constantes";
import { CONFIG_PADRAO, type Config } from "../protocolo/config";
import { FASE, anguloParaByte, comandoParado, magParaByte } from "../protocolo/binario";
import { posicoesDeSaida } from "./bots";
import { Partida, type VagaPartida } from "./partida";

const humano = (slot: number, time: 0 | 1): VagaPartida => ({ slot, time, numero: 7 + (slot % 6), nome: `Humano${slot}`, humano: true, idControle: slot, goleiro: false });

function criar(config: Partial<Config> = {}, elenco: VagaPartida[] = [], semente = 1): Partida {
  return new Partida({ config: { ...CONFIG_PADRAO, modo: "campo", duracao: 8, ...config }, elenco, semente });
}

function rodar(p: Partida, s: number): void {
  for (let i = 0; i < Math.round(s * 60); i++) p.passo();
}

/** Joga a partida inteira (até o apito final) e devolve as estatísticas que importam para o "sentimento" dos bots. */
function jogarTudo(p: Partida): {
  eventos: Record<string, number>;
  mediaVelocidadeLinha: number;
  paresAmontoados: number;
  maiorReinicioS: number;
  ticks: number;
} {
  const eventos: Record<string, number> = {};
  const ultima = new Map<number, [number, number]>();
  let distancia = 0;
  let amostrasJogador = 0;
  let pares = 0;
  let perto = 0;
  let inicioReinicio = -1;
  let maiorReinicio = 0;

  while (!p.terminou && p.tick < 60 * 60 * 20) {
    p.passo();
    for (const e of p.eventosPendentes()) eventos[e.tipo] = (eventos[e.tipo] ?? 0) + 1;

    if (p.fase === FASE.reinicio && inicioReinicio < 0) inicioReinicio = p.t;
    if (p.fase !== FASE.reinicio && inicioReinicio >= 0) {
      maiorReinicio = Math.max(maiorReinicio, p.t - inicioReinicio);
      inicioReinicio = -1;
    }

    if (p.tick % 6 === 0 && p.fase === FASE.jogo) {
      for (const j of p.jogadores) {
        if (j.vaga.goleiro) continue;
        const u = ultima.get(j.vaga.slot);
        if (u) {
          distancia += Math.hypot(j.corpo.x - u[0], j.corpo.z - u[1]);
          amostrasJogador++;
        }
        ultima.set(j.vaga.slot, [j.corpo.x, j.corpo.z]);
      }
      for (const time of [0, 1] as const) {
        const l = p.jogadores.filter((j) => j.vaga.time === time && !j.vaga.goleiro);
        for (let a = 0; a < l.length; a++) {
          for (let b = a + 1; b < l.length; b++) {
            pares++;
            if (Math.hypot(l[a]!.corpo.x - l[b]!.corpo.x, l[a]!.corpo.z - l[b]!.corpo.z) < 2) perto++;
          }
        }
      }
    }
  }
  return {
    eventos,
    mediaVelocidadeLinha: distancia / (amostrasJogador * 0.1),
    paresAmontoados: perto / Math.max(1, pares),
    maiorReinicioS: maiorReinicio,
    ticks: p.tick,
  };
}

describe("elenco: bots completam as vagas", () => {
  it("sem humanos: 5 de linha + goleiro em cada time, 12 jogadores, tudo bot", () => {
    const p = criar();
    expect(p.elenco).toHaveLength(12);
    expect(p.elenco.filter((v) => v.goleiro).map((v) => v.slot)).toEqual([0, 6]);
    expect(p.elenco.every((v) => !v.humano)).toBe(true);
    expect(p.elenco.filter((v) => v.time === 0).map((v) => v.slot)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(p.elenco.filter((v) => v.time === 1).map((v) => v.slot)).toEqual([6, 7, 8, 9, 10, 11]);
  });

  it("os humanos ficam nas vagas deles e os bots completam o resto", () => {
    const p = criar({}, [humano(1, 0), humano(7, 1)]);
    expect(p.elenco).toHaveLength(12);
    expect(p.elenco.filter((v) => v.humano).map((v) => [v.slot, v.nome])).toEqual([[1, "Humano1"], [7, "Humano7"]]);
    expect(p.elenco.filter((v) => !v.humano && !v.goleiro)).toHaveLength(8);
  });

  it("N=3 e N=4 geram 8 e 10 jogadores", () => {
    expect(criar({ n: 3 }).elenco).toHaveLength(8);
    expect(criar({ n: 4 }).elenco).toHaveLength(10);
  });

  it("nomes fictícios sem repetir e número de camisa único por time; goleiro é o 1", () => {
    const p = criar({}, [humano(1, 0)]);
    const nomes = p.elenco.map((v) => v.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
    for (const time of [0, 1] as const) {
      const numeros = p.elenco.filter((v) => v.time === time).map((v) => v.numero);
      expect(new Set(numeros).size).toBe(numeros.length);
      expect(p.elenco.find((v) => v.time === time && v.goleiro)!.numero).toBe(1);
    }
    // Não são nomes de elenco real: vêm de dados/nomes-bots.json
    expect(p.elenco.filter((v) => !v.humano).every((v) => v.nome.length > 2)).toBe(true);
  });

  it("goleiros começam no gol e todos começam na própria metade", () => {
    for (const n of [3, 4, 5] as const) {
      const p = criar({ n });
      for (const j of p.jogadores) {
        if (j.vaga.time === 0) expect(j.corpo.x).toBeLessThan(0);
        else expect(j.corpo.x).toBeGreaterThan(0);
      }
      const g0 = p.jogador(0)!.corpo;
      expect(g0.x).toBeCloseTo(-(p.campo.metadeComp - 1.5), 5);
    }
  });
});

describe("formação por N (SPEC 6.8)", () => {
  it("cada N tem a formação certa: N=3 com 3 linhas, N=4 com dois zagueiros, N=5 com dois meios", () => {
    for (const n of [3, 4, 5] as const) {
      const p = criar({ n });
      const pos = posicoesDeSaida(p, 0);
      const linha = [...pos.entries()].filter(([slot]) => slot !== 0).map(([, q]) => q);
      expect(linha).toHaveLength(n);
      // Profundidades distintas: defesa, meio e ataque
      const profundidades = new Set(linha.map((q) => Math.round(q.x)));
      expect(profundidades.size).toBeGreaterThanOrEqual(n === 3 ? 3 : n === 4 ? 3 : 3);
    }
  });

  it("ninguém começa em cima de ninguém", () => {
    for (const n of [3, 4, 5] as const) {
      const p = criar({ n });
      const js = p.jogadores;
      for (let a = 0; a < js.length; a++) {
        for (let b = a + 1; b < js.length; b++) {
          expect(Math.hypot(js[a]!.corpo.x - js[b]!.corpo.x, js[a]!.corpo.z - js[b]!.corpo.z)).toBeGreaterThan(1.5);
        }
      }
    }
  });
});

describe("partida só de bots", () => {
  it("5x5 de 8 minutos, semente fixa: termina sem erro, rápido, com placar plausível e os bots jogando", () => {
    const p = criar({ n: 5, duracao: 8 }, [], 11);
    const inicio = Date.now();
    const e = jogarTudo(p);
    const ms = Date.now() - inicio;

    expect(p.terminou).toBe(true);
    expect(ms).toBeLessThan(5000); // meta da F3: partida de 8 min simulada em menos de 5 s
    expect(Number.isFinite(p.bola.x) && Number.isFinite(p.bola.z)).toBe(true);
    for (const j of p.jogadores) expect(Number.isFinite(j.corpo.x) && Number.isFinite(j.corpo.z)).toBe(true);

    const gols = p.placar[0] + p.placar[1];
    expect(gols).toBeGreaterThanOrEqual(1);
    expect(gols).toBeLessThanOrEqual(35);

    // Jogo vivo: passes, chutes, roubos de bola, laterais
    expect(e.eventos["passe"] ?? 0).toBeGreaterThan(20);
    expect(e.eventos["chute"] ?? 0).toBeGreaterThan(5);
    expect(e.eventos["roubo"] ?? 0).toBeGreaterThan(5);
    expect(e.eventos["lateral"] ?? 0).toBeGreaterThan(0);

    // Bots não ficam parados: andam em média mais de 1 m/s durante a bola rolando
    expect(e.mediaVelocidadeLinha).toBeGreaterThan(1);
    // Nem amontoados: companheiros a menos de 2 m um do outro em menos de 10% do tempo
    expect(e.paresAmontoados).toBeLessThan(0.1);
    // Nenhum reinício trava: todos saem em menos de 10 s
    expect(e.maiorReinicioS).toBeLessThan(10);
  });

  it("mesma semente dá o mesmo jogo; sementes diferentes dão jogos diferentes", () => {
    const a = criar({ duracao: 2 }, [], 5);
    const b = criar({ duracao: 2 }, [], 5);
    const c = criar({ duracao: 2 }, [], 6);
    jogarTudo(a);
    jogarTudo(b);
    jogarTudo(c);
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(a.placar).toEqual(b.placar);
    expect(a.snapshot()).not.toEqual(c.snapshot());
  });

  it("N=3 e N=4, Arena e as 3 dificuldades também jogam uma partida inteira sem travar", () => {
    const casos: Partial<Config>[] = [
      { n: 3, duracao: 2 },
      { n: 4, duracao: 2 },
      { n: 5, modo: "arena", duracao: 2 },
      { n: 5, dificuldade: "facil", duracao: 2 },
      { n: 5, dificuldade: "dificil", duracao: 2 },
      { n: 5, faltas: false, duracao: 2 },
    ];
    for (const c of casos) {
      const p = criar(c, [], 21);
      const e = jogarTudo(p);
      expect(p.terminou, JSON.stringify(c)).toBe(true);
      expect(e.maiorReinicioS, JSON.stringify(c)).toBeLessThan(10);
    }
  });

  it("no modo Arena não há lateral nem escanteio, mesmo só com bots", () => {
    const p = criar({ modo: "arena", duracao: 2 }, [], 9);
    const e = jogarTudo(p);
    expect(e.eventos["lateral"] ?? 0).toBe(0);
    expect(e.eventos["escanteio"] ?? 0).toBe(0);
    expect(e.eventos["tiroDeMeta"] ?? 0).toBe(0);
  });

  it("os bots de linha chegam a dar bote e carrinho não (só humanos fazem carrinho)", () => {
    const p = criar({ duracao: 4 }, [], 13);
    const e = jogarTudo(p);
    expect(e.eventos["roubo"] ?? 0).toBeGreaterThan(0);
    expect(p.resumo().destaques.desarmes).not.toBeNull();
  });

  it("as constantes da dificuldade dos bots (reação 0,35 / 0,22 / 0,12 s)", () => {
    expect(BOT.reacaoS).toEqual({ facil: 0.35, medio: 0.22, dificil: 0.12 });
    expect(BOT.erroGraus.facil).toBeGreaterThan(BOT.erroGraus.dificil);
    expect(BOT.chanceBote.facil).toBeLessThan(BOT.chanceBote.dificil);
  });
});

describe("humano e bot na mesma partida", () => {
  it("um humano que entra no meio assume o lugar de um bot do time", () => {
    const p = criar({ duracao: 4 }, [humano(1, 0)]);
    rodar(p, 10);
    const antes = p.elenco.filter((v) => v.humano).length;
    const vaga = p.promoverHumano(1, "Novato", 42);
    expect(vaga).not.toBeNull();
    expect(vaga).toMatchObject({ time: 1, humano: true, nome: "Novato", idControle: 42, goleiro: false });
    expect(p.elenco.filter((v) => v.humano)).toHaveLength(antes + 1);
    // Não pega o lugar do goleiro nem de outro humano
    expect(p.jogador(vaga!.slot)!.vaga.goleiro).toBe(false);
  });

  it("não há vaga quando o time só tem humanos", () => {
    const p = criar({ n: 3 }, [humano(7, 1), humano(8, 1), humano(9, 1)]);
    expect(p.promoverHumano(1, "Extra", 99)).toBeNull();
  });

  it("humano que cai (ausente) é jogado por um bot, e para quando ele volta", () => {
    const p = criar({ duracao: 4 }, [humano(1, 0)]);
    rodar(p, 7);
    expect(p.fase).toBe(FASE.jogo);
    const j = p.jogador(1)!;
    p.definirAusente(1, true);
    const x0 = j.corpo.x;
    let andou = 0;
    let ultimoX = x0;
    let ultimoZ = j.corpo.z;
    for (let i = 0; i < 60 * 20; i++) {
      p.passo();
      andou += Math.hypot(j.corpo.x - ultimoX, j.corpo.z - ultimoZ);
      ultimoX = j.corpo.x;
      ultimoZ = j.corpo.z;
    }
    expect(andou).toBeGreaterThan(20); // o bot mexeu o jogador

    p.definirAusente(1, false);
    j.cmd = { ...comandoParado(), ang: anguloParaByte(0), mag: 0 };
    rodar(p, 1);
    expect(Math.hypot(j.corpo.vx, j.corpo.vz)).toBeLessThan(0.5); // sem comando, o humano fica parado
  });

  it("o humano mexe o jogador dele pelo comando e os bots não mexem nele", () => {
    const p = criar({ duracao: 4 }, [humano(1, 0)]);
    rodar(p, 7);
    const j = p.jogador(1)!;
    p.definirComando(1, { ...comandoParado(), ang: anguloParaByte(Math.PI / 2), mag: magParaByte(1) }); // cima = -Z
    const z0 = j.corpo.z;
    rodar(p, 1);
    expect(j.corpo.z).toBeLessThan(z0 - 3);
  });

  it("liberar uma vaga transforma o humano em bot", () => {
    const p = criar({}, [humano(1, 0)]);
    p.liberarSlot(1);
    expect(p.jogador(1)!.vaga.humano).toBe(false);
    expect(p.jogador(1)!.vaga.idControle).toBeUndefined();
  });
});
