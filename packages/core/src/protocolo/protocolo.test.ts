import { describe, expect, it } from "vitest";
import {
  CONFIG_PADRAO,
  ERROS_FATAIS,
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

  it("H7: o ola do telão leva a chave (texto de até 64 caracteres); outro tipo ou tamanho é recusado", () => {
    expect(pareceOla({ t: "ola", versao: VERSAO_PROTOCOLO, acao: "assistir", sala: "ABCD", chave: "a".repeat(32) })).toBe(true);
    expect(pareceOla({ t: "ola", versao: VERSAO_PROTOCOLO, acao: "assistir", sala: "ABCD", chave: "a".repeat(64) })).toBe(true);
    expect(pareceOla({ t: "ola", versao: VERSAO_PROTOCOLO, acao: "assistir", sala: "ABCD", chave: "a".repeat(65) })).toBe(false);
    expect(pareceOla({ t: "ola", versao: VERSAO_PROTOCOLO, acao: "assistir", sala: "ABCD", chave: 123 })).toBe(false);
    expect(pareceOla({ t: "ola", versao: VERSAO_PROTOCOLO, acao: "assistir", sala: "ABCD", chave: null })).toBe(false);
  });

  it("H7.2: o ola do controle leva o identificador do aparelho (texto de até 64 caracteres); outro tipo ou tamanho é recusado", () => {
    const base = { t: "ola", versao: VERSAO_PROTOCOLO, sala: "ABCD", apelido: "Ana" };
    expect(pareceOla({ ...base, aparelho: "a".repeat(32) })).toBe(true);
    expect(pareceOla({ ...base, aparelho: "a".repeat(64), token: "t" })).toBe(true);
    expect(pareceOla({ ...base, aparelho: "a".repeat(65) })).toBe(false);
    expect(pareceOla({ ...base, aparelho: 7 })).toBe(false);
    expect(pareceOla({ ...base, aparelho: null })).toBe(false);
    expect(pareceOla(base)).toBe(true); // sem ele também vale (página velha, armazenamento bloqueado)
  });

  it("H7: a versão do protocolo subiu para 2 (telão com chave, mensagens lider e aviso)", () => {
    expect(VERSAO_PROTOCOLO).toBe(2);
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
    expect(ler({ t: "zerar" })).toEqual({ t: "zerar" });
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

  it("H7.2: lê expulsar com um id inteiro e recusa o resto, como o lider", () => {
    expect(ler({ t: "expulsar", id: 4 })).toEqual({ t: "expulsar", id: 4 });
    for (const id of [-1, 1.5, "4", null, undefined, 2_000_000, NaN]) expect(ler({ t: "expulsar", id }), String(id)).toBeNull();
    expect(ler({ t: "expulsar" })).toBeNull();
  });

  it("H7.2: EXPULSO é um erro fatal (o aparelho não tenta de novo) e ALVO_INVALIDO não", () => {
    expect(ERROS_FATAIS).toContain("EXPULSO");
    expect(ERROS_FATAIS).not.toContain("ALVO_INVALIDO");
  });

  it("H7: lê lider com um id inteiro e recusa o resto", () => {
    expect(ler({ t: "lider", id: 3 })).toEqual({ t: "lider", id: 3 });
    expect(ler({ t: "lider", id: 0 })).toEqual({ t: "lider", id: 0 });
    for (const id of [-1, 1.5, "3", null, undefined, 2_000_000, NaN]) expect(ler({ t: "lider", id }), String(id)).toBeNull();
    expect(ler({ t: "lider" })).toBeNull();
  });

  it("recusa texto acima de 1 KB", () => {
    expect(lerMensagemCliente(JSON.stringify({ t: "ping", c: 1, lixo: "x".repeat(2000) }))).toBeNull();
  });
});

describe("clube aleatório (F5)", () => {
  it("a config aceita \"aleatorio\" nos dois lados e recusa clube que não existe", async () => {
    const { CLUBE_ALEATORIO } = await import("./config");
    expect(lerConfigParcial({ casa: CLUBE_ALEATORIO })).toEqual({ casa: "aleatorio" });
    expect(lerConfigParcial({ visitante: CLUBE_ALEATORIO, casa: "vasco" })).toEqual({ visitante: "aleatorio", casa: "vasco" });
    expect(lerConfigParcial({ casa: "aleatório" })).toBeNull();
  });

  it("sortearClubes troca só o aleatório, sempre por dois clubes diferentes, e sem sorteio devolve igual", async () => {
    const { CLUBE_ALEATORIO, sortearClubes } = await import("./config");
    const { criarRng } = await import("../util/rng");
    const sem = { ...CONFIG_PADRAO };
    expect(sortearClubes(sem, criarRng(1))).toBe(sem);

    for (let semente = 1; semente <= 200; semente++) {
      const dois = sortearClubes({ ...CONFIG_PADRAO, casa: CLUBE_ALEATORIO, visitante: CLUBE_ALEATORIO }, criarRng(semente));
      expect(acharTime(dois.casa)).toBeDefined();
      expect(acharTime(dois.visitante)).toBeDefined();
      expect(dois.casa).not.toBe(dois.visitante);

      const umLado = sortearClubes({ ...CONFIG_PADRAO, casa: "vasco", visitante: CLUBE_ALEATORIO }, criarRng(semente));
      expect(umLado.casa).toBe("vasco");
      expect(umLado.visitante).not.toBe("vasco");
    }
  });

  it("a mesma semente sorteia os mesmos clubes e sementes diferentes variam", async () => {
    const { CLUBE_ALEATORIO, sortearClubes } = await import("./config");
    const { criarRng } = await import("../util/rng");
    const c = { ...CONFIG_PADRAO, casa: CLUBE_ALEATORIO, visitante: CLUBE_ALEATORIO };
    expect(sortearClubes(c, criarRng(5))).toEqual(sortearClubes(c, criarRng(5)));
    const vistos = new Set<string>();
    for (let s = 1; s <= 50; s++) vistos.add(sortearClubes(c, criarRng(s)).casa);
    expect(vistos.size).toBeGreaterThan(6);
  });
});
