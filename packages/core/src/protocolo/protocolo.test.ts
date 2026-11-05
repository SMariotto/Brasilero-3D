import { describe, expect, it } from "vitest";
import {
  CONFIG_PADRAO,
  VERSAO_PROTOCOLO,
  lerConfigParcial,
  lerMensagemCliente,
  normalizarSala,
  papelDoOla,
  pareceOla,
  validarApelido,
} from "./index";
import { acharTime } from "../dados/index";

describe("ola", () => {
  it("reconhece ola de telão", () => {
    const m = { t: "ola", versao: VERSAO_PROTOCOLO, acao: "criar" };
    expect(pareceOla(m)).toBe(true);
    expect(papelDoOla(m as never)).toBe("tela");
  });

  it("reconhece ola de controle", () => {
    const m = { t: "ola", versao: VERSAO_PROTOCOLO, sala: "ABCD", apelido: "Samuel" };
    expect(pareceOla(m)).toBe(true);
    expect(papelDoOla(m as never)).toBe("controle");
  });

  it("rejeita o que não tem a forma certa", () => {
    expect(pareceOla(null)).toBe(false);
    expect(pareceOla("ola")).toBe(false);
    expect(pareceOla({ t: "ping" })).toBe(false);
    expect(pareceOla({ t: "ola" })).toBe(false);
    expect(pareceOla({ t: "ola", versao: 1, acao: "voar" })).toBe(false);
    expect(pareceOla({ t: "ola", versao: 1, sala: 5, apelido: "x" })).toBe(false);
    expect(pareceOla({ t: "ola", versao: 1, sala: "ABCD", apelido: "x", token: 7 })).toBe(false);
    expect(pareceOla({ t: "ola", versao: 1, acao: "assistir", sala: "A".repeat(40) })).toBe(false);
  });
});

describe("validarApelido", () => {
  it("aceita apelido normal e tira os espaços das pontas", () => {
    expect(validarApelido("  Samuel ")).toBe("Samuel");
    expect(validarApelido("João Pé")).toBe("João Pé");
  });

  it("aceita 12 caracteres e recusa 13", () => {
    expect(validarApelido("a".repeat(12))).toBe("a".repeat(12));
    expect(validarApelido("a".repeat(13))).toBeNull();
  });

  it("conta caracteres e não bytes (emoji vale 1)", () => {
    expect(validarApelido("😀".repeat(12))).not.toBeNull();
  });

  it("recusa vazio, só espaços, tipo errado e caractere de controle", () => {
    expect(validarApelido("")).toBeNull();
    expect(validarApelido("   ")).toBeNull();
    expect(validarApelido(42)).toBeNull();
    expect(validarApelido("a\nb")).toBeNull();
    expect(validarApelido("a\u0000b")).toBeNull();
  });
});

describe("normalizarSala", () => {
  it("põe em maiúsculas e tira espaços", () => {
    expect(normalizarSala(" abcd ")).toBe("ABCD");
  });
});

describe("config", () => {
  it("a config padrão usa clubes que existem e diferentes", () => {
    expect(acharTime(CONFIG_PADRAO.casa)).toBeDefined();
    expect(acharTime(CONFIG_PADRAO.visitante)).toBeDefined();
    expect(CONFIG_PADRAO.casa).not.toBe(CONFIG_PADRAO.visitante);
  });

  it("aceita um campo de cada vez e a config completa", () => {
    expect(lerConfigParcial({ n: 3 })).toEqual({ n: 3 });
    expect(lerConfigParcial({ faltas: false })).toEqual({ faltas: false });
    expect(lerConfigParcial({ ...CONFIG_PADRAO })).toEqual(CONFIG_PADRAO);
  });

  it("ignora campos desconhecidos e aceita mensagem sem campo nenhum", () => {
    expect(lerConfigParcial({ t: "config", xis: 1 })).toEqual({});
  });

  it("recusa tudo se qualquer campo presente estiver errado", () => {
    expect(lerConfigParcial({ n: 6 })).toBeNull();
    expect(lerConfigParcial({ n: "5" })).toBeNull();
    expect(lerConfigParcial({ duracao: 3 })).toBeNull();
    expect(lerConfigParcial({ modo: "praia" })).toBeNull();
    expect(lerConfigParcial({ dificuldade: "impossivel" })).toBeNull();
    expect(lerConfigParcial({ faltas: "sim" })).toBeNull();
    expect(lerConfigParcial({ casa: "time-que-nao-existe" })).toBeNull();
    expect(lerConfigParcial({ visitante: 5 })).toBeNull();
    expect(lerConfigParcial({ n: 4, modo: "praia" })).toBeNull();
  });
});

describe("lerMensagemCliente", () => {
  const ler = (o: unknown) => lerMensagemCliente(JSON.stringify(o));

  it("lê cada tipo de mensagem válida", () => {
    expect(ler({ t: "ola", versao: 1, acao: "criar" })).toMatchObject({ t: "ola" });
    expect(ler({ t: "lado", lado: "casa" })).toEqual({ t: "lado", lado: "casa" });
    expect(ler({ t: "pronto", valor: true })).toEqual({ t: "pronto", valor: true });
    expect(ler({ t: "config", n: 4, modo: "arena" })).toEqual({ t: "config", n: 4, modo: "arena" });
    expect(ler({ t: "comecar" })).toEqual({ t: "comecar" });
    expect(ler({ t: "revanche" })).toEqual({ t: "revanche" });
    expect(ler({ t: "lobby" })).toEqual({ t: "lobby" });
    expect(ler({ t: "camera", modo: "aerea" })).toEqual({ t: "camera", modo: "aerea" });
    expect(ler({ t: "ping", c: 123 })).toEqual({ t: "ping", c: 123 });
  });

  it("recusa JSON quebrado, lista, tipo desconhecido e campos errados", () => {
    expect(lerMensagemCliente("{")).toBeNull();
    expect(lerMensagemCliente("[]")).toBeNull();
    expect(lerMensagemCliente("5")).toBeNull();
    expect(ler({ t: "voar" })).toBeNull();
    expect(ler({ t: "lado", lado: "meio" })).toBeNull();
    expect(ler({ t: "pronto", valor: "sim" })).toBeNull();
    expect(ler({ t: "config", n: 9 })).toBeNull();
    expect(ler({ t: "camera", modo: "lateral" })).toBeNull();
    expect(ler({ t: "ping", c: "agora" })).toBeNull();
    expect(ler({ t: "ping", c: null })).toBeNull();
  });

  it("recusa texto acima de 1 KB", () => {
    expect(lerMensagemCliente(JSON.stringify({ t: "ping", c: 1, lixo: "x".repeat(2000) }))).toBeNull();
  });
});
