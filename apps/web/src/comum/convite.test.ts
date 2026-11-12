import { describe, expect, it } from "vitest";
import { enderecoParaMostrar, linkParaEntrar, textoDoConvite } from "./convite";

describe("linkParaEntrar: o link que o celular compartilha", () => {
  it("usa a mesma origem e a mesma página do controle, e só o código da sala", () => {
    expect(linkParaEntrar("http://192.168.0.12:5173/controle.html?sala=ABCD", "ABCD")).toBe("http://192.168.0.12:5173/controle.html?sala=ABCD");
  });

  it("não leva nada além da sala e do servidor: o token e o resto da URL ficam de fora", () => {
    const link = linkParaEntrar("https://festa.example.com/controle.html?sala=ABCD&token=segredo&x=1#fim", "ABCD");
    expect(link).toBe("https://festa.example.com/controle.html?sala=ABCD");
    expect(link).not.toContain("segredo");
  });

  it("mantém o ?srv= (a festa pela internet), que o amigo precisa para achar o servidor", () => {
    const link = linkParaEntrar("https://site.example.com/controle.html?sala=ABCD&srv=wss%3A%2F%2Fsrv.example.com", "ABCD");
    const url = new URL(link);
    expect(url.searchParams.get("sala")).toBe("ABCD");
    expect(url.searchParams.get("srv")).toBe("wss://srv.example.com");
  });

  it("a sala vem do parâmetro, não da URL de agora (a página pode nem ter ?sala=)", () => {
    expect(linkParaEntrar("http://localhost:5173/controle.html", "WXYZ")).toBe("http://localhost:5173/controle.html?sala=WXYZ");
  });

  it("um ?srv= vazio é descartado", () => {
    expect(linkParaEntrar("http://localhost:5173/controle.html?srv=", "ABCD")).toBe("http://localhost:5173/controle.html?sala=ABCD");
  });
});

describe("enderecoParaMostrar e textoDoConvite", () => {
  it("tira o http:// ou https:// só do começo", () => {
    expect(enderecoParaMostrar("https://a.com/controle.html?sala=ABCD")).toBe("a.com/controle.html?sala=ABCD");
    expect(enderecoParaMostrar("http://192.168.0.12:5173/controle.html")).toBe("192.168.0.12:5173/controle.html");
    expect(enderecoParaMostrar("a.com/http://x")).toBe("a.com/http://x");
  });

  it("o texto do convite leva o código", () => {
    expect(textoDoConvite("ABCD")).toContain("ABCD");
  });
});
