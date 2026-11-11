import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ANIM, ANIMACAO, JOGADOR, RECEPCAO_PASSE, TEMPO } from "@b3d/core";
import {
  ALTURA_DA_DEFESA_ALTA_M,
  ATRASO_DO_CONTATO_S,
  CLIPES_COM_LOOP,
  CONTATO_DO_CHUTE_S,
  CONTATO_DO_DOMINIO_PUXAR_S,
  CONTATO_DO_DOMINIO_S,
  CONTATO_DO_PASSE_S,
  CROSSFADE_DA_JOGADA_S,
  CROSSFADE_S,
  ControladorDeRosto,
  ESCALA_DO_DOMINIO,
  ESCALA_DO_DOMINIO_PUXAR,
  ESCALA_DO_PASSE,
  LATERAL_DO_DOMINIO_PUXAR_M,
  ESCALA_MAX_DA_CORRIDA,
  ESCALA_MIN_DA_CORRIDA,
  TODOS_OS_CLIPES,
  VELOCIDADE_DA_CORRIDA_GRAVADA,
  decidir,
  expressaoDoEstado,
  pePorLado,
  velocidadeDaCorrida,
  type ContextoDaAnimacao,
} from "./animacoes-boneco";
import { EXPRESSAO } from "./boneco-dados";

const TABELA = JSON.parse(readFileSync(new URL("../../public/boneco/animacoes.json", import.meta.url), "utf8")) as Record<string, { quadros: number; fps: number; loop: boolean }>;
// Duração de cada clipe como no .glb: (quadros - 1) / fps, porque `quadros` conta o quadro 0 e o último (boneco.test.ts confere isso com o glb)
const DURACOES = new Map(Object.entries(TABELA).map(([nome, i]) => [nome, (i.quadros - 1) / i.fps]));

const LINHA: ContextoDaAnimacao = { goleiro: false, x: 0, z: 0, dir: 0, vel: 0 };
const GOLEIRO: ContextoDaAnimacao = { ...LINHA, goleiro: true };
const nome = (anim: number, ctx = LINHA): string | undefined => decidir(anim, ctx, DURACOES)?.clipe;

describe("animacoes.json", () => {
  it("tem exatamente os 15 clipes do boneco, a 30 fps, e os loops são parado, correr e gk_parado", () => {
    expect(Object.keys(TABELA).sort()).toEqual([...TODOS_OS_CLIPES].sort());
    for (const i of Object.values(TABELA)) expect(i.fps).toBe(30);
    expect(new Set(Object.entries(TABELA).filter(([, i]) => i.loop).map(([n]) => n))).toEqual(CLIPES_COM_LOOP);
  });
});

describe("decidir: um clipe para cada estado do jogo", () => {
  it("jogador de linha: parado, corrida, chute, comemoração", () => {
    expect(nome(ANIM.parado)).toBe("parado");
    expect(nome(ANIM.corrida, { ...LINHA, vel: 5 })).toBe("correr");
    expect(nome(ANIM.chute)).toBe("chutar");
    expect(nome(ANIM.comemoracao)).toBe("comemorar");
  });

  it("goleiro: parado e com a bola ficam agachados em gk_parado", () => {
    expect(nome(ANIM.goleiroParado, GOLEIRO)).toBe("gk_parado");
    expect(nome(ANIM.goleiroComBola, GOLEIRO)).toBe("gk_parado");
    expect(nome(ANIM.parado, GOLEIRO)).toBe("gk_parado");
  });

  it("os estados sem animação própria usam a reserva e dizem isso (propria = false)", () => {
    const semClipe = [ANIM.carrinho, ANIM.queda, ANIM.cabeceio, ANIM.cobranca];
    for (const anim of semClipe) {
      const d = decidir(anim, LINHA, DURACOES)!;
      expect(d, `anim ${anim}`).toMatchObject({ clipe: "parado", propria: false });
      expect(decidir(anim, GOLEIRO, DURACOES)).toMatchObject({ clipe: "gk_parado", propria: false });
    }
    expect(decidir(ANIM.goleiroComBola, GOLEIRO, DURACOES)).toMatchObject({ clipe: "gk_parado", propria: false });
    // O goleiro não tem clipe de recepção: fica agachado
    expect(decidir(ANIM.recepcao, GOLEIRO, DURACOES)).toMatchObject({ clipe: "gk_parado", propria: false });
  });

  it("todo estado do protocolo recebe algum clipe que existe", () => {
    for (const anim of Object.values(ANIM)) {
      for (const ctx of [LINHA, GOLEIRO]) {
        const d = decidir(anim, ctx, DURACOES);
        expect(d, `anim ${anim}`).not.toBeNull();
        expect(DURACOES.has(d!.clipe), d!.clipe).toBe(true);
      }
    }
  });

  it("sem o clipe de repouso não há o que tocar", () => {
    expect(decidir(ANIM.parado, LINHA, new Map([["correr", 0.5]]))).toBeNull();
  });

  it("sem um clipe, cai no repouso em vez de quebrar", () => {
    const so = new Map([["parado", 1.6]]);
    expect(decidir(ANIM.corrida, { ...LINHA, vel: 5 }, so)?.clipe).toBe("parado");
    expect(decidir(ANIM.chute, LINHA, so)?.clipe).toBe("parado");
    expect(decidir(ANIM.comemoracao, LINHA, so)?.clipe).toBe("parado");
  });

  it("só parado, correr e gk_parado repetem; o resto toca uma vez", () => {
    expect(decidir(ANIM.parado, LINHA, DURACOES)?.repete).toBe(true);
    expect(decidir(ANIM.corrida, { ...LINHA, vel: 5 }, DURACOES)?.repete).toBe(true);
    expect(decidir(ANIM.goleiroParado, GOLEIRO, DURACOES)?.repete).toBe(true);
    for (const anim of [ANIM.chute, ANIM.comemoracao, ANIM.goleiroMergulhoEsq]) expect(decidir(anim, GOLEIRO, DURACOES)?.repete, `anim ${anim}`).toBe(false);
  });
});

describe("passe", () => {
  /** A bola sai com a velocidade (vx, vz); de frente para +X a esquerda do jogador é o lado -Z. */
  const passe = (vx: number, vz: number, duracoes = DURACOES, ctx = LINHA) => decidir(ANIM.passe, { ...ctx, bola: { x: 0.5, y: 0.1, z: 0, vx, vz } }, duracoes)!;

  it("usa o clipe de passe, com o pé do lado para onde a bola sai", () => {
    expect(passe(15, 0)).toMatchObject({ clipe: "passar", propria: true });
    expect(passe(15, 8).clipe).toBe("passar"); // para a direita
    expect(passe(15, -8).clipe).toBe("passar_esq"); // para a esquerda
    expect(passe(15, -3).clipe).toBe("passar"); // quase reto: pé direito
  });

  it("vale para qualquer direção do corpo (virado para +Z, a esquerda é +X)", () => {
    const virado = { ...LINHA, dir: Math.PI / 2 };
    expect(passe(8, 15, DURACOES, virado).clipe).toBe("passar_esq");
    expect(passe(-8, 15, DURACOES, virado).clipe).toBe("passar");
  });

  it("sem a velocidade da bola usa o pé direito", () => {
    expect(decidir(ANIM.passe, { ...LINHA, bola: { x: 0.5, y: 0.1, z: -1 } }, DURACOES)?.clipe).toBe("passar");
    expect(decidir(ANIM.passe, LINHA, DURACOES)?.clipe).toBe("passar");
  });

  it("o clipe começa no quadro 0, a ×1,2, com troca curta, e o toque da bola aparece a 0,056 s do começo do estado (a bola sai no instante 0)", () => {
    for (const d of [passe(15, 0), passe(15, -8)]) {
      expect(d).toMatchObject({ inicioS: 0, velocidade: ESCALA_DO_PASSE, crossfadeS: CROSSFADE_DA_JOGADA_S });
      expect(CONTATO_DO_PASSE_S / d.velocidade).toBeCloseTo(2 / 30 / 1.2, 10); // 0,0556 s
      expect(CONTATO_DO_PASSE_S / d.velocidade).toBeLessThanOrEqual(CROSSFADE_DA_JOGADA_S + 0.01); // o pé já está no clipe quando toca
    }
    expect(ESCALA_DO_PASSE).toBe(1.2);
  });

  it("o gesto inteiro (0,306 s) acaba no máximo um intervalo de snapshot depois do fim do estado de passe (0,3 s)", () => {
    const d = passe(15, 0);
    expect(DURACOES.get("passar")! / d.velocidade).toBeLessThanOrEqual(ANIMACAO.passeS + 1 / TEMPO.snapHz);
  });

  it("com o modelo antigo (sem os clipes de passe) usa o gesto do chute e diz que não é próprio", () => {
    const antigo = new Map([...DURACOES].filter(([n]) => !n.startsWith("passar") && !n.startsWith("dominio")));
    expect(passe(15, 0, antigo)).toMatchObject({ clipe: "chutar", propria: false });
    expect(passe(15, -8, antigo)).toMatchObject({ clipe: "chutar", propria: false }); // sem a bola ao lado, pé direito
  });
});

describe("recepção (domínio)", () => {
  /** A bola está `lateral` m para a esquerda do corpo (de frente para +X, a esquerda é -Z) e 1 m à frente. */
  const recebe = (lateral: number, duracoes = DURACOES, ctx = LINHA) => decidir(ANIM.recepcao, { ...ctx, bola: { x: 1, y: 0.3, z: -lateral } }, duracoes)!;

  it("bola de frente: só amortece (dominio); o pé é o do lado da bola", () => {
    expect(recebe(0)).toMatchObject({ clipe: "dominio", propria: true });
    expect(recebe(-0.3).clipe).toBe("dominio");
    expect(recebe(0.3).clipe).toBe("dominio_esq");
  });

  it("bola ao lado do corpo: o pé estica e puxa (dominio_puxar), com o pé daquele lado", () => {
    expect(recebe(LATERAL_DO_DOMINIO_PUXAR_M + 0.3).clipe).toBe("dominio_puxar_esq");
    expect(recebe(-(LATERAL_DO_DOMINIO_PUXAR_M + 0.3)).clipe).toBe("dominio_puxar");
    expect(recebe(LATERAL_DO_DOMINIO_PUXAR_M - 0.05).clipe).toBe("dominio_esq"); // logo abaixo do limite
  });

  it("sem saber onde está a bola, amortece com o pé direito", () => {
    expect(decidir(ANIM.recepcao, LINHA, DURACOES)).toMatchObject({ clipe: "dominio", propria: true });
  });

  it("os clipes começam no quadro 0, com troca curta, a ×1,2 (dominio) e ×1,4 (dominio_puxar), e nenhum passa de ×1,5", () => {
    for (const [lateral, escala] of [
      [0, ESCALA_DO_DOMINIO],
      [0.3, ESCALA_DO_DOMINIO],
      [0.9, ESCALA_DO_DOMINIO_PUXAR],
      [-0.9, ESCALA_DO_DOMINIO_PUXAR],
    ] as const) {
      const d = recebe(lateral);
      expect(d, `lateral ${lateral}`).toMatchObject({ inicioS: 0, velocidade: escala, crossfadeS: CROSSFADE_DA_JOGADA_S });
      expect(d.velocidade).toBeLessThanOrEqual(1.5);
    }
    expect(ESCALA_DO_DOMINIO).toBe(1.2);
    expect(ESCALA_DO_DOMINIO_PUXAR).toBe(1.4);
  });

  it("o toque da bola aparece a 0,111 s (dominio) e 0,095 s (dominio_puxar) do começo do estado e o gesto acaba em 0,25 s e 0,262 s, dentro da recepção de passe do servidor (0,3 s)", () => {
    for (const [lateral, contato, toqueS, fimS] of [
      [0, CONTATO_DO_DOMINIO_S, 4 / 30 / 1.2, 0.3 / 1.2],
      [0.9, CONTATO_DO_DOMINIO_PUXAR_S, 4 / 30 / 1.4, (11 / 30) / 1.4],
    ] as const) {
      const d = recebe(lateral);
      expect((contato - d.inicioS) / d.velocidade, `lateral ${lateral}`).toBeCloseTo(toqueS, 10);
      expect((DURACOES.get(d.clipe)! - d.inicioS) / d.velocidade, `lateral ${lateral}`).toBeCloseTo(fimS, 10);
      expect((DURACOES.get(d.clipe)! - d.inicioS) / d.velocidade, `lateral ${lateral}`).toBeLessThanOrEqual(RECEPCAO_PASSE.duracaoS);
    }
  });

  it("com o modelo antigo (sem os clipes de domínio) fica no repouso", () => {
    const antigo = new Map([...DURACOES].filter(([n]) => !n.startsWith("dominio")));
    expect(recebe(0, antigo)).toMatchObject({ clipe: "parado", propria: false });
  });

  it("os seis clipes novos existem na lista e na tabela, e nenhum repete", () => {
    for (const n of ["passar", "passar_esq", "dominio", "dominio_esq", "dominio_puxar", "dominio_puxar_esq"]) {
      expect(TODOS_OS_CLIPES).toContain(n);
      expect(DURACOES.has(n), n).toBe(true);
      expect(CLIPES_COM_LOOP.has(n), n).toBe(false);
    }
  });
});

describe("corrida", () => {
  it("a velocidade do clipe acompanha a do jogador, com piso e teto", () => {
    expect(velocidadeDaCorrida(VELOCIDADE_DA_CORRIDA_GRAVADA)).toBeCloseTo(1, 10);
    expect(velocidadeDaCorrida(ESCALA_MIN_DA_CORRIDA * VELOCIDADE_DA_CORRIDA_GRAVADA)).toBeCloseTo(ESCALA_MIN_DA_CORRIDA, 10);
    expect(velocidadeDaCorrida(0.1)).toBe(ESCALA_MIN_DA_CORRIDA);
    expect(velocidadeDaCorrida(ESCALA_MAX_DA_CORRIDA * VELOCIDADE_DA_CORRIDA_GRAVADA * 1.5)).toBe(ESCALA_MAX_DA_CORRIDA);
    expect(velocidadeDaCorrida(3.5)).toBeGreaterThan(velocidadeDaCorrida(2));
  });

  it("na velocidade máxima do jogo, com e sem a bola, o clipe acompanha o chão sem bater no teto (o pé não desliza)", () => {
    for (const v of [JOGADOR.velocidadeMax, JOGADOR.velocidadeMax * JOGADOR.fatorVelocidadeComBola]) {
      expect(velocidadeDaCorrida(v)).toBeLessThan(ESCALA_MAX_DA_CORRIDA);
      expect(velocidadeDaCorrida(v)).toBeCloseTo(v / VELOCIDADE_DA_CORRIDA_GRAVADA, 10);
    }
  });

  it("o estado de corrida já sai com a velocidade certa", () => {
    expect(decidir(ANIM.corrida, { ...LINHA, vel: 3.5 }, DURACOES)?.velocidade).toBeCloseTo(3.5 / VELOCIDADE_DA_CORRIDA_GRAVADA, 10);
  });
});

describe("chute e passe: o pé", () => {
  it("a bola à esquerda do corpo pede chutar_esq; à direita ou de frente, chutar", () => {
    // De frente para +X (dir = 0) a esquerda é -Z
    expect(pePorLado({ x: 0, z: 0, dir: 0, bola: { x: 0.5, y: 0, z: -0.4 } })).toBe("esq");
    expect(pePorLado({ x: 0, z: 0, dir: 0, bola: { x: 0.5, y: 0, z: 0.4 } })).toBe("dir");
    expect(pePorLado({ x: 0, z: 0, dir: 0, bola: { x: 0.6, y: 0, z: 0 } })).toBe("dir");
    expect(pePorLado({ x: 0, z: 0, dir: 0 })).toBe("dir");
  });

  it("vale para qualquer direção do corpo (virado para +Z, a esquerda é +X)", () => {
    const dir = Math.PI / 2;
    expect(pePorLado({ x: 3, z: 3, dir, bola: { x: 3.4, y: 0, z: 3.5 } })).toBe("esq");
    expect(pePorLado({ x: 3, z: 3, dir, bola: { x: 2.6, y: 0, z: 3.5 } })).toBe("dir");
    // Virado para -X a esquerda é +Z
    expect(pePorLado({ x: 0, z: 0, dir: Math.PI, bola: { x: -0.5, y: 0, z: 0.4 } })).toBe("esq");
  });

  it("o estado de chute escolhe o clipe pelo pé e acerta a bola logo depois do começo do estado", () => {
    const esq = decidir(ANIM.chute, { ...LINHA, bola: { x: 0.5, y: 0, z: -0.4 } }, DURACOES)!;
    expect(esq.clipe).toBe("chutar_esq");
    const dir = decidir(ANIM.chute, { ...LINHA, bola: { x: 0.5, y: 0, z: 0.4 } }, DURACOES)!;
    expect(dir.clipe).toBe("chutar");
    // O estado dura ANIMACAO.chuteS: o clipe inteiro cabe nele e o pé bate ~0,1 s depois do começo
    expect(DURACOES.get("chutar")! - dir.inicioS).toBeLessThanOrEqual(ANIMACAO.chuteS * dir.velocidade + 1e-9);
    expect((CONTATO_DO_CHUTE_S - dir.inicioS) / dir.velocidade).toBeCloseTo(ATRASO_DO_CONTATO_S, 5);
  });

  it("a troca curta (no máximo 0,06 s) vale só para passe e recepção; os outros clipes mantêm a troca de 0,12 s", () => {
    expect(CROSSFADE_DA_JOGADA_S).toBeLessThanOrEqual(0.06);
    expect(CROSSFADE_S).toBe(0.12);
    const bola = { x: 0.5, y: 0, z: 0.4, vx: 15, vz: 0 };
    for (const anim of [ANIM.parado, ANIM.chute, ANIM.comemoracao]) expect(decidir(anim, { ...LINHA, bola }, DURACOES)!.crossfadeS, `anim ${anim}`).toBe(CROSSFADE_S);
    expect(decidir(ANIM.corrida, { ...LINHA, vel: 5 }, DURACOES)!.crossfadeS).toBe(CROSSFADE_S);
    expect(decidir(ANIM.goleiroMergulhoEsq, { ...GOLEIRO, bola }, DURACOES)!.crossfadeS).toBe(CROSSFADE_S);
    for (const anim of [ANIM.passe, ANIM.recepcao]) expect(decidir(anim, { ...LINHA, bola }, DURACOES)!.crossfadeS, `anim ${anim}`).toBe(CROSSFADE_DA_JOGADA_S);
  });
});

describe("goleiro: mergulho", () => {
  const bolaBaixa = { x: 0, y: 0.3, z: 0 };

  it("de frente para +X, 'esquerda' do servidor (-Z) é a esquerda dele: gk_mergulho_esq", () => {
    expect(nome(ANIM.goleiroMergulhoEsq, { ...GOLEIRO, dir: 0, bola: bolaBaixa })).toBe("gk_mergulho_esq");
    expect(nome(ANIM.goleiroMergulhoDir, { ...GOLEIRO, dir: 0, bola: bolaBaixa })).toBe("gk_mergulho_dir");
  });

  it("de frente para -X o lado se inverte (o -Z do servidor passa a ser a direita dele)", () => {
    expect(nome(ANIM.goleiroMergulhoEsq, { ...GOLEIRO, dir: Math.PI, bola: bolaBaixa })).toBe("gk_mergulho_dir");
    expect(nome(ANIM.goleiroMergulhoDir, { ...GOLEIRO, dir: Math.PI, bola: bolaBaixa })).toBe("gk_mergulho_esq");
  });

  it("bola alta no começo do mergulho: defesa alta", () => {
    const alta = { x: 0, y: ALTURA_DA_DEFESA_ALTA_M + 0.2, z: 0 };
    expect(nome(ANIM.goleiroMergulhoEsq, { ...GOLEIRO, bola: alta })).toBe("gk_defesa_alta");
    expect(nome(ANIM.goleiroMergulhoDir, { ...GOLEIRO, bola: alta })).toBe("gk_defesa_alta");
    expect(nome(ANIM.goleiroMergulhoEsq, { ...GOLEIRO, bola: { x: 0, y: ALTURA_DA_DEFESA_ALTA_M - 0.3, z: 0 } })).not.toBe("gk_defesa_alta");
  });
});

describe("rosto", () => {
  it("cada estado pede a expressão certa", () => {
    expect(expressaoDoEstado(ANIM.comemoracao)).toEqual({ expressao: EXPRESSAO.felicidade, segura: true });
    expect(expressaoDoEstado(ANIM.queda)).toEqual({ expressao: EXPRESSAO.dor, segura: true });
    expect(expressaoDoEstado(ANIM.carrinho)).toEqual({ expressao: EXPRESSAO.dor, segura: true });
    expect(expressaoDoEstado(ANIM.chute)?.expressao).toBe(EXPRESSAO.forca);
    expect(expressaoDoEstado(ANIM.parado)).toBeNull();
    expect(expressaoDoEstado(ANIM.corrida)).toBeNull();
  });

  it("neutro (linha 0, quadro 0) quando nada acontece e pisca de tempos em tempos", () => {
    const c = new ControladorDeRosto(() => 0.5);
    expect(c.atualizar(0.016, ANIM.parado)).toEqual({ anim: EXPRESSAO.piscarUmOlho, quadro: 0 });
    let piscou = false;
    for (let t = 0; t < 8; t += 0.016) {
      const q = c.atualizar(0.016, ANIM.parado);
      if (q.anim === EXPRESSAO.piscarOsDois) piscou = true;
    }
    expect(piscou).toBe(true);
  });

  it("a felicidade da comemoração toca a 10 fps e fica no último quadro enquanto durar; sai quando o estado acaba", () => {
    const c = new ControladorDeRosto(() => 0.99);
    expect(c.atualizar(0.01, ANIM.comemoracao)).toEqual({ anim: EXPRESSAO.felicidade, quadro: 0 });
    expect(c.atualizar(0.2, ANIM.comemoracao)).toEqual({ anim: EXPRESSAO.felicidade, quadro: 2 });
    expect(c.atualizar(2, ANIM.comemoracao)).toEqual({ anim: EXPRESSAO.felicidade, quadro: 4 });
    expect(c.atualizar(0.016, ANIM.parado)).toEqual({ anim: EXPRESSAO.piscarUmOlho, quadro: 0 });
  });

  it("a força do chute toca uma vez (0,5 s) e volta ao neutro", () => {
    const c = new ControladorDeRosto(() => 0.99);
    expect(c.atualizar(0.01, ANIM.chute).anim).toBe(EXPRESSAO.forca);
    expect(c.atualizar(0.7, ANIM.chute)).toEqual({ anim: EXPRESSAO.piscarUmOlho, quadro: 0 });
  });
});
