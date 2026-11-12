import { beforeEach, describe, expect, it } from "vitest";
import { CanalFalso } from "./canal-falso";
import { Sala, type Jogador, type Tela } from "./sala";

// H7.1: o líder da sala (antes "Dono": o primeiro da lista) e o telão mestre (o PC, que tem a chave). O líder e o PC passam a liderança;
// quando o líder sai, o PC tem 15 s para escolher o novo, ou o celular conectado mais antigo assume.

let tempo = 0;
let contadorToken = 0;
const agora = () => tempo;
const avancar = (segundos: number) => {
  tempo += segundos * 1000;
};

let sala: Sala;

beforeEach(() => {
  tempo = 1_000_000;
  contadorToken = 0;
  sala = new Sala("ABCD", agora, () => `token${contadorToken++}`, { gerarChave: () => "chave-do-pc" });
});

type Entrada = { canal: CanalFalso; jogador: Jogador };

function entrar(apelido = "Sam"): Entrada {
  const canal = new CanalFalso();
  const r = sala.entrarControle(canal, apelido);
  if (!r.ok) throw new Error(`não entrou: ${r.codigo}`);
  return { canal, jogador: r.valor };
}

/** O telão do PC: criou a sala, é o mestre. */
function telaMestre(): { canal: CanalFalso; tela: Tela } {
  const canal = new CanalFalso();
  const r = sala.entrarTela(canal, { criou: true });
  if (!r.ok) throw new Error(r.codigo);
  return { canal, tela: r.valor };
}

/** Um telão que só digitou o código (o de um amigo), ou que apresenta uma chave. */
function telaComChave(chave?: string): { canal: CanalFalso; tela: Tela } {
  const canal = new CanalFalso();
  const r = sala.entrarTela(canal, chave === undefined ? {} : { chave });
  if (!r.ok) throw new Error(r.codigo);
  return { canal, tela: r.valor };
}

const textosDeAviso = (c: CanalFalso): string[] => c.ultimas("aviso").map((a) => a.texto);

describe("quem é o líder", () => {
  it("o primeiro controle é o líder provisório; os outros não", () => {
    const a = entrar("Ana");
    const b = entrar("Beto");
    expect(a.canal.ultimas("bemvindo")[0]).toMatchObject({ dono: true });
    expect(b.canal.ultimas("bemvindo")[0]).toMatchObject({ dono: false });
    expect(sala.donoId()).toBe(a.jogador.id);
    expect(b.canal.ultimoLobby().jogadores.map((j) => [j.apelido, j.dono])).toEqual([
      ["Ana", true],
      ["Beto", false],
    ]);
  });

  it("a liderança é um campo da sala, não a posição na lista: quem entra depois não toma", () => {
    const a = entrar("Ana");
    entrar("Beto");
    entrar("Caio");
    expect(sala.donoId()).toBe(a.jogador.id);
  });

  it("o líder provisório não gera aviso", () => {
    const a = entrar("Ana");
    expect(textosDeAviso(a.canal)).toEqual([]);
  });
});

describe("telão mestre (a chave)", () => {
  it("o telão que criou a sala é o mestre e recebe a chave; a chave não vai para mais ninguém", () => {
    const { canal } = telaMestre();
    expect(canal.ultimas("bemvindo")[0]).toMatchObject({ papel: "tela", mestre: true, chave: "chave-do-pc" });
    const a = entrar("Ana");
    const outra = telaComChave();
    for (const c of [canal, a.canal, outra.canal]) {
      for (const m of c.recebidas) {
        if (m.t === "bemvindo" && m.papel === "tela" && m.mestre === true) continue; // o único bemvindo com a chave
        expect(JSON.stringify(m), `mensagem ${m.t}`).not.toContain("chave-do-pc");
      }
    }
    expect(a.canal.ultimas("bemvindo")[0]).not.toHaveProperty("chave");
  });

  it("o telão que só digitou o código não é mestre e não recebe chave", () => {
    telaMestre();
    const { canal } = telaComChave();
    const bv = canal.ultimas("bemvindo")[0]!;
    expect(bv.mestre).toBe(false);
    expect(bv).not.toHaveProperty("chave");
  });

  it("com a chave certa o telão é mestre de novo (recarregou a página ou caiu e voltou), e a chave só vai uma vez, a quem criou", () => {
    const original = telaMestre();
    sala.sairTela(original.tela); // fechou a aba
    const { canal } = telaComChave("chave-do-pc");
    expect(canal.ultimas("bemvindo")[0]).toMatchObject({ mestre: true });
    expect(canal.ultimas("bemvindo")[0]).not.toHaveProperty("chave");
  });

  it("recarregar enquanto a conexão antiga ainda parece aberta: os dois são mestres, sem perder o poder", () => {
    const antigo = telaMestre();
    const novo = telaComChave("chave-do-pc");
    expect(novo.tela.mestre).toBe(true);
    expect(antigo.tela.mestre).toBe(true);
    sala.sairTela(antigo.tela); // o `close` atrasado da antiga
    sala.tratarTela(novo.tela, { t: "config", n: 3 });
    expect(novo.canal.ultimoErro()).toBeUndefined();
    expect(sala.config.n).toBe(3);
  });

  it("com a chave errada, vazia ou parecida, ou numa sala sem criador, não é mestre", () => {
    telaMestre();
    for (const chave of ["errada", "", "chave-do-pc ", "CHAVE-DO-PC", "chave-do-p"]) {
      expect(telaComChave(chave).tela.mestre, `"${chave}"`).toBe(false);
    }
    // Sala em que nenhum telão criou nada: não existe chave para acertar
    const outra = new Sala("WXYZ", agora, () => "t", { gerarChave: () => "chave-do-pc" });
    const r = outra.entrarTela(new CanalFalso(), { chave: "chave-do-pc" });
    expect(r.ok && r.valor.mestre).toBe(false);
  });

  it("ser mestre não faz o telão ser o principal: o principal continua o mais antigo conectado", () => {
    const extra = telaComChave();
    const mestre = telaMestre();
    expect(extra.canal.ultimas("bemvindo")[0]).toMatchObject({ principal: true, mestre: false });
    expect(mestre.canal.ultimas("bemvindo")[0]).toMatchObject({ principal: false, mestre: true });
  });
});

describe("o que o telão pode", () => {
  it("o mestre faz o que o líder faz na gestão da sala: config, começar, voltar ao lobby e zerar o campeonato", () => {
    const { canal, tela } = telaMestre();
    const a = entrar("Ana");
    sala.tratarTela(tela, { t: "config", n: 3, duracao: 2 });
    expect(canal.ultimoErro()).toBeUndefined();
    expect(sala.config).toMatchObject({ n: 3, duracao: 2 });
    expect(a.canal.ultimoLobby().config.n).toBe(3);

    sala.tratarTela(tela, { t: "comecar" });
    expect(sala.partida).not.toBeNull();
    sala.tratarTela(tela, { t: "config", n: 4 }); // com a partida rolando continua recusado, como para o líder
    expect(canal.ultimoErro()).toBe("MENSAGEM_INVALIDA");
    expect(sala.config.n).toBe(3);

    sala.tratarTela(tela, { t: "lobby" });
    expect(sala.partida).toBeNull();
    expect(a.canal.ultimoLobby().emPartida).toBe(false);

    const antes = a.canal.ultimas("campeonato").length;
    sala.tratarTela(tela, { t: "zerar" });
    expect(a.canal.ultimas("campeonato").length).toBe(antes + 1);
  });

  it("o mestre não manda o que é de quem joga (lado, pronto)", () => {
    const { canal, tela } = telaMestre();
    entrar("Ana");
    sala.tratarTela(tela, { t: "lado", lado: "casa" });
    expect(canal.ultimoErro()).toBe("SEM_PERMISSAO");
    sala.tratarTela(tela, { t: "pronto", valor: true });
    expect(canal.ultimoErro()).toBe("SEM_PERMISSAO");
  });

  it("telão que só assiste: tudo recebe SEM_PERMISSAO (menos a câmera) e a conexão continua aberta", () => {
    telaMestre();
    const { canal, tela } = telaComChave();
    const a = entrar("Ana");
    sala.tratarTela(tela, { t: "camera", modo: "aerea" });
    expect(canal.ultimoErro()).toBeUndefined();
    for (const msg of [{ t: "config", n: 3 }, { t: "comecar" }, { t: "revanche" }, { t: "lobby" }, { t: "zerar" }, { t: "lider", id: a.jogador.id }] as const) {
      sala.tratarTela(tela, msg);
      expect(canal.ultimoErro(), msg.t).toBe("SEM_PERMISSAO");
    }
    expect(canal.ultimas("erro")).toHaveLength(6);
    expect(canal.fechadoCom).toBeNull(); // recusar não derruba o telão
    expect(sala.config.n).toBe(5);
    expect(sala.partida).toBeNull();
    expect(sala.donoId()).toBe(a.jogador.id);
  });

  it("o mestre também esbarra no estado, como o líder: revanche antes de a partida acabar não faz nada", () => {
    const { tela } = telaMestre();
    entrar("Ana");
    sala.tratarTela(tela, { t: "comecar" });
    sala.tratarTela(tela, { t: "revanche" });
    expect(sala.partida?.terminou).toBe(false);
  });
});

describe("passar a liderança (mensagem lider)", () => {
  it("o PC escolhe outro líder: o antigo perde os poderes na hora e todos veem o aviso", () => {
    const { canal: telaCanal, tela } = telaMestre();
    const a = entrar("Ana");
    const b = entrar("Beto");
    const c = entrar("Caio");
    sala.tratarTela(tela, { t: "lider", id: b.jogador.id });
    expect(telaCanal.ultimoErro()).toBeUndefined();
    expect(sala.donoId()).toBe(b.jogador.id);
    expect(c.canal.ultimoLobby().jogadores.map((j) => [j.apelido, j.dono])).toEqual([
      ["Ana", false],
      ["Beto", true],
      ["Caio", false],
    ]);
    // O telão, o antigo e o outro leem "Beto agora é o líder"; o Beto lê "Você é o líder agora"
    const dito = "Beto agora é o líder (escolhido pelo PC).";
    expect(textosDeAviso(telaCanal)).toEqual([dito]);
    expect(textosDeAviso(a.canal)).toEqual([dito]);
    expect(textosDeAviso(c.canal)).toEqual([dito]);
    expect(textosDeAviso(b.canal)).toEqual(["Você é o líder agora (escolhido pelo PC)."]);
    // O antigo não manda mais; o novo manda
    sala.tratarControle(a.jogador, { t: "config", n: 3 });
    expect(a.canal.ultimoErro()).toBe("SEM_PERMISSAO");
    sala.tratarControle(b.jogador, { t: "config", n: 3 });
    expect(sala.config.n).toBe(3);
  });

  it("o líder passa a liderança a um celular conectado", () => {
    const a = entrar("Ana");
    const b = entrar("Beto");
    const { canal: telaCanal } = telaMestre();
    sala.tratarControle(a.jogador, { t: "lider", id: b.jogador.id });
    expect(a.canal.ultimoErro()).toBeUndefined();
    expect(sala.donoId()).toBe(b.jogador.id);
    expect(textosDeAviso(telaCanal)).toEqual(["Beto agora é o líder (Ana passou a liderança)."]);
    expect(textosDeAviso(b.canal)).toEqual(["Você é o líder agora (Ana passou a liderança)."]);
  });

  it("quem não é líder não passa a liderança (o jogador comum recebe SEM_PERMISSAO)", () => {
    const a = entrar("Ana");
    const b = entrar("Beto");
    sala.tratarControle(b.jogador, { t: "lider", id: b.jogador.id });
    expect(b.canal.ultimoErro()).toBe("SEM_PERMISSAO");
    sala.tratarControle(b.jogador, { t: "lider", id: a.jogador.id });
    expect(b.canal.ultimoErro()).toBe("SEM_PERMISSAO");
    expect(sala.donoId()).toBe(a.jogador.id);
  });

  it("passar a quem já é o líder não faz nada: nem erro nem aviso", () => {
    const { canal: telaCanal, tela } = telaMestre();
    const a = entrar("Ana");
    sala.tratarTela(tela, { t: "lider", id: a.jogador.id });
    sala.tratarControle(a.jogador, { t: "lider", id: a.jogador.id });
    expect(telaCanal.ultimoErro()).toBeUndefined();
    expect(a.canal.ultimoErro()).toBeUndefined();
    expect(textosDeAviso(telaCanal)).toEqual([]);
  });

  it("alvo que não existe ou está sem sinal dá ALVO_INVALIDO, que não é fatal, e a liderança fica onde estava", () => {
    const { canal: telaCanal, tela } = telaMestre();
    const a = entrar("Ana");
    const b = entrar("Beto");
    sala.desconectarControle(b.jogador, b.canal);
    sala.tratarTela(tela, { t: "lider", id: b.jogador.id });
    expect(telaCanal.ultimoErro()).toBe("ALVO_INVALIDO");
    sala.tratarTela(tela, { t: "lider", id: 999 });
    expect(telaCanal.ultimas("erro")).toHaveLength(2);
    sala.tratarControle(a.jogador, { t: "lider", id: 999 });
    expect(a.canal.ultimoErro()).toBe("ALVO_INVALIDO");
    sala.tratarControle(a.jogador, { t: "lider", id: b.jogador.id });
    expect(a.canal.ultimas("erro")).toHaveLength(2);
    expect(sala.donoId()).toBe(a.jogador.id);
    expect(telaCanal.fechadoCom).toBeNull();
  });

  it("o líder que caiu: o PC passa a liderança na hora, sem esperar os 30 s; ao voltar o antigo já não é líder", () => {
    const { tela } = telaMestre();
    const a = entrar("Ana");
    const b = entrar("Beto");
    sala.desconectarControle(a.jogador, a.canal);
    expect(sala.donoId()).toBe(a.jogador.id); // cair não troca
    sala.tratarTela(tela, { t: "lider", id: b.jogador.id });
    expect(sala.donoId()).toBe(b.jogador.id);
    avancar(10);
    const volta = new CanalFalso();
    expect(sala.entrarControle(volta, "Ana", a.jogador.token).ok).toBe(true);
    expect(volta.ultimas("bemvindo")[0]).toMatchObject({ dono: false });
    expect(sala.donoId()).toBe(b.jogador.id);
  });
});

describe("o líder sai (a vaga dele vence)", () => {
  function tresControles(): { a: Entrada; b: Entrada; c: Entrada } {
    return { a: entrar("Ana"), b: entrar("Beto"), c: entrar("Caio") };
  }

  it("sem PC mestre conectado, o celular conectado mais antigo assume na hora, com aviso (um telão que só assiste não conta como PC)", () => {
    const { a, b, c } = tresControles();
    telaComChave();
    sala.desconectarControle(a.jogador, a.canal);
    avancar(31);
    sala.varrer();
    expect(sala.donoId()).toBe(b.jogador.id);
    expect(sala.esperandoLider).toBe(false);
    expect(textosDeAviso(c.canal)).toEqual(["Beto agora é o líder (o líder anterior saiu da sala)."]);
    expect(textosDeAviso(b.canal)).toEqual(["Você é o líder agora (o líder anterior saiu da sala)."]);
  });

  it("com o PC mestre conectado, a sala fica sem líder, avisa e dá 15 s para o PC escolher", () => {
    const { canal: telaCanal } = telaMestre();
    const { a, b, c } = tresControles();
    sala.desconectarControle(a.jogador, a.canal);
    avancar(31);
    sala.varrer();
    expect(sala.donoId()).toBeNull();
    expect(sala.esperandoLider).toBe(true);
    expect(c.canal.ultimoLobby().jogadores.some((j) => j.dono)).toBe(false);
    for (const canal of [telaCanal, b.canal, c.canal]) {
      expect(textosDeAviso(canal)).toEqual(["O líder saiu da sala. O PC escolhe o novo líder; em 15 s o mais antigo assume."]);
    }

    // Sem líder, a gestão é recusada para todo celular (com o texto certo); o PC continua mandando
    sala.tratarControle(b.jogador, { t: "config", n: 3 });
    expect(b.canal.ultimoErro()).toBe("SEM_PERMISSAO");
    expect(b.canal.ultimas("erro").at(-1)!.msg).toBe("A sala está sem líder.");
    sala.tratarControle(c.jogador, { t: "comecar" });
    expect(sala.partida).toBeNull();
  });

  it("passados os 15 s sem o PC escolher, o celular conectado mais antigo assume", () => {
    telaMestre();
    const { a, b, c } = tresControles();
    sala.desconectarControle(a.jogador, a.canal);
    avancar(31);
    sala.varrer();
    avancar(14);
    sala.varrer();
    expect(sala.donoId()).toBeNull();
    avancar(1);
    sala.varrer();
    expect(sala.donoId()).toBe(b.jogador.id);
    expect(sala.esperandoLider).toBe(false);
    expect(textosDeAviso(c.canal).at(-1)).toBe("Beto agora é o líder (o líder anterior saiu da sala).");
  });

  it("o PC escolhe dentro dos 15 s: vale a escolha dele e o prazo acaba (ninguém é trocado depois)", () => {
    const { tela } = telaMestre();
    const { a, c } = tresControles();
    sala.desconectarControle(a.jogador, a.canal);
    avancar(31);
    sala.varrer();
    avancar(5);
    sala.tratarTela(tela, { t: "lider", id: c.jogador.id });
    expect(sala.donoId()).toBe(c.jogador.id);
    expect(sala.esperandoLider).toBe(false);
    avancar(120);
    sala.varrer();
    expect(sala.donoId()).toBe(c.jogador.id);
  });

  it("o PC mestre cai durante a espera: o mais antigo assume na hora, sem esperar o prazo", () => {
    const { tela } = telaMestre();
    const { a, b } = tresControles();
    sala.desconectarControle(a.jogador, a.canal);
    avancar(31);
    sala.varrer();
    expect(sala.esperandoLider).toBe(true);
    avancar(3);
    sala.sairTela(tela);
    sala.varrer();
    expect(sala.donoId()).toBe(b.jogador.id);
  });

  it("quem entra durante a espera não vira líder (é candidato como os outros)", () => {
    telaMestre();
    const { a } = tresControles();
    sala.desconectarControle(a.jogador, a.canal);
    avancar(31);
    sala.varrer();
    const novo = entrar("Dani");
    expect(novo.canal.ultimas("bemvindo")[0]).toMatchObject({ dono: false });
    expect(sala.donoId()).toBeNull();
  });

  it("o candidato é o mais antigo CONECTADO: quem está sem sinal é pulado", () => {
    const { a, b, c } = tresControles();
    sala.desconectarControle(a.jogador, a.canal);
    avancar(5);
    sala.desconectarControle(b.jogador, b.canal); // a vaga do Beto ainda não venceu quando a da Ana vence
    avancar(26);
    sala.varrer();
    expect(sala.quantidadeJogadores).toBe(2);
    expect(sala.donoId()).toBe(c.jogador.id);
  });

  it("sem nenhum celular conectado a sala espera, sem prazo, e o próximo a entrar vira o líder provisório", () => {
    telaMestre();
    const a = entrar("Ana");
    sala.desconectarControle(a.jogador, a.canal);
    avancar(31);
    sala.varrer();
    expect(sala.quantidadeJogadores).toBe(0);
    expect(sala.donoId()).toBeNull();
    expect(sala.esperandoLider).toBe(false);
    const novo = entrar("Novo");
    expect(novo.canal.ultimas("bemvindo")[0]).toMatchObject({ dono: true });
    expect(sala.donoId()).toBe(novo.jogador.id);
  });

  it("quem não é líder sai: a liderança não muda", () => {
    telaMestre();
    const a = entrar("Ana");
    const b = entrar("Beto");
    sala.desconectarControle(b.jogador, b.canal);
    avancar(31);
    sala.varrer();
    expect(sala.donoId()).toBe(a.jogador.id);
    expect(sala.esperandoLider).toBe(false);
  });
});
