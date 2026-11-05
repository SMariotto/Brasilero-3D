import { describe, expect, it } from "vitest";
import { escolherServidor, type EntradaEscolha } from "./config";

const base: EntradaEscolha = {
  param: null,
  lembrado: null,
  padrao: undefined,
  desenvolvimento: true,
  protocolo: "http:",
  hostname: "192.168.0.10",
  host: "192.168.0.10:5173",
};

describe("escolherServidor", () => {
  it("em desenvolvimento usa o mesmo host da página na porta 8787 (o celular acha o PC)", () => {
    expect(escolherServidor(base)).toBe("ws://192.168.0.10:8787/ws");
    expect(escolherServidor({ ...base, protocolo: "https:" })).toBe("wss://192.168.0.10:8787/ws");
  });

  it("fora do desenvolvimento, sem padrão, usa o mesmo site (servidor serve o site, como no túnel)", () => {
    const t = { ...base, desenvolvimento: false, protocolo: "https:", hostname: "abc.trycloudflare.com", host: "abc.trycloudflare.com" };
    expect(escolherServidor(t)).toBe("wss://abc.trycloudflare.com/ws");
    expect(escolherServidor({ ...t, protocolo: "http:", host: "localhost:8787" })).toBe("ws://localhost:8787/ws");
  });

  it("VITE_SERVIDOR_PADRAO vale no build (site na Vercel)", () => {
    expect(escolherServidor({ ...base, desenvolvimento: false, padrao: "wss://brasilero3d.fly.dev/ws" })).toBe("wss://brasilero3d.fly.dev/ws");
  });

  it("o que foi lembrado ganha do padrão, e ?srv= ganha de tudo", () => {
    const c = { ...base, padrao: "wss://padrao/ws", lembrado: "wss://lembrado/ws" };
    expect(escolherServidor(c)).toBe("wss://lembrado/ws");
    expect(escolherServidor({ ...c, param: "wss://da-url/ws" })).toBe("wss://da-url/ws");
  });

  it("endereço que não é ws:// ou wss:// é ignorado (nada de http, javascript: ou lixo)", () => {
    expect(escolherServidor({ ...base, param: "https://x.com/ws" })).toBe("ws://192.168.0.10:8787/ws");
    expect(escolherServidor({ ...base, param: "javascript:alert(1)" })).toBe("ws://192.168.0.10:8787/ws");
    expect(escolherServidor({ ...base, param: "wss://com espaço/ws" })).toBe("ws://192.168.0.10:8787/ws");
    expect(escolherServidor({ ...base, lembrado: "lixo", padrao: "wss://padrao/ws" })).toBe("wss://padrao/ws");
  });
});
