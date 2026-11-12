import { describe, expect, it } from "vitest";
import { visaoDoMenu, menuDisponivel, type EstadoDoMenu } from "./menu";
import { podeRetomar, type PapelNaPausa } from "./pausa";

const base: EstadoDoMenu = { papel: "pc", noJogo: true, acabou: false, pausada: false, pcSemSinal: false };
const ids = (e: EstadoDoMenu): string[] => visaoDoMenu(e).itens.map((i) => i.id);

describe("quem tem o menu (H7.4a)", () => {
  it("o PC e o líder têm; jogador comum e telão que só assiste não", () => {
    expect(menuDisponivel("pc", true, false)).toBe(true);
    expect(menuDisponivel("lider", true, false)).toBe(true);
    for (const papel of ["jogador", "telao"] as PapelNaPausa[]) {
      expect(menuDisponivel(papel, true, false), papel).toBe(false);
      expect(visaoDoMenu({ ...base, papel })).toEqual({ disponivel: false, itens: [], nota: "" });
    }
  });

  it("fora da tela do jogo (lobby, entrada) ninguém tem o menu", () => {
    for (const papel of ["pc", "lider"] as PapelNaPausa[]) expect(menuDisponivel(papel, false, false), papel).toBe(false);
  });

  it("na tela de fim o PC continua com o menu (o jeito de voltar ao lobby) e o líder não (o celular dele já tem Revanche e Lobby)", () => {
    expect(menuDisponivel("pc", true, true)).toBe(true);
    expect(menuDisponivel("lider", true, true)).toBe(false);
  });
});

describe("os itens do menu", () => {
  it("jogo rolando: Pausar e Acabar a partida, nessa ordem, para o PC e para o líder", () => {
    for (const papel of ["pc", "lider"] as PapelNaPausa[]) expect(ids({ ...base, papel }), papel).toEqual(["pausar", "acabar"]);
  });

  it("Pausar e Retomar nunca aparecem juntos: o item acompanha `pausada`", () => {
    expect(ids({ ...base, pausada: false })).toEqual(["pausar", "acabar"]);
    expect(ids({ ...base, pausada: true, pausadaPor: "lider" })).toEqual(["retomar", "acabar"]);
  });

  it("Acabar a partida pede confirmação e diz o texto da confirmação; os outros não pedem", () => {
    const itens = visaoDoMenu(base).itens;
    const acabar = itens.find((i) => i.id === "acabar")!;
    expect(acabar.confirmar).toBe(true);
    expect(acabar.textoConfirmar).toMatch(/acabar a partida/i);
    expect(itens.find((i) => i.id === "pausar")!.confirmar).toBe(false);
  });

  it("o Retomar do menu aparece exatamente quando o servidor deixaria retomar", () => {
    const papeis = ["pc", "lider"] as PapelNaPausa[];
    for (const papel of papeis) {
      for (const por of ["lider", "tela"] as const) {
        for (const pcSemSinal of [false, true]) {
          const v = visaoDoMenu({ ...base, papel, pausada: true, pausadaPor: por, pcSemSinal });
          const tem = v.itens.some((i) => i.id === "retomar");
          expect(tem, `${papel} / ${por} / semPC=${pcSemSinal}`).toBe(podeRetomar(papel, por, pcSemSinal));
        }
      }
    }
  });

  it("o líder diante da pausa do PC não vê Retomar e lê por quê; com o PC sem sinal ele vê Retomar", () => {
    const pausaDoPc = visaoDoMenu({ ...base, papel: "lider", pausada: true, pausadaPor: "tela" });
    expect(pausaDoPc.itens.map((i) => i.id)).toEqual(["acabar"]);
    expect(pausaDoPc.nota).toBe("O PC pausou o jogo. Só ele retoma.");
    const semPc = visaoDoMenu({ ...base, papel: "lider", pausada: true, pausadaPor: "tela", pcSemSinal: true });
    expect(semPc.itens.map((i) => i.id)).toEqual(["retomar", "acabar"]);
    expect(semPc.nota).toBe("");
  });

  it("o líder pode acabar a partida mesmo com a pausa do PC (acabar não é retomar)", () => {
    expect(ids({ ...base, papel: "lider", pausada: true, pausadaPor: "tela" })).toContain("acabar");
  });

  it("tela de fim (PC): só Voltar ao lobby, sem confirmação e sem Pausar", () => {
    const v = visaoDoMenu({ ...base, acabou: true });
    expect(v.itens).toEqual([{ id: "acabar", texto: "Voltar ao lobby", confirmar: false, textoConfirmar: "" }]);
  });

  it("sem nota quando nada precisa ser explicado", () => {
    expect(visaoDoMenu(base).nota).toBe("");
    expect(visaoDoMenu({ ...base, pausada: true, pausadaPor: "tela" }).nota).toBe("");
  });
});
