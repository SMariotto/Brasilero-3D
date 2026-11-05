import { describe, expect, it } from "vitest";
import { extrairUrlDoTunel, montarLinks, origensDaFesta, wsDoTunel } from "./festa-util.mjs";

describe("extrairUrlDoTunel", () => {
  it("acha o endereço no meio da saída do cloudflared", () => {
    const saida = [
      "2026-11-05T01:02:03Z INF Thank you for trying Cloudflare Tunnel. Doing so, without a Cloudflare account, is a quick way to experiment and try it out.",
      "2026-11-05T01:02:03Z INF Requesting new quick Tunnel on trycloudflare.com...",
      "2026-11-05T01:02:07Z INF +--------------------------------------------------------------------------------------------+",
      "2026-11-05T01:02:07Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |",
      "2026-11-05T01:02:07Z INF |  https://gold-pickup-dentists-corp.trycloudflare.com                                       |",
      "2026-11-05T01:02:07Z INF +--------------------------------------------------------------------------------------------+",
    ].join("\n");
    expect(extrairUrlDoTunel(saida)).toBe("https://gold-pickup-dentists-corp.trycloudflare.com");
  });

  it("ignora o texto 'trycloudflare.com' solto e devolve null enquanto não há endereço", () => {
    expect(extrairUrlDoTunel("INF Requesting new quick Tunnel on trycloudflare.com...")).toBeNull();
    expect(extrairUrlDoTunel("")).toBeNull();
    expect(extrairUrlDoTunel("https://exemplo.com e https://api.trycloudflare.com/tunnel")).toBeNull();
  });

  it("devolve o endereço em minúsculas", () => {
    expect(extrairUrlDoTunel("https://Abc-Def.trycloudflare.com")).toBe("https://abc-def.trycloudflare.com");
  });
});

describe("montarLinks", () => {
  it("o telão e o controle vêm do próprio túnel, com o servidor dentro do ?srv=", () => {
    const l = montarLinks({ tunel: "https://abc-def.trycloudflare.com/" });
    expect(l.ws).toBe("wss://abc-def.trycloudflare.com/ws");
    expect(l.telao).toBe("https://abc-def.trycloudflare.com/tela.html?srv=wss%3A%2F%2Fabc-def.trycloudflare.com%2Fws");
    expect(l.controle).toContain("/controle.html?srv=");
    expect(l.telaoNoSite).toBeUndefined();
  });

  it("com o site da Vercel, também monta o telão por lá apontando para o túnel", () => {
    const l = montarLinks({ tunel: "https://abc-def.trycloudflare.com", siteExterno: "https://brasilero3d.vercel.app/" });
    expect(l.telaoNoSite).toBe("https://brasilero3d.vercel.app/tela.html?srv=wss%3A%2F%2Fabc-def.trycloudflare.com%2Fws");
  });

  it("o endereço do servidor dentro do ?srv= volta igual quando decodificado", () => {
    const l = montarLinks({ tunel: "https://abc-def.trycloudflare.com" });
    expect(new URL(l.telao).searchParams.get("srv")).toBe("wss://abc-def.trycloudflare.com/ws");
  });
});

describe("wsDoTunel e origensDaFesta", () => {
  it("troca https por wss e acrescenta /ws", () => {
    expect(wsDoTunel("https://x-y.trycloudflare.com")).toBe("wss://x-y.trycloudflare.com/ws");
  });

  it("soma o site externo às ORIGENS que já existiam, sem repetir", () => {
    expect(origensDaFesta("https://brasilero3d.vercel.app/", "https://outro.com")).toBe("https://outro.com,https://brasilero3d.vercel.app");
    expect(origensDaFesta("https://a.com", "https://a.com")).toBe("https://a.com");
    expect(origensDaFesta(undefined, undefined)).toBe("");
  });
});
