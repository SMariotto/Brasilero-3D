import { describe, expect, it } from "vitest";
import { ehEnderecoLocal, lerOrigens, origemPermitida } from "./origens";

const dev = { permitidas: [] as string[], aceitaRedeLocal: true };
const producao = (permitidas: string[] = []) => ({ permitidas, aceitaRedeLocal: false });

describe("lerOrigens", () => {
  it("separa por vírgula, tira espaços e ignora vazio", () => {
    expect(lerOrigens(" https://a.com , https://b.com,, ")).toEqual(["https://a.com", "https://b.com"]);
    expect(lerOrigens(undefined)).toEqual([]);
    expect(lerOrigens("")).toEqual([]);
  });
});

describe("ehEnderecoLocal", () => {
  it("reconhece localhost e as faixas de rede local", () => {
    for (const h of ["localhost", "127.0.0.1", "[::1]", "10.151.86.146", "192.168.0.7", "172.16.0.1", "172.31.255.1", "169.254.1.1", "app.localhost"]) {
      expect(ehEnderecoLocal(h), h).toBe(true);
    }
  });

  it("não confunde endereço público com local", () => {
    for (const h of ["8.8.8.8", "172.32.0.1", "172.15.0.1", "192.169.0.1", "exemplo.com", "meu-10.0.0.1.com", "localhost.exemplo.com"]) {
      expect(ehEnderecoLocal(h), h).toBe(false);
    }
  });
});

describe("origemPermitida", () => {
  it("sem Origin (teste, carga, linha de comando) passa", () => {
    expect(origemPermitida({ origin: undefined, host: "x" }, producao())).toBe(true);
  });

  it("em desenvolvimento aceita localhost e a rede local", () => {
    for (const origin of ["http://localhost:5173", "http://127.0.0.1:5173", "http://192.168.0.10:5173", "http://10.151.86.146:5173"]) {
      expect(origemPermitida({ origin, host: "localhost:8787" }, dev), origin).toBe(true);
    }
  });

  it("em produção localhost e rede local NÃO passam sozinhos", () => {
    expect(origemPermitida({ origin: "http://localhost:5173", host: "servidor.fly.dev" }, producao())).toBe(false);
    expect(origemPermitida({ origin: "http://192.168.0.10", host: "servidor.fly.dev" }, producao())).toBe(false);
  });

  it("site desconhecido é recusado", () => {
    expect(origemPermitida({ origin: "https://site-do-mal.com", host: "localhost:8787" }, dev)).toBe(false);
    expect(origemPermitida({ origin: "https://site-do-mal.com", host: "servidor.fly.dev" }, producao(["https://brasilero3d.vercel.app"]))).toBe(false);
  });

  it("origem da lista passa (ignora maiúsculas e barra no fim)", () => {
    const o = producao(["https://Brasilero3D.vercel.app/"]);
    expect(origemPermitida({ origin: "https://brasilero3d.vercel.app", host: "s.fly.dev" }, o)).toBe(true);
    expect(origemPermitida({ origin: "http://brasilero3d.vercel.app", host: "s.fly.dev" }, o)).toBe(false); // http não é https
  });

  it("padrão com * vale para qualquer subdomínio, mas só no lugar do *", () => {
    const o = producao(["https://*.vercel.app"]);
    expect(origemPermitida({ origin: "https://brasilero3d-git-main.vercel.app", host: "s" }, o)).toBe(true);
    expect(origemPermitida({ origin: "https://vercel.app.mal.com", host: "s" }, o)).toBe(false);
    expect(origemPermitida({ origin: "https://x.y.mal.com/vercel.app", host: "s" }, o)).toBe(false);
  });

  it("ORIGENS=* libera tudo", () => {
    expect(origemPermitida({ origin: "https://qualquer.com", host: "s" }, producao(["*"]))).toBe(true);
  });

  it("mesma origem passa (o site é servido pelo próprio servidor, como no túnel do npm run festa)", () => {
    expect(origemPermitida({ origin: "https://abc-def.trycloudflare.com", host: "abc-def.trycloudflare.com" }, producao())).toBe(true);
    expect(origemPermitida({ origin: "https://abc-def.trycloudflare.com", host: "outro.trycloudflare.com" }, producao())).toBe(false);
  });

  it("Origin esquisito ('null' de página aberta do disco, lixo) é recusado", () => {
    expect(origemPermitida({ origin: "null", host: "localhost:8787" }, dev)).toBe(false);
    expect(origemPermitida({ origin: "isso nao e url", host: "x" }, dev)).toBe(false);
  });
});
