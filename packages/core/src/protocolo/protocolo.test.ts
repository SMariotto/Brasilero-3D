import { describe, expect, it } from "vitest";
import { VERSAO_PROTOCOLO, papelDoOla, pareceOla } from "./index";

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
  });
});
