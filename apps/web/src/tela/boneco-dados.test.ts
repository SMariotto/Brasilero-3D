import { existsSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PARTIDA, TIMES, acharTime, uniformeReserva, uniformeTitular, uniformesDaPartida } from "@b3d/core";
import {
  COLUNAS_DO_ATLAS,
  CORTES_DE_CABELO,
  CORES_DE_CABELO,
  SKINS_PRONTAS,
  TIPOS_DE_ROSTO,
  TODAS_AS_CHAVES_DE_CABELO,
  aparenciaDoSlot,
  caminhosDoBoneco,
  chaveDoCabelo,
  ehTitular,
  kitDoJogador,
  offsetDoRosto,
} from "./boneco-dados";

const PASTA = new URL("../../public/boneco/", import.meta.url);

describe("rosto (atlas de 25 colunas por 5 linhas)", () => {
  it("o deslocamento é (tipo*5+quadro)/25 em x e anim/5 em y", () => {
    expect(offsetDoRosto(0, 0, 0)).toEqual([0, 0]);
    expect(offsetDoRosto(2, 3, 4)).toEqual([14 / COLUNAS_DO_ATLAS, 3 / 5]);
    expect(offsetDoRosto(4, 4, 4)[0]).toBeCloseTo(24 / 25, 10);
  });
});

describe("cabelo", () => {
  it("são 35 cabelos (7 cortes x 5 cores) e cada um tem o seu .glb em public/boneco/cabelos", () => {
    expect(TODAS_AS_CHAVES_DE_CABELO).toHaveLength(CORTES_DE_CABELO.length * CORES_DE_CABELO.length);
    expect(TODAS_AS_CHAVES_DE_CABELO).toHaveLength(35);
    for (const chave of TODAS_AS_CHAVES_DE_CABELO) expect(existsSync(new URL(`cabelos/${chave}.glb`, PASTA)), chave).toBe(true);
    expect(readdirSync(new URL("cabelos/", PASTA)).filter((n) => n.endsWith(".glb"))).toHaveLength(35);
  });

  it("a chave junta o corte e a cor", () => {
    expect(chaveDoCabelo(6, 3)).toBe("07-mullet_preto");
    expect(chaveDoCabelo(0, 0)).toBe("01-liso-repartido_castanho");
  });
});

describe("aparenciaDoSlot", () => {
  it("é sempre a mesma para o mesmo slot e cai dentro dos limites", () => {
    for (let slot = 0; slot < 12; slot++) {
      const a = aparenciaDoSlot(slot);
      expect(aparenciaDoSlot(slot)).toEqual(a);
      expect(a.tipoRosto).toBeGreaterThanOrEqual(0);
      expect(a.tipoRosto).toBeLessThan(TIPOS_DE_ROSTO);
      expect(TODAS_AS_CHAVES_DE_CABELO).toContain(chaveDoCabelo(a.corte, a.corCabelo));
    }
  });

  it("os 12 jogadores nunca repetem o mesmo cabelo (corte + cor)", () => {
    const chaves = Array.from({ length: 12 }, (_, slot) => {
      const a = aparenciaDoSlot(slot);
      return chaveDoCabelo(a.corte, a.corCabelo);
    });
    expect(new Set(chaves).size).toBe(12);
  });
});

describe("skins prontas", () => {
  it("cada skin pronta existe em public/boneco/skins, é um clube de times.json e não sobra PNG sem clube na lista", () => {
    for (const id of SKINS_PRONTAS) {
      expect(existsSync(new URL(`skins/${id}.png`, PASTA)), `skins/${id}.png`).toBe(true);
      expect(acharTime(id), id).toBeDefined();
    }
    const arquivos = readdirSync(new URL("skins/", PASTA)).filter((n) => n.endsWith(".png"));
    expect(new Set(arquivos.map((n) => n.replace(/\.png$/, "")))).toEqual(new Set(SKINS_PRONTAS));
  });

  it("o Pé de Sapo é o 13º clube: sigla PDS e as cores do Samuel", () => {
    expect(TIMES.length).toBeGreaterThanOrEqual(13);
    const t = acharTime("pedesapo")!;
    expect(t.sigla).toBe("PDS");
    expect(t.cores.primaria.toLowerCase()).toBe("#184722");
    expect(t.cores.secundaria.toLowerCase()).toBe("#b39101");
    expect(t.cores.terciaria?.toLowerCase()).toBe("#e3d391");
  });
});

describe("caminhosDoBoneco", () => {
  it("monta os endereços a partir da base do site", () => {
    const c = caminhosDoBoneco("/jogo/");
    expect(c.corpo).toBe("/jogo/boneco/model-brasilero-3d-rig.glb");
    expect(c.skin("vasco")).toBe("/jogo/boneco/skins/vasco.png");
    expect(c.cabelo("07-mullet_preto")).toBe("/jogo/boneco/cabelos/07-mullet_preto.glb");
    expect(caminhosDoBoneco().atlas).toBe("/boneco/rostos_atlas.png");
  });
});

describe("kit de skin", () => {
  const vasco = acharTime("vasco")!;
  const flamengo = acharTime("flamengo")!;

  it("a camisa titular de um clube com PNG usa o PNG", () => {
    const u = uniformesDaPartida("vasco", "flamengo");
    expect(ehTitular("vasco", u[0])).toBe(true);
    expect(kitDoJogador({ time: 0, goleiro: false }, u, ["vasco", "flamengo"])).toMatchObject({ chave: "0l", png: "vasco" });
  });

  it("clube sem PNG usa a skin gerada, mesmo de titular", () => {
    const u = uniformesDaPartida("vasco", "flamengo");
    expect(ehTitular("flamengo", u[1])).toBe(true);
    expect(kitDoJogador({ time: 1, goleiro: false }, u, ["vasco", "flamengo"]).png).toBeNull();
  });

  it("na camisa reserva (choque de cores) a skin PNG não vale: usa a gerada com as cores da reserva", () => {
    // Dois clubes de camisa preta: o visitante troca para a reserva
    const u = uniformesDaPartida("vasco", "atleticomg");
    expect(u[1]).toEqual(uniformeReserva(acharTime("atleticomg")!));
    const reservaDoVasco = uniformeReserva(vasco);
    expect(ehTitular("vasco", reservaDoVasco)).toBe(false);
    expect(kitDoJogador({ time: 1, goleiro: false }, [uniformeTitular(flamengo), reservaDoVasco], ["flamengo", "vasco"]).png).toBeNull();
  });

  it("o goleiro usa a cor fixa de contraste e nunca a skin do clube", () => {
    const u = uniformesDaPartida("vasco", "flamengo");
    const casa = kitDoJogador({ time: 0, goleiro: true }, u, ["vasco", "flamengo"]);
    const visita = kitDoJogador({ time: 1, goleiro: true }, u, ["vasco", "flamengo"]);
    expect(casa).toMatchObject({ chave: "0g", png: null });
    expect(casa.uniforme.cor1).toBe(PARTIDA.corGoleiroCasa);
    expect(visita.uniforme.cor1).toBe(PARTIDA.corGoleiroVisitante);
    expect(visita.chave).toBe("1g");
  });
});
