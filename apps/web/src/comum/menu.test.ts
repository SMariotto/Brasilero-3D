import { describe, expect, it } from "vitest";
import type { JogadorLobby } from "@b3d/core";
import { menuDisponivel, podeGerir, visaoDoMenu, type EstadoDoMenu, type LugarDoMenu } from "./menu";
import { podeRetomar, type PapelNaPausa } from "./pausa";

const ANA: JogadorLobby = { id: 1, apelido: "Ana", lado: "casa", pronto: false, dono: true, conectado: true };
const BETO: JogadorLobby = { id: 2, apelido: "Beto", lado: "visitante", pronto: false, dono: false, conectado: true };
const CAIO: JogadorLobby = { id: 3, apelido: "Caio", lado: "tanto", pronto: false, dono: false, conectado: false };

const base: EstadoDoMenu = {
  papel: "pc",
  lugar: "jogo",
  acabou: false,
  pausada: false,
  pcSemSinal: false,
  trancada: false,
  jogadores: [ANA, BETO, CAIO],
  expulsos: [],
  meuId: null,
};
const ids = (e: EstadoDoMenu): string[] => visaoDoMenu(e).itens.map((i) => i.id);
const PAPEIS: PapelNaPausa[] = ["pc", "lider", "jogador", "telao"];

describe("quem tem o menu (H7.4a e H7.4b)", () => {
  it("o PC e o líder têm; o jogador comum também (só para convidar); o telão que só assiste não", () => {
    for (const papel of ["pc", "lider", "jogador"] as PapelNaPausa[]) expect(menuDisponivel(papel, "jogo", false), papel).toBe(true);
    expect(menuDisponivel("telao", "jogo", false)).toBe(false);
    expect(menuDisponivel("telao", "lobby", false)).toBe(false);
    expect(visaoDoMenu({ ...base, papel: "telao" })).toEqual({ disponivel: false, titulo: "", itens: [], nota: "", convite: null, jogadores: [], removidos: [] });
  });

  it("no lobby todos os que têm menu o têm (é onde o líder tranca a sala e vê o QR)", () => {
    for (const papel of ["pc", "lider", "jogador"] as PapelNaPausa[]) expect(menuDisponivel(papel, "lobby", false), papel).toBe(true);
  });

  it("fora da sala (entrada, conectando) ninguém tem o menu", () => {
    for (const papel of PAPEIS) expect(menuDisponivel(papel, "fora", false), papel).toBe(false);
  });

  it("na tela de fim o PC continua com o menu e o celular não (o dele já tem Revanche e Lobby)", () => {
    expect(menuDisponivel("pc", "jogo", true)).toBe(true);
    for (const papel of ["lider", "jogador"] as PapelNaPausa[]) expect(menuDisponivel(papel, "jogo", true), papel).toBe(false);
  });

  it("só o PC e o líder gerenciam", () => {
    expect(PAPEIS.filter(podeGerir)).toEqual(["pc", "lider"]);
  });

  it("o título diz se é o menu da sala (lobby) ou da partida", () => {
    expect(visaoDoMenu({ ...base, lugar: "lobby" }).titulo).toBe("Menu da sala");
    expect(visaoDoMenu({ ...base, lugar: "jogo" }).titulo).toBe("Menu da partida");
  });
});

describe("os itens de ação do menu", () => {
  it("jogo rolando: Pausar, Acabar a partida e Trancar, nessa ordem, para o PC e para o líder", () => {
    for (const papel of ["pc", "lider"] as PapelNaPausa[]) expect(ids({ ...base, papel }), papel).toEqual(["pausar", "acabar", "trancar"]);
  });

  it("no lobby só há Trancar (não há partida para pausar nem acabar)", () => {
    for (const papel of ["pc", "lider"] as PapelNaPausa[]) expect(ids({ ...base, papel, lugar: "lobby" }), papel).toEqual(["trancar"]);
  });

  it("o jogador comum não tem nenhum item de ação, em lugar nenhum (só Convidar)", () => {
    for (const lugar of ["lobby", "jogo"] as LugarDoMenu[]) expect(ids({ ...base, papel: "jogador", lugar }), lugar).toEqual([]);
  });

  it("Trancar e Destrancar nunca aparecem juntos: o item acompanha `trancada`", () => {
    expect(ids({ ...base, trancada: false })).toContain("trancar");
    expect(ids({ ...base, trancada: false })).not.toContain("destrancar");
    expect(ids({ ...base, trancada: true })).toContain("destrancar");
    expect(ids({ ...base, trancada: true })).not.toContain("trancar");
    expect(visaoDoMenu({ ...base, trancada: true }).itens.find((i) => i.id === "destrancar")!.texto).toBe("Destrancar a sala");
  });

  it("Trancar não pede confirmação (dá para desfazer na hora); Acabar a partida pede", () => {
    const itens = visaoDoMenu(base).itens;
    expect(itens.find((i) => i.id === "trancar")!.confirmar).toBe(false);
    const acabar = itens.find((i) => i.id === "acabar")!;
    expect(acabar.confirmar).toBe(true);
    expect(acabar.textoConfirmar).toMatch(/acabar a partida/i);
  });

  it("Pausar e Retomar nunca aparecem juntos: o item acompanha `pausada`", () => {
    expect(ids({ ...base, pausada: false })).toEqual(["pausar", "acabar", "trancar"]);
    expect(ids({ ...base, pausada: true, pausadaPor: "lider" })).toEqual(["retomar", "acabar", "trancar"]);
  });

  it("o Retomar do menu aparece exatamente quando o servidor deixaria retomar", () => {
    for (const papel of ["pc", "lider"] as PapelNaPausa[]) {
      for (const por of ["lider", "tela"] as const) {
        for (const pcSemSinal of [false, true]) {
          const v = visaoDoMenu({ ...base, papel, pausada: true, pausadaPor: por, pcSemSinal });
          expect(v.itens.some((i) => i.id === "retomar"), `${papel} / ${por} / semPC=${pcSemSinal}`).toBe(podeRetomar(papel, por, pcSemSinal));
        }
      }
    }
  });

  it("o líder diante da pausa do PC não vê Retomar e lê por quê; com o PC sem sinal ele vê Retomar", () => {
    const pausaDoPc = visaoDoMenu({ ...base, papel: "lider", pausada: true, pausadaPor: "tela" });
    expect(pausaDoPc.itens.map((i) => i.id)).toEqual(["acabar", "trancar"]);
    expect(pausaDoPc.nota).toBe("O PC pausou o jogo. Só ele retoma.");
    const semPc = visaoDoMenu({ ...base, papel: "lider", pausada: true, pausadaPor: "tela", pcSemSinal: true });
    expect(semPc.itens.map((i) => i.id)).toEqual(["retomar", "acabar", "trancar"]);
    expect(semPc.nota).toBe("");
  });

  it("o líder pode acabar a partida e trancar a sala mesmo com a pausa do PC", () => {
    const v = ids({ ...base, papel: "lider", pausada: true, pausadaPor: "tela" });
    expect(v).toContain("acabar");
    expect(v).toContain("trancar");
  });

  it("tela de fim (PC): Voltar ao lobby sem confirmação, sem Pausar, e ainda Trancar", () => {
    const v = visaoDoMenu({ ...base, acabou: true });
    expect(v.itens).toEqual([
      { id: "acabar", texto: "Voltar ao lobby", confirmar: false, textoConfirmar: "" },
      { id: "trancar", texto: "Trancar a sala", confirmar: false, textoConfirmar: "" },
    ]);
  });

  it("sem nota quando nada precisa ser explicado", () => {
    expect(visaoDoMenu(base).nota).toBe("");
    expect(visaoDoMenu({ ...base, pausada: true, pausadaPor: "tela" }).nota).toBe("");
    expect(visaoDoMenu({ ...base, papel: "jogador", pausada: true, pausadaPor: "tela" }).nota).toBe("");
  });
});

describe("Convidar: o bloco que o menu mostra", () => {
  it("destrancada: o convite é livre (código e QR ou link); trancada: só o código, com a explicação", () => {
    for (const papel of ["pc", "lider", "jogador"] as PapelNaPausa[]) {
      for (const lugar of ["lobby", "jogo"] as LugarDoMenu[]) {
        expect(visaoDoMenu({ ...base, papel, lugar, trancada: false }).convite, `${papel}/${lugar}`).toBe("livre");
        expect(visaoDoMenu({ ...base, papel, lugar, trancada: true }).convite, `${papel}/${lugar}`).toBe("trancado");
      }
    }
  });
});

describe("a lista de jogadores com Expulsar", () => {
  it("o PC e o líder veem todos, na ordem do lobby, com líder e sem sinal marcados", () => {
    for (const papel of ["pc", "lider"] as PapelNaPausa[]) {
      const v = visaoDoMenu({ ...base, papel, meuId: papel === "lider" ? 1 : null });
      expect(v.jogadores.map((j) => [j.id, j.apelido, j.lider, j.semSinal]), papel).toEqual([
        [1, "Ana", true, false],
        [2, "Beto", false, false],
        [3, "Caio", false, true],
      ]);
    }
  });

  it("o PC pode expulsar qualquer um, inclusive o líder e quem está sem sinal", () => {
    const v = visaoDoMenu({ ...base, papel: "pc", meuId: null });
    expect(v.jogadores.every((j) => j.podeExpulsar && !j.voce)).toBe(true);
  });

  it("o líder não tem o botão contra si mesmo (o servidor recusaria), e a linha dele diz 'você'", () => {
    const v = visaoDoMenu({ ...base, papel: "lider", meuId: 1 });
    const ana = v.jogadores.find((j) => j.id === 1)!;
    expect(ana.voce).toBe(true);
    expect(ana.podeExpulsar).toBe(false);
    expect(v.jogadores.filter((j) => j.podeExpulsar).map((j) => j.id)).toEqual([2, 3]);
  });

  it("o jogador comum não vê a lista (só convida)", () => {
    const v = visaoDoMenu({ ...base, papel: "jogador", meuId: 2 });
    expect(v.jogadores).toEqual([]);
    expect(v.removidos).toEqual([]);
  });

  it("a lista acompanha o lobby: some quem saiu (a visão é recalculada do zero a cada lobby)", () => {
    expect(visaoDoMenu({ ...base, jogadores: [ANA] }).jogadores).toHaveLength(1);
    expect(visaoDoMenu({ ...base, jogadores: [] }).jogadores).toEqual([]);
  });
});

describe("os removidos com Perdoar", () => {
  const expulsos = [
    { id: 7, apelido: "Dani" },
    { id: 9, apelido: "Edu" },
  ];

  it("o PC e o líder veem os removidos, na ordem em que saíram, cada um com Perdoar", () => {
    for (const papel of ["pc", "lider"] as PapelNaPausa[]) {
      const v = visaoDoMenu({ ...base, papel, expulsos });
      expect(v.removidos, papel).toEqual([
        { id: 7, apelido: "Dani", podePerdoar: true },
        { id: 9, apelido: "Edu", podePerdoar: true },
      ]);
    }
  });

  it("sem removidos, nada aparece", () => {
    expect(visaoDoMenu(base).removidos).toEqual([]);
  });

  it("o jogador comum não vê quem foi removido", () => {
    expect(visaoDoMenu({ ...base, papel: "jogador", expulsos }).removidos).toEqual([]);
  });

  it("perdoar vale também no lobby e com a sala trancada", () => {
    expect(visaoDoMenu({ ...base, lugar: "lobby", trancada: true, expulsos }).removidos).toHaveLength(2);
  });
});
