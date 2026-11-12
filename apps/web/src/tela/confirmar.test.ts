import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Confirmacao } from "./confirmar";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function nova(): { c: Confirmacao; redesenhos: () => number } {
  let n = 0;
  const c = new Confirmacao(3000, () => Date.now(), () => n++);
  return { c, redesenhos: () => n };
}

describe("Confirmacao: o primeiro clique arma, o segundo (dentro do prazo) confirma", () => {
  it("um clique só não confirma, e deixa o botão armado e pede para redesenhar", () => {
    const { c, redesenhos } = nova();
    expect(c.pendente(5)).toBe(false);
    expect(c.clicar(5)).toBe(false);
    expect(c.pendente(5)).toBe(true);
    expect(redesenhos()).toBe(1);
  });

  it("o segundo clique dentro de 3 s confirma e desarma", () => {
    const { c } = nova();
    c.clicar(5);
    vi.advanceTimersByTime(2900);
    expect(c.clicar(5)).toBe(true);
    expect(c.pendente(5)).toBe(false);
    // E o próximo clique volta a armar (não expulsa de novo sozinho)
    expect(c.clicar(5)).toBe(false);
  });

  it("passado o prazo o botão volta ao normal sozinho (e pede para redesenhar), e o clique seguinte só arma", () => {
    const { c, redesenhos } = nova();
    c.clicar(5);
    vi.advanceTimersByTime(3000);
    expect(c.pendente(5)).toBe(false);
    expect(redesenhos()).toBe(2); // armou + desarmou
    expect(c.clicar(5)).toBe(false);
  });

  it("armar o botão de outro jogador desarma o primeiro: nunca confirma o jogador errado", () => {
    const { c } = nova();
    c.clicar(5);
    expect(c.clicar(6)).toBe(false);
    expect(c.pendente(5)).toBe(false);
    expect(c.pendente(6)).toBe(true);
    expect(c.clicar(5)).toBe(false); // o 5 voltou a ser o primeiro clique
    expect(c.clicar(6)).toBe(false);
  });

  it("o relógio é o que manda, não o timer: depois do prazo o segundo clique não vale", () => {
    let agora = 0;
    const c = new Confirmacao(3000, () => agora);
    c.clicar(5);
    agora = 3000;
    expect(c.clicar(5)).toBe(false);
  });
});
