import { describe, expect, it } from "vitest";
import { esquecerChave, guardarChave, lerChave, type Armazenamento } from "./chave";

/** Um armazenamento de mentira; `quebrado` joga erro em tudo (aba anônima, sem espaço). */
function falso(quebrado = false): Armazenamento & { dados: Map<string, string> } {
  const dados = new Map<string, string>();
  const falha = (): never => {
    throw new Error("armazenamento indisponível");
  };
  return {
    dados,
    getItem: (k) => (quebrado ? falha() : (dados.get(k) ?? null)),
    setItem: (k, v) => (quebrado ? falha() : void dados.set(k, v)),
    removeItem: (k) => (quebrado ? falha() : void dados.delete(k)),
  };
}

describe("a chave do telão mestre no navegador do PC", () => {
  it("guarda e lê a chave da sala (recarregar a página não perde o controle)", () => {
    const local = falso();
    expect(lerChave("ABCD", [local])).toBeNull();
    expect(guardarChave("ABCD", "segredo", [local])).toBe(true);
    expect(lerChave("ABCD", [local])).toBe("segredo");
  });

  it("cada sala tem a sua chave; o código vale sem diferença de maiúscula e espaço", () => {
    const local = falso();
    guardarChave("ABCD", "chave-a", [local]);
    guardarChave("WXYZ", "chave-w", [local]);
    expect(lerChave("ABCD", [local])).toBe("chave-a");
    expect(lerChave("wxyz ", [local])).toBe("chave-w");
    expect(lerChave("QRST", [local])).toBeNull();
  });

  it("guarda no primeiro armazenamento (o localStorage); o segundo (sessionStorage) só entra se o primeiro falhar", () => {
    const local = falso();
    const sessao = falso();
    expect(guardarChave("ABCD", "s", [local, sessao])).toBe(true);
    expect(local.dados.size).toBe(1);
    expect(sessao.dados.size).toBe(0);

    const quebrado = falso(true);
    const reserva = falso();
    expect(guardarChave("ABCD", "s", [quebrado, reserva])).toBe(true);
    expect(reserva.dados.size).toBe(1);
  });

  it("lê do segundo armazenamento quando o primeiro está quebrado ou vazio", () => {
    const quebrado = falso(true);
    const sessao = falso();
    sessao.dados.set("b3d.chave.ABCD", "da-sessao");
    expect(lerChave("ABCD", [quebrado, sessao])).toBe("da-sessao");
    expect(lerChave("ABCD", [falso(), sessao])).toBe("da-sessao");
  });

  it("se nenhum armazenamento aceita, diz que não guardou (o telão avisa que só assiste depois de recarregar) e não quebra", () => {
    expect(guardarChave("ABCD", "s", [falso(true), falso(true)])).toBe(false);
    expect(guardarChave("ABCD", "s", [])).toBe(false);
    expect(lerChave("ABCD", [falso(true)])).toBeNull();
    expect(lerChave("ABCD", [])).toBeNull();
  });

  it("esquecer apaga em todos os armazenamentos, mesmo com um quebrado no meio", () => {
    const a = falso();
    const b = falso();
    a.dados.set("b3d.chave.ABCD", "x");
    b.dados.set("b3d.chave.ABCD", "y");
    esquecerChave("ABCD", [a, falso(true), b]);
    expect(lerChave("ABCD", [a, b])).toBeNull();
  });
});
