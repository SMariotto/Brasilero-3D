import { describe, expect, it } from "vitest";
import { CHAVE_DO_APARELHO, identificadorDoAparelho, sortearIdentificador, type ArmazenamentoDoAparelho } from "./aparelho";

function falso(quebrado = false): ArmazenamentoDoAparelho & { dados: Map<string, string> } {
  const dados = new Map<string, string>();
  const falha = (): never => {
    throw new Error("armazenamento indisponível");
  };
  return { dados, getItem: (k) => (quebrado ? falha() : (dados.get(k) ?? null)), setItem: (k, v) => (quebrado ? falha() : void dados.set(k, v)) };
}

const FIXO = "0123456789abcdef0123456789abcdef";

describe("o identificador do aparelho (base do bloqueio de quem foi expulso)", () => {
  it("o sorteio dá 32 letras e números em hexadecimal, e dois sorteios não repetem", () => {
    const a = sortearIdentificador();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(sortearIdentificador()).not.toBe(a);
  });

  it("na primeira vez sorteia e guarda; nas seguintes devolve o mesmo (o aparelho é reconhecido ao voltar)", () => {
    const local = falso();
    const primeiro = identificadorDoAparelho(local, () => FIXO);
    expect(primeiro).toBe(FIXO);
    expect(local.dados.get(CHAVE_DO_APARELHO)).toBe(FIXO);
    expect(identificadorDoAparelho(local, () => "f".repeat(32))).toBe(FIXO); // não sorteia de novo
  });

  it("valor guardado com formato estranho é trocado por um novo (o servidor só aceita até 64 caracteres)", () => {
    const local = falso();
    local.dados.set(CHAVE_DO_APARELHO, "x".repeat(200));
    const id = identificadorDoAparelho(local, () => FIXO);
    expect(id).toBe(FIXO);
    expect(local.dados.get(CHAVE_DO_APARELHO)).toBe(FIXO);
  });

  it("sem armazenamento (aba anônima, bloqueado, ou nenhum), dá um identificador novo e não quebra", () => {
    expect(identificadorDoAparelho(falso(true), () => FIXO)).toBe(FIXO);
    expect(identificadorDoAparelho(null, () => FIXO)).toBe(FIXO);
  });

  it("guardar falhando não impede de devolver o identificador", () => {
    const local = falso();
    local.setItem = () => {
      throw new Error("cheio");
    };
    expect(identificadorDoAparelho(local, () => FIXO)).toBe(FIXO);
  });
});
