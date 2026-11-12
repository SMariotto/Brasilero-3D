import { describe, expect, it } from "vitest";
import { ERROS_FATAIS, type CodigoErro } from "@b3d/core";
import { AVISO_DO_TELAO_MS, reacaoAoErro } from "./erros";

const TODOS: CodigoErro[] = [
  "VERSAO",
  "SALA_NAO_EXISTE",
  "SALA_CHEIA",
  "LADO_CHEIO",
  "TELAS_CHEIAS",
  "SERVIDOR_CHEIO",
  "APELIDO_INVALIDO",
  "SEM_PERMISSAO",
  "MENSAGEM_INVALIDA",
  "TOKEN_EXPIRADO",
  "ALVO_INVALIDO",
  "EXPULSO",
  "PAUSA_DO_TELAO",
];

describe("reacaoAoErro: o telão só volta à tela inicial nos erros fatais", () => {
  it("os erros fatais (sala que não existe, servidor ou telões cheios, versão errada) voltam à tela inicial", () => {
    for (const c of ["VERSAO", "SALA_NAO_EXISTE", "TELAS_CHEIAS", "SERVIDOR_CHEIO", "EXPULSO"] as const) expect(reacaoAoErro(c), c).toBe("voltar");
  });

  it("uma recusa de ação não tira o PC da sala: só avisa", () => {
    for (const c of ["SEM_PERMISSAO", "MENSAGEM_INVALIDA", "LADO_CHEIO", "TOKEN_EXPIRADO", "ALVO_INVALIDO", "PAUSA_DO_TELAO"] as const) expect(reacaoAoErro(c), c).toBe("avisar");
  });

  it("segue a lista ERROS_FATAIS do protocolo, código por código (um erro novo fatal volta sozinho)", () => {
    for (const c of TODOS) expect(reacaoAoErro(c), c).toBe(ERROS_FATAIS.includes(c) ? "voltar" : "avisar");
  });

  it("o aviso fica na tela por alguns segundos", () => {
    expect(AVISO_DO_TELAO_MS).toBeGreaterThanOrEqual(2000);
    expect(AVISO_DO_TELAO_MS).toBeLessThanOrEqual(10000);
  });
});
