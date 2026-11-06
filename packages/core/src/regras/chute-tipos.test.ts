import { describe, expect, it } from "vitest";
import { BOLA, CHUTE, TIPO_CHUTE } from "../constantes";
import { novaBola, passoBola } from "../fisica/bola";
import { criarCampo } from "../fisica/campo";
import { criarRng } from "../util/rng";
import { analisarChute, calcularChuteComTipo, escolherTipoDeChute, resolverCavadinha, type SituacaoDeChute, type TipoDeChute } from "./chute-tipos";
import { CONFIG_PADRAO } from "../protocolo/config";
import { Partida } from "./partida";
import { posicoesDeChute, simularChute } from "./simulacao";

// H2: o tipo do chute (canudo, chapada, trivela, cavadinha) é escolhido pelo lance, e a bola curva pelo efeito (BOLA.giro).

const campo = criarCampo(5, "campo"); // 60 x 38 m, gol de 6 m: a Casa ataca X = +30
const L = campo.metadeComp;
const livre: SituacaoDeChute = { goleiro: { x: L - 0.5, z: 0 }, adversarioMaisPertoM: Infinity };
const adiantado = (m: number): SituacaoDeChute => ({ goleiro: { x: L - m, z: 0 }, adversarioMaisPertoM: Infinity });
const marcado: SituacaoDeChute = { goleiro: { x: L - 0.5, z: 0 }, adversarioMaisPertoM: 1.5 };

/** O tipo escolhido para um chute da Casa em (x, z) apontando para o centro do gol. */
function tipoEm(x: number, z: number, s: SituacaoDeChute, forca = 0.85, time: 0 | 1 = 0): TipoDeChute {
  const ataque = time === 0 ? 1 : -1;
  const px = time === 0 ? x : -x;
  const dx = (L - x) * ataque;
  const dz = -z;
  const n = Math.hypot(dx, dz);
  const sit: SituacaoDeChute = { ...s, goleiro: s.goleiro ? { x: s.goleiro.x * ataque, z: s.goleiro.z } : null };
  const r = calcularChuteComTipo({ forca, dirX: dx / n, dirZ: dz / n, px, pz: z, time, campo, arrancando: false, rng: criarRng(1), situacao: sit });
  return r.tipo;
}

describe("escolha do tipo de chute pelo lance (14 situações)", () => {
  it("1. perto do gol, ângulo aberto, goleiro na linha: canudo", () => expect(tipoEm(25, 0, livre)).toBe("canudo"));
  it("2. perto, aberto, com adversário em cima: canudo (chuta rápido)", () => expect(tipoEm(25, 0, marcado)).toBe("canudo"));
  it("3. goleiro muito fora do lugar (8 m da linha) e jogador livre, a 12 m: cavadinha", () => expect(tipoEm(18, 0, adiantado(8))).toBe("cavadinha"));
  it("4. goleiro adiantado mas com adversário em cima: não é cavadinha", () => {
    expect(tipoEm(18, 0, { goleiro: { x: L - 8, z: 0 }, adversarioMaisPertoM: 1.5 })).not.toBe("cavadinha");
  });
  it("5. goleiro no lugar (na linha), a 10 m: canudo, não cavadinha", () => expect(tipoEm(20, 0, livre)).toBe("canudo"));
  it("5b. goleiro um pouco adiantado (2 m, como no jogo): ainda canudo, a cavadinha não encobriria", () => expect(tipoEm(20, 0, adiantado(2))).toBe("canudo"));
  it("6. aberto, a 12 m, marcado: trivela contorna o marcador", () => expect(tipoEm(18, 0, marcado)).toBe("trivela"));
  it("7. aberto, a 12 m, sem marcação e goleiro na linha: canudo", () => expect(tipoEm(18, 0, livre)).toBe("canudo"));
  it("8. ângulo médio (a 15 m, de frente): trivela", () => expect(tipoEm(15, 0, livre)).toBe("trivela"));
  it("9. ângulo fechado perto (a 10,8 m, pela lateral): chapada", () => expect(tipoEm(26, 10, livre)).toBe("chapada"));
  it("10. quase fora de ângulo (colado na linha de fundo, pela lateral): chapada", () => expect(tipoEm(29, 12, livre)).toBe("chapada"));
  it("11. longe (28 m, de frente): chute reto de sempre (de longe a curva não compensa, medido no simulador)", () => expect(tipoEm(2, 0, livre)).toBe("normal"));
  it("12. longe demais (40 m): chute normal", () => expect(tipoEm(-10, 0, livre)).toBe("normal"));
  it("13. toque rápido (carga 0,15) perto do gol: continua o chute fraco de sempre", () => {
    expect(tipoEm(25, 0, livre, CHUTE.forcaToque)).toBe("normal");
    expect(tipoEm(18, 0, adiantado(8), 0.2)).toBe("normal");
  });
  it("14. de costas para o gol, ou apontando para o lado: chute normal", () => {
    const base = { campo, px: 25, pz: 0, time: 0 as const };
    expect(escolherTipoDeChute(analisarChute({ ...base, dirX: -1, dirZ: 0 }, livre))).toBe("normal");
    expect(escolherTipoDeChute(analisarChute({ ...base, dirX: 0, dirZ: 1 }, livre))).toBe("normal");
  });
  it("15. colado na linha de fundo, ou atrás dela: chute normal", () => expect(tipoEm(29.8, 3, livre)).toBe("normal"));
  it("16. cavadinha só com o gol de frente: com o ângulo muito fechado vira chapada", () => {
    expect(tipoEm(26, 12, adiantado(8))).toBe("chapada");
  });

  it("o Visitante (ataca X negativo) escolhe o mesmo tipo no lance espelhado", () => {
    const casos: Array<[number, number, SituacaoDeChute]> = [[25, 0, livre], [18, 0, adiantado(8)], [18, 0, marcado], [26, 10, livre], [2, 0, livre], [15, 0, livre]];
    for (const [x, z, s] of casos) expect(tipoEm(x, z, s, 0.85, 1), `x=${x} z=${z}`).toBe(tipoEm(x, z, s, 0.85, 0));
  });

  it("a análise: abertura do gol, distância e se está mirando no gol", () => {
    const a = analisarChute({ campo, px: 20, pz: 0, time: 0, dirX: 1, dirZ: 0 }, livre);
    expect(a.mirandoNoGol).toBe(true);
    expect(a.distancia).toBeCloseTo(10, 5);
    expect(a.abertura).toBeCloseTo((2 * Math.atan(3 / 10) * 180) / Math.PI, 3);
    expect(a.goleiroAdiantadoM).toBeCloseTo(0.5, 5);
  });
});

describe("efeito na bola (BOLA.giro)", () => {
  const voar = (giro: number, segundos: number, vx = 20): ReturnType<typeof novaBola> => {
    const b = novaBola();
    b.y = 3; // no ar
    b.vx = vx;
    b.vy = 0;
    b.giro = giro;
    const livreDeChao = { ...campo, paredes: false };
    for (let i = 0; i < segundos * 60; i++) {
      passoBola(b, livreDeChao, 1 / 60);
      b.y = Math.max(b.y, 3); // sem gravidade nem chão: só o efeito
      b.vy = 0;
    }
    return b;
  };

  it("sem giro a bola segue reta; com giro positivo o rumo vai de +X para +Z (a rapidez não muda por causa do giro)", () => {
    const reta = voar(0, 0.5);
    expect(reta.z).toBeCloseTo(0, 6);
    const curva = voar(0.8, 0.5);
    expect(curva.z).toBeGreaterThan(1);
    expect(voar(-0.8, 0.5).z).toBeLessThan(-1);
    // A mesma rapidez de uma bola sem giro (só o arrasto do ar age nas duas)
    expect(Math.hypot(curva.vx, curva.vz)).toBeCloseTo(Math.hypot(reta.vx, reta.vz), 1);
  });

  it("o giro decai no ar devagar e no chão depressa", () => {
    const ar = voar(1, 1);
    expect(ar.giro!).toBeCloseTo(Math.exp(-1 / BOLA.giroDecaimentoArS), 1);
    const chao = novaBola();
    chao.vx = 8;
    chao.giro = 1;
    for (let i = 0; i < 30; i++) passoBola(chao, campo, 1 / 60);
    expect(chao.giro ?? 0).toBeLessThan(0.3); // 0,5 s rolando: quase acabou
  });

  it("a rotação total acumulada bate com a fórmula ω·τ·(1 − e^(−T/τ))", () => {
    const b = voar(0.6, 0.8, 20);
    const rumo = Math.atan2(b.vz, b.vx);
    const esperado = 0.6 * BOLA.giroDecaimentoArS * (1 - Math.exp(-0.8 / BOLA.giroDecaimentoArS));
    expect(rumo).toBeCloseTo(esperado, 2);
  });

  it("bola sem o campo giro (como antes) se comporta igual a giro 0", () => {
    const a = novaBola();
    const b = novaBola();
    b.giro = 0;
    a.vx = b.vx = 15;
    a.vy = b.vy = 3;
    for (let i = 0; i < 120; i++) {
      passoBola(a, campo, 1 / 60);
      passoBola(b, campo, 1 / 60);
    }
    expect(a.x).toBe(b.x);
    expect(a.z).toBe(b.z);
  });
});

describe("a curva da chapada e da trivela", () => {
  /** Simula só a bola (sem goleiro) de um chute da Casa em (x, z) mirando no centro do gol com o tipo forçado. Devolve o Z em que cruza a linha. */
  function cruzamento(x: number, z: number, tipo: TipoDeChute): { zNaLinha: number | null; giro: number } {
    const dx = L - x;
    const dz = -z;
    const n = Math.hypot(dx, dz);
    const r = calcularChuteComTipo({ forca: 0.85, dirX: dx / n, dirZ: dz / n, px: x, pz: z, time: 0, campo, arrancando: false, rng: criarRng(3), situacao: livre, tipo });
    const b = novaBola(x + 0.55, z);
    b.vx = r.vx;
    b.vy = r.vy;
    b.vz = r.vz;
    b.giro = r.giro;
    const sem = { ...campo, paredes: false };
    for (let i = 0; i < 4 * 60; i++) {
      const antes = b.x;
      passoBola(b, sem, 1 / 60);
      if (antes < L && b.x >= L) return { zNaLinha: b.z, giro: r.giro };
    }
    return { zNaLinha: null, giro: r.giro };
  }

  it("a chapada pela lateral sai por fora e CURVA para dentro: cruza a linha entre as traves, onde o chute reto não entraria", () => {
    for (const z of [8, 10, 12]) {
      const x = 24;
      const c = cruzamento(x, z, "chapada");
      expect(c.zNaLinha, `z=${z}`).not.toBeNull();
      expect(Math.abs(c.zNaLinha!), `z=${z}: cruzou em ${c.zNaLinha}`).toBeLessThan(campo.golLarg / 2);
      expect(c.giro, "tem efeito").not.toBe(0);
    }
  });

  it("a trivela curva para o lado CONTRÁRIO ao da chapada (giros de sinais opostos no mesmo lance)", () => {
    const chapada = cruzamento(22, 6, "chapada");
    const trivela = cruzamento(22, 6, "trivela");
    expect(Math.sign(chapada.giro)).toBe(-Math.sign(trivela.giro));
    expect(trivela.zNaLinha).not.toBeNull();
    expect(Math.abs(trivela.zNaLinha!)).toBeLessThan(campo.golLarg / 2 + 0.5);
  });

  it("o lado do efeito é o espelho para o Visitante (que ataca X negativo)", () => {
    const casa = calcularChuteComTipo({ forca: 0.85, dirX: 1, dirZ: -0.3, px: 22, pz: 6, time: 0, campo, arrancando: false, rng: criarRng(3), situacao: livre, tipo: "chapada" });
    const vis = calcularChuteComTipo({ forca: 0.85, dirX: -1, dirZ: -0.3, px: -22, pz: 6, time: 1, campo, arrancando: false, rng: criarRng(3), situacao: livre, tipo: "chapada" });
    expect(vis.giro).toBeCloseTo(-casa.giro, 6);
    expect(vis.vz).toBeCloseTo(casa.vz, 6);
    expect(vis.vx).toBeCloseTo(-casa.vx, 6);
  });

  it("canudo é reto e forte (sem efeito, força mínima), e o chute normal continua reto como antes", () => {
    const c = calcularChuteComTipo({ forca: 0.5, dirX: 1, dirZ: 0, px: 25, pz: 0, time: 0, campo, arrancando: false, rng: criarRng(1), situacao: livre });
    expect(c.tipo).toBe("canudo");
    expect(c.giro).toBe(0);
    expect(c.forca).toBeGreaterThanOrEqual(TIPO_CHUTE.canudoForcaMin);
    expect(Math.hypot(c.vx, c.vz)).toBeGreaterThan(CHUTE.velocidadeBase + CHUTE.velocidadeExtra * TIPO_CHUTE.canudoForcaMin - 0.5);
    const n = calcularChuteComTipo({ forca: 0.5, dirX: 0, dirZ: 1, px: 25, pz: 0, time: 0, campo, arrancando: false, rng: criarRng(1), situacao: livre });
    expect(n.tipo).toBe("normal");
    expect(n.giro).toBe(0);
  });
});

describe("cavadinha: encobre o goleiro adiantado", () => {
  it("só há trajetória com o goleiro MUITO fora do lugar (8 m da linha): ele recua a 2 a 4 m/s, então nas posições normais (até uns 3 m) a bola nunca encobre e ainda entra", () => {
    for (const d of [12, 14, 16]) expect(resolverCavadinha(d, 8), `d=${d}`).not.toBeNull();
    for (const a of [0.8, 1.5, 2.2, 3, 5]) expect(resolverCavadinha(12, a), `goleiro a ${a} m`).toBeNull();
    expect(resolverCavadinha(3, 8), "perto demais").toBeNull();
  });

  it("de verdade (física completa): a bola passa por cima do goleiro (acima do alcance dele) e entra no gol", () => {
    for (const recuo of [12, 14]) {
      const p = new Partida({
        config: { ...CONFIG_PADRAO, modo: "campo", n: 5, duracao: 4 },
        elenco: [
          { slot: 1, time: 0, numero: 7, nome: "A", humano: true, idControle: 1, goleiro: false },
          { slot: 6, time: 1, numero: 1, nome: "G", humano: false, goleiro: true },
        ],
        semente: 5,
        semBots: true,
      });
      const j = p.jogador(1)!;
      const gk = p.jogador(6)!;
      const x = L - recuo;
      p.posicionarParaTeste(1, x, 0, x + 0.55, 0, 0);
      for (let i = 0; i < 60; i++) p.passo();
      gk.corpo.x = L - 8; // goleiro muito fora do lugar
      gk.corpo.z = 0;
      const tipo = p.chutarComTipo(j, 0.85, 1, 0);
      expect(tipo, `recuo ${recuo}`).toBe("cavadinha");
      let alturaNoGoleiro = -1;
      for (let i = 0; i < 4 * 60 && p.placar[0] === 0; i++) {
        p.passo();
        if (alturaNoGoleiro < 0 && p.bola.x >= gk.corpo.x - 0.05) alturaNoGoleiro = p.bola.y;
      }
      expect(alturaNoGoleiro, `recuo ${recuo}: altura sobre o goleiro`).toBeGreaterThan(2.0);
      expect(p.placar[0], `recuo ${recuo}: gol`).toBe(1);
    }
  });

  it("é um chute leve: bem mais lento que o canudo", () => {
    const c = calcularChuteComTipo({ forca: 0.85, dirX: 1, dirZ: 0, px: 18, pz: 0, time: 0, campo, arrancando: false, rng: criarRng(1), situacao: adiantado(8) });
    expect(c.tipo).toBe("cavadinha");
    expect(Math.hypot(c.vx, c.vz)).toBeLessThan(CHUTE.velocidadeBase + 0.2 * CHUTE.velocidadeExtra + 1);
    expect(c.vy).toBeGreaterThan(5);
  });
});

describe("o evento do chute diz o tipo (para o telão)", () => {
  it("o humano que chuta de chapada gera um evento chute com tipoDeChute; o toque fraco, não", () => {
    const p = new Partida({
      config: { ...CONFIG_PADRAO, modo: "campo", n: 5, duracao: 4 },
      elenco: [
        { slot: 1, time: 0, numero: 7, nome: "A", humano: true, idControle: 1, goleiro: false },
        { slot: 6, time: 1, numero: 1, nome: "G", humano: false, goleiro: true },
      ],
      semente: 5,
      semBots: true,
    });
    const j = p.jogador(1)!;
    p.posicionarParaTeste(1, 26, 10, 26.55, 10, 0);
    for (let i = 0; i < 10; i++) p.passo();
    p.eventosPendentes();
    const dx = L - 26;
    const dz = -10;
    const n = Math.hypot(dx, dz);
    p.chutarComTipo(j, 0.85, dx / n, dz / n);
    const ev = p.eventosPendentes().find((e) => e.tipo === "chute");
    expect(ev).toMatchObject({ dados: { slot: 1, tipoDeChute: "chapada" } });
    p.posicionarParaTeste(1, 26, 10, 26.55, 10, 0);
    for (let i = 0; i < 10; i++) p.passo();
    p.eventosPendentes();
    p.chutarComTipo(j, 0.15, dx / n, dz / n);
    const fraco = p.eventosPendentes().find((e) => e.tipo === "chute");
    expect(fraco).toBeDefined();
    expect((fraco as { dados: { tipoDeChute?: string } }).dados.tipoDeChute).toBeUndefined();
  });
});

describe("taxa de gol por tipo (simulador): o automático ajuda e nenhum tipo é forte demais", () => {
  const posicoes = posicoesDeChute();
  const rodar = (pedido: TipoDeChute | "auto", mira: "canto" | "centro") => {
    const r = [];
    for (const { x, z } of posicoes) for (let s = 0; s < 6; s++) r.push(simularChute(x, z, pedido, 100 + s * 37, { mira }));
    return r;
  };
  const taxa = (l: Array<{ gol: boolean }>): number => l.filter((c) => c.gol).length / Math.max(1, l.length);

  it("o chute automático rende pelo menos o que o chute reto de antes (nos dois tipos de jogador) e nenhum tipo passa de 80% no geral", () => {
    for (const mira of ["canto", "centro"] as const) {
      const auto = rodar("auto", mira);
      const normal = rodar("normal", mira);
      expect(taxa(auto), `mira ${mira}`).toBeGreaterThanOrEqual(taxa(normal) - 0.02); // a amostra é pequena: tolera 2 pontos
      for (const tipo of ["canudo", "chapada", "trivela"] as const) {
        expect(taxa(rodar(tipo, mira)), `${tipo} (${mira})`).toBeLessThan(0.8);
      }
    }
  });

  it("onde a chapada é escolhida (ângulo fechado perto), ela rende mais que o chute reto", () => {
    const tight = posicoes.filter((q) => q.x >= L - 20 && Math.abs(q.z) >= 7);
    const dos = (pedido: TipoDeChute | "auto") => {
      const l = [];
      for (const { x, z } of tight) for (let s = 0; s < 3; s++) l.push(simularChute(x, z, pedido, 100 + s * 37, { mira: "canto" }));
      return l.filter((c) => c.abertura < TIPO_CHUTE.anguloFechadoGraus);
    };
    expect(taxa(dos("chapada"))).toBeGreaterThan(taxa(dos("normal")));
  });
});
