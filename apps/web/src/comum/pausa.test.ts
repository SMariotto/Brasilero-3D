import { describe, expect, it } from "vitest";
import { podeRetomar, visaoDaPausa, type PapelNaPausa, type QuemPausou } from "./pausa";

const PAPEIS: PapelNaPausa[] = ["pc", "telao", "lider", "jogador"];
const QUEM: Array<QuemPausou | undefined> = ["lider", "tela", undefined];

describe("podeRetomar: o mesmo que o servidor deixa", () => {
  it("o PC retoma qualquer pausa", () => {
    for (const por of QUEM) expect(podeRetomar("pc", por)).toBe(true);
  });

  it("o líder só retoma a pausa que ele mesmo fez, nunca a do PC", () => {
    expect(podeRetomar("lider", "lider")).toBe(true);
    expect(podeRetomar("lider", "tela")).toBe(false);
  });

  it("telão que só assiste e jogador comum nunca retomam", () => {
    for (const papel of ["telao", "jogador"] as const) for (const por of QUEM) expect(podeRetomar(papel, por), papel).toBe(false);
  });

  it("PC sem sinal há 30 s (H7.4a): o líder passa a retomar também a pausa do PC; ninguém mais ganha nada", () => {
    expect(podeRetomar("lider", "tela", true)).toBe(true);
    expect(podeRetomar("lider", "tela", false)).toBe(false);
    expect(podeRetomar("lider", "lider", true)).toBe(true);
    expect(podeRetomar("lider", undefined, true)).toBe(false); // sem saber quem pausou, não libera
    for (const papel of ["telao", "jogador"] as const) expect(podeRetomar(papel, "tela", true), papel).toBe(false);
    expect(podeRetomar("pc", "tela", true)).toBe(true);
  });
});

describe("visaoDaPausa", () => {
  it("sem pausa nada aparece, para ninguém", () => {
    for (const papel of PAPEIS) {
      for (const por of QUEM) expect(visaoDaPausa(false, por, papel)).toEqual({ visivel: false, titulo: "", detalhe: "", botaoRetomar: false });
    }
  });

  it("pausado, todo mundo vê o título, e o botão Retomar só aparece para quem pode", () => {
    for (const papel of PAPEIS) {
      for (const por of ["lider", "tela"] as const) {
        const v = visaoDaPausa(true, por, papel);
        expect(v.visivel).toBe(true);
        expect(v.titulo).toBe("Jogo pausado");
        expect(v.botaoRetomar, `${papel} / ${por}`).toBe(podeRetomar(papel, por));
      }
    }
  });

  it("o texto diz quem pausou e o que a pessoa pode fazer", () => {
    expect(visaoDaPausa(true, "tela", "pc").detalhe).toBe("Você pausou o jogo.");
    expect(visaoDaPausa(true, "lider", "pc").detalhe).toBe("O líder pausou o jogo. Você pode retomar.");
    expect(visaoDaPausa(true, "lider", "lider").detalhe).toBe("Você pausou o jogo.");
    expect(visaoDaPausa(true, "tela", "lider").detalhe).toBe("O PC pausou o jogo. Só ele retoma.");
    expect(visaoDaPausa(true, "tela", "jogador").detalhe).toBe("Pausado pelo PC.");
    expect(visaoDaPausa(true, "lider", "jogador").detalhe).toBe("Pausado pelo líder.");
    expect(visaoDaPausa(true, "lider", "telao").detalhe).toBe("Pausado pelo líder.");
  });

  it("PC sem sinal (H7.4a): o líder vê que pode retomar, os outros veem que o líder pode, e o botão acompanha", () => {
    const l = visaoDaPausa(true, "tela", "lider", true);
    expect(l.detalhe).toBe("O PC pausou o jogo e está sem sinal. Você pode retomar.");
    expect(l.botaoRetomar).toBe(true);
    for (const papel of ["jogador", "telao"] as const) {
      const v = visaoDaPausa(true, "tela", papel, true);
      expect(v.detalhe, papel).toBe("Pausado pelo PC, que está sem sinal. O líder pode retomar.");
      expect(v.botaoRetomar, papel).toBe(false);
    }
    expect(visaoDaPausa(true, "tela", "pc", true).detalhe).toBe("Você pausou o jogo."); // o PC está aqui: não está sem sinal
    expect(visaoDaPausa(true, "lider", "jogador", true).detalhe).toBe("Pausado pelo líder."); // pausa do líder: o sinal do PC não importa
  });

  it("sem saber quem pausou (não deveria acontecer), cai no líder e não libera botão a quem não pode", () => {
    expect(visaoDaPausa(true, undefined, "jogador").detalhe).toBe("Pausado pelo líder.");
    expect(visaoDaPausa(true, undefined, "lider").botaoRetomar).toBe(false);
  });
});
