import { describe, expect, it } from "vitest";
import { TelaAcesa, type AmbienteDaTela } from "./tela-acesa";
import { deveMostrarDicaDeInstalar, ehAparelhoApple, type DadosDoAparelho } from "./dicas";

function ambienteFalso(opcoes: { semSuporte?: boolean; recusa?: boolean } = {}): AmbienteDaTela & { pedidos: number; soltos: number; visivel: boolean; mudar(): void } {
  let ouvinte: () => void = () => undefined;
  const a = {
    pedidos: 0,
    soltos: 0,
    visivel: true,
    visibilidade: () => (a.visivel ? "visible" : "hidden"),
    aoMudarVisibilidade: (fn: () => void) => {
      ouvinte = fn;
    },
    mudar: () => ouvinte(),
    ...(opcoes.semSuporte
      ? {}
      : {
          wakeLock: {
            request: async () => {
              if (opcoes.recusa) throw new Error("recusado");
              a.pedidos++;
              const ouvintes: Array<() => void> = [];
              return {
                release: async () => {
                  a.soltos++;
                  for (const o of ouvintes) o();
                },
                addEventListener: (_t: "release", fn: () => void) => ouvintes.push(fn),
              };
            },
          },
        }),
  };
  return a as ReturnType<typeof ambienteFalso>;
}

const espera = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("TelaAcesa", () => {
  it("liga e desliga o bloqueio de tela", async () => {
    const amb = ambienteFalso();
    const t = new TelaAcesa(amb);
    t.ligar();
    await espera();
    expect(amb.pedidos).toBe(1);
    expect(t.ativo).toBe(true);
    t.desligar();
    await espera();
    expect(amb.soltos).toBe(1);
    expect(t.ativo).toBe(false);
  });

  it("pede de novo quando a aba volta (o navegador solta o bloqueio ao esconder)", async () => {
    const amb = ambienteFalso();
    const t = new TelaAcesa(amb);
    t.ligar();
    await espera();
    // O navegador soltou o bloqueio por conta própria
    amb.visivel = false;
    (t as unknown as { sentinela: null }).sentinela = null;
    amb.mudar();
    await espera();
    expect(amb.pedidos).toBe(1); // escondida: não pede
    amb.visivel = true;
    amb.mudar();
    await espera();
    expect(amb.pedidos).toBe(2);
  });

  it("não pede duas vezes seguidas", async () => {
    const amb = ambienteFalso();
    const t = new TelaAcesa(amb);
    t.ligar();
    t.ligar();
    await espera();
    expect(amb.pedidos).toBe(1);
  });

  it("sem suporte ou com pedido recusado, o jogo segue sem erro", async () => {
    for (const opcoes of [{ semSuporte: true }, { recusa: true }]) {
      const amb = ambienteFalso(opcoes);
      const t = new TelaAcesa(amb);
      expect(() => t.ligar()).not.toThrow();
      await espera();
      expect(t.ativo).toBe(false);
      expect(() => t.desligar()).not.toThrow();
    }
  });

  it("se desligar enquanto o pedido está no ar, solta o bloqueio assim que ele chega", async () => {
    const amb = ambienteFalso();
    const t = new TelaAcesa(amb);
    t.ligar();
    t.desligar();
    await espera();
    expect(t.ativo).toBe(false);
    expect(amb.soltos).toBe(1);
  });
});

describe("dica de instalar no iPhone", () => {
  const iphone: DadosDoAparelho = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari", plataforma: "iPhone", pontosDeToque: 5, instalado: false };
  const android: DadosDoAparelho = { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120", plataforma: "Linux armv8l", pontosDeToque: 5, instalado: false };
  const ipadComoMac: DadosDoAparelho = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari", plataforma: "MacIntel", pontosDeToque: 5, instalado: false };
  const mac: DadosDoAparelho = { ...ipadComoMac, pontosDeToque: 0 };

  it("reconhece iPhone e iPad (que se apresenta como Mac), mas não Android nem Mac de verdade", () => {
    expect(ehAparelhoApple(iphone)).toBe(true);
    expect(ehAparelhoApple(ipadComoMac)).toBe(true);
    expect(ehAparelhoApple(android)).toBe(false);
    expect(ehAparelhoApple(mac)).toBe(false);
  });

  it("só aparece no iPhone ainda não instalado e não dispensado", () => {
    expect(deveMostrarDicaDeInstalar(iphone, false)).toBe(true);
    expect(deveMostrarDicaDeInstalar({ ...iphone, instalado: true }, false)).toBe(false);
    expect(deveMostrarDicaDeInstalar(iphone, true)).toBe(false);
    expect(deveMostrarDicaDeInstalar(android, false)).toBe(false);
  });
});
