import { beforeEach, describe, expect, it } from "vitest";
import { SERVIDOR, type DonosMsg, type PartidaMsg } from "@b3d/core";
import { CanalFalso } from "./canal-falso";
import { Sala, type Jogador, type Tela } from "./sala";

// H7.2: expulsar. O líder (pelo celular) e o PC mestre (pelo lobby do telão) tiram um controle da sala; o aparelho dele fica bloqueado
// até a sala fechar, pelo identificador que o celular manda no `ola`; o fechamento é o 4005, que o site não reconecta sozinho.

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

function entrar(apelido: string, aparelho?: string): Entrada {
  const canal = new CanalFalso();
  const r = sala.entrarControle(canal, apelido, undefined, aparelho);
  if (!r.ok) throw new Error(`não entrou: ${r.codigo}`);
  return { canal, jogador: r.valor };
}

function telaMestre(): { canal: CanalFalso; tela: Tela } {
  const canal = new CanalFalso();
  const r = sala.entrarTela(canal, { criou: true });
  if (!r.ok) throw new Error(r.codigo);
  return { canal, tela: r.valor };
}

function telaVisitante(): { canal: CanalFalso; tela: Tela } {
  const canal = new CanalFalso();
  const r = sala.entrarTela(canal);
  if (!r.ok) throw new Error(r.codigo);
  return { canal, tela: r.valor };
}

const avisos = (c: CanalFalso): string[] => c.ultimas("aviso").map((a) => a.texto);
const AP = (n: number): string => n.toString(16).padStart(32, "0"); // identificadores de aparelho de mentira

describe("quem pode expulsar", () => {
  it("o PC mestre expulsa no lobby: sai da lista, recebe EXPULSO e o fechamento 4005, e todos os outros veem o aviso", () => {
    const pc = telaMestre();
    const ana = entrar("Ana", AP(1));
    const beto = entrar("Beto", AP(2));
    const caio = entrar("Caio", AP(3));

    sala.tratarTela(pc.tela, { t: "expulsar", id: beto.jogador.id });

    expect(pc.canal.ultimoErro()).toBeUndefined();
    expect(sala.quantidadeJogadores).toBe(2);
    expect(caio.canal.ultimoLobby().jogadores.map((j) => j.apelido)).toEqual(["Ana", "Caio"]);
    // O expulso: o erro fatal e depois o fechamento 4005 (o site não reconecta com ele)
    expect(beto.canal.recebidas.at(-1)).toMatchObject({ t: "erro", codigo: "EXPULSO" });
    expect(beto.canal.fechadoCom).toBe(4005);
    // Os outros leem o aviso; o expulso não recebe aviso nem lobby depois de sair
    for (const c of [pc.canal, ana.canal, caio.canal]) expect(avisos(c)).toEqual(["Removido da sala: Beto."]);
    expect(avisos(beto.canal)).toEqual([]);
    expect(beto.canal.ultimas("lobby").at(-1)!.jogadores.some((j) => j.apelido === "Beto")).toBe(true); // o último lobby dele é o de antes
  });

  it("o líder expulsa pelo celular; o jogador comum e o telão que só assiste recebem SEM_PERMISSAO e ninguém sai", () => {
    const ana = entrar("Ana");
    const beto = entrar("Beto");
    const caio = entrar("Caio");
    const visitante = telaVisitante();
    telaMestre();

    sala.tratarControle(beto.jogador, { t: "expulsar", id: caio.jogador.id });
    expect(beto.canal.ultimoErro()).toBe("SEM_PERMISSAO");
    sala.tratarTela(visitante.tela, { t: "expulsar", id: caio.jogador.id });
    expect(visitante.canal.ultimoErro()).toBe("SEM_PERMISSAO");
    expect(visitante.canal.fechadoCom).toBeNull();
    expect(sala.quantidadeJogadores).toBe(3);

    sala.tratarControle(ana.jogador, { t: "expulsar", id: caio.jogador.id });
    expect(ana.canal.ultimoErro()).toBeUndefined();
    expect(sala.quantidadeJogadores).toBe(2);
    expect(caio.canal.fechadoCom).toBe(4005);
  });

  it("o líder não se expulsa; o PC pode expulsar o líder", () => {
    const pc = telaMestre();
    const ana = entrar("Ana");
    entrar("Beto");
    sala.tratarControle(ana.jogador, { t: "expulsar", id: ana.jogador.id });
    expect(ana.canal.ultimoErro()).toBe("SEM_PERMISSAO");
    expect(sala.quantidadeJogadores).toBe(2);
    expect(ana.canal.fechadoCom).toBeNull();

    sala.tratarTela(pc.tela, { t: "expulsar", id: ana.jogador.id });
    expect(sala.quantidadeJogadores).toBe(1);
    expect(ana.canal.fechadoCom).toBe(4005);
  });

  it("alvo que não existe (ou que já saiu) dá ALVO_INVALIDO, que não é fatal; expulsar duas vezes o mesmo não quebra", () => {
    const pc = telaMestre();
    const ana = entrar("Ana");
    const beto = entrar("Beto");
    sala.tratarTela(pc.tela, { t: "expulsar", id: 999 });
    expect(pc.canal.ultimoErro()).toBe("ALVO_INVALIDO");
    sala.tratarControle(ana.jogador, { t: "expulsar", id: 999 });
    expect(ana.canal.ultimoErro()).toBe("ALVO_INVALIDO");

    sala.tratarTela(pc.tela, { t: "expulsar", id: beto.jogador.id });
    sala.tratarControle(ana.jogador, { t: "expulsar", id: beto.jogador.id }); // o líder pede logo depois: já saiu
    expect(ana.canal.ultimoErro()).toBe("ALVO_INVALIDO");
    expect(sala.quantidadeJogadores).toBe(1);
    expect(pc.canal.fechadoCom).toBeNull();
  });

  it("expulsar quem está sem sinal funciona e libera a vaga na hora, sem esperar os 30 s", () => {
    const pc = telaMestre();
    entrar("Ana");
    const beto = entrar("Beto", AP(2));
    sala.desconectarControle(beto.jogador, beto.canal);
    expect(sala.quantidadeJogadores).toBe(2);
    sala.tratarTela(pc.tela, { t: "expulsar", id: beto.jogador.id });
    expect(sala.quantidadeJogadores).toBe(1);
    expect(pc.canal.ultimoErro()).toBeUndefined();
    // Mesmo sem conexão para avisar, o aparelho dele fica bloqueado
    expect(sala.entrarControle(new CanalFalso(), "Beto", undefined, AP(2))).toMatchObject({ ok: false, codigo: "EXPULSO" });
  });
});

describe("bloqueio do aparelho até a sala fechar", () => {
  it("o expulso não entra de novo com o mesmo aparelho, com ou sem o token antigo; com o código EXPULSO", () => {
    const pc = telaMestre();
    entrar("Ana", AP(1));
    const beto = entrar("Beto", AP(2));
    sala.tratarTela(pc.tela, { t: "expulsar", id: beto.jogador.id });

    expect(sala.entrarControle(new CanalFalso(), "Beto", undefined, AP(2))).toMatchObject({ ok: false, codigo: "EXPULSO" });
    expect(sala.entrarControle(new CanalFalso(), "Outro nome", undefined, AP(2))).toMatchObject({ ok: false, codigo: "EXPULSO" });
    expect(sala.entrarControle(new CanalFalso(), "Beto", beto.jogador.token, AP(2))).toMatchObject({ ok: false, codigo: "EXPULSO" });
    expect(sala.quantidadeJogadores).toBe(1);
  });

  it("o token do expulso morreu: sem o aparelho dá TOKEN_EXPIRADO; com outro aparelho entra como jogador novo", () => {
    const pc = telaMestre();
    entrar("Ana", AP(1));
    const beto = entrar("Beto", AP(2));
    sala.tratarTela(pc.tela, { t: "expulsar", id: beto.jogador.id });

    expect(sala.entrarControle(new CanalFalso(), "Beto", beto.jogador.token)).toMatchObject({ ok: false, codigo: "TOKEN_EXPIRADO" });
    // Limitação combinada com o Samuel: quem limpa os dados do navegador (ou vem sem identificador) volta
    const outro = sala.entrarControle(new CanalFalso(), "Beto", undefined, AP(9));
    expect(outro.ok && outro.valor.id).not.toBe(beto.jogador.id);
    expect(sala.entrarControle(new CanalFalso(), "Beto").ok).toBe(true);
  });

  it("o bloqueio dura até a sala fechar: nem o tempo nem a limpeza do servidor o tiram", () => {
    const pc = telaMestre();
    entrar("Ana", AP(1));
    const beto = entrar("Beto", AP(2));
    sala.tratarTela(pc.tela, { t: "expulsar", id: beto.jogador.id });
    avancar(60 * 60 * 3);
    sala.varrer();
    expect(sala.entrarControle(new CanalFalso(), "Beto", undefined, AP(2))).toMatchObject({ ok: false, codigo: "EXPULSO" });
  });

  it("só o aparelho do expulso é bloqueado: os outros entram, e o de quem saiu por conta própria também", () => {
    const pc = telaMestre();
    entrar("Ana", AP(1));
    const beto = entrar("Beto", AP(2));
    const caio = entrar("Caio", AP(3));
    sala.desconectarControle(caio.jogador, caio.canal);
    avancar(40);
    sala.varrer(); // a vaga do Caio venceu: ele saiu, não foi expulso
    sala.tratarTela(pc.tela, { t: "expulsar", id: beto.jogador.id });

    expect(sala.entrarControle(new CanalFalso(), "Caio", undefined, AP(3)).ok).toBe(true);
    expect(sala.entrarControle(new CanalFalso(), "Dani", undefined, AP(4)).ok).toBe(true);
  });

  it("se o jogador voltou com outro aparelho (pelo token), o bloqueio vale para o aparelho de agora, não para o antigo", () => {
    const pc = telaMestre();
    entrar("Ana", AP(1));
    const beto = entrar("Beto", AP(2));
    sala.desconectarControle(beto.jogador, beto.canal);
    expect(sala.entrarControle(new CanalFalso(), "Beto", beto.jogador.token, AP(7)).ok).toBe(true);
    sala.tratarTela(pc.tela, { t: "expulsar", id: beto.jogador.id });

    expect(sala.entrarControle(new CanalFalso(), "Beto", undefined, AP(7))).toMatchObject({ ok: false, codigo: "EXPULSO" });
    expect(sala.entrarControle(new CanalFalso(), "Beto", undefined, AP(2)).ok).toBe(true);
  });

  it("expulso sem identificador (página velha, armazenamento bloqueado) sai, mas não há o que bloquear: ninguém fica bloqueado por engano", () => {
    const pc = telaMestre();
    entrar("Ana", AP(1));
    const beto = entrar("Beto");
    sala.tratarTela(pc.tela, { t: "expulsar", id: beto.jogador.id });
    expect(sala.quantidadeJogadores).toBe(1);
    expect(sala.entrarControle(new CanalFalso(), "Beto").ok).toBe(true);
    expect(sala.entrarControle(new CanalFalso(), "Dani", undefined, AP(5)).ok).toBe(true);
  });

  it("o identificador do aparelho não aparece em nenhuma mensagem para ninguém", () => {
    const pc = telaMestre();
    const ana = entrar("Ana", AP(1));
    const beto = entrar("Beto", AP(2));
    sala.tratarTela(pc.tela, { t: "expulsar", id: beto.jogador.id });
    for (const c of [pc.canal, ana.canal, beto.canal]) {
      for (const m of c.recebidas) {
        for (const ap of [AP(1), AP(2)]) expect(JSON.stringify(m), `mensagem ${m.t}`).not.toContain(ap);
      }
    }
  });
});

describe("expulsar no meio da partida", () => {
  function partidaComTres(): { pc: ReturnType<typeof telaMestre>; ana: Entrada; beto: Entrada; caio: Entrada } {
    const pc = telaMestre();
    const ana = entrar("Ana", AP(1));
    const beto = entrar("Beto", AP(2));
    const caio = entrar("Caio", AP(3));
    sala.tratarControle(ana.jogador, { t: "comecar" });
    expect(sala.partida).not.toBeNull();
    return { pc, ana, beto, caio };
  }

  it("o jogador que ele controlava vira bot na hora, a lista de donos e o elenco são reenviados, e a partida segue", () => {
    const { pc, ana, beto, caio } = partidaComTres();
    const slotDele = beto.jogador.slot!;
    expect(sala.partida!.slotDoHumano(beto.jogador.id)).toBe(slotDele);

    sala.tratarTela(pc.tela, { t: "expulsar", id: beto.jogador.id });

    expect(sala.partida!.slotDoHumano(beto.jogador.id)).toBeNull();
    expect(sala.partida!.jogador(slotDele)!.vaga.humano).toBe(false);
    const donos = (caio.canal.ultimas("donos").at(-1) as DonosMsg).donos;
    expect(donos.map((d) => d.nome).sort()).toEqual(["Ana", "Caio"]);
    const partida = caio.canal.ultimas("partida").at(-1) as PartidaMsg;
    expect(partida.elenco.find((v) => v.slot === slotDele)).toMatchObject({ humano: false });
    expect(caio.canal.ultimoLobby()).toMatchObject({ emPartida: true });
    expect(caio.canal.ultimoLobby().jogadores.map((j) => j.apelido)).toEqual(["Ana", "Caio"]);
    // Quem ficou continua com o jogador dele e a partida continua rodando
    expect(sala.partida!.slotDoHumano(ana.jogador.id)).toBe(ana.jogador.slot);
    const tick = sala.partida!.tick;
    for (let i = 0; i < 120; i++) {
      avancar(0.017);
      sala.avancar();
    }
    expect(sala.partida!.tick).toBeGreaterThan(tick);
    expect(beto.canal.fechadoCom).toBe(4005);
  });

  it("o líder também expulsa durante a partida", () => {
    const { ana, beto } = partidaComTres();
    sala.tratarControle(ana.jogador, { t: "expulsar", id: beto.jogador.id });
    expect(sala.partida!.slotDoHumano(beto.jogador.id)).toBeNull();
    expect(sala.quantidadeJogadores).toBe(2);
  });

  it("expulsar quem estava sem sinal na partida (um bot já jogava por ele) tira o humano de vez", () => {
    const { pc, beto } = partidaComTres();
    const slot = beto.jogador.slot!;
    sala.desconectarControle(beto.jogador, beto.canal);
    sala.tratarTela(pc.tela, { t: "expulsar", id: beto.jogador.id });
    expect(sala.quantidadeJogadores).toBe(2);
    expect(sala.partida!.controle.humano(beto.jogador.id)).toBeUndefined();
    expect(sala.partida!.jogador(slot)!.vaga.humano).toBe(false);
  });

  it("o `close` atrasado do WebSocket do expulso não faz nada (ele já saiu da lista): sem lobby novo, sem 'ausente' na partida", () => {
    const { pc, caio, beto } = partidaComTres();
    sala.tratarTela(pc.tela, { t: "expulsar", id: beto.jogador.id });
    const lobbies = caio.canal.ultimas("lobby").length;
    const donos = caio.canal.ultimas("donos").length;
    sala.desconectarControle(beto.jogador, beto.canal); // é o que o servidor faz quando o `close` chega
    expect(caio.canal.ultimas("lobby").length).toBe(lobbies);
    expect(caio.canal.ultimas("donos").length).toBe(donos);
    expect(sala.quantidadeJogadores).toBe(2);
    expect(sala.partida!.controle.humano(beto.jogador.id)).toBeUndefined();
  });
});

describe("expulsar o líder", () => {
  it("com o PC mestre: a sala fica sem líder, o PC tem 15 s e depois o celular conectado mais antigo assume", () => {
    const pc = telaMestre();
    const ana = entrar("Ana");
    const beto = entrar("Beto");
    const caio = entrar("Caio");
    sala.tratarTela(pc.tela, { t: "expulsar", id: ana.jogador.id });

    expect(sala.donoId()).toBeNull();
    expect(sala.esperandoLider).toBe(true);
    expect(caio.canal.ultimoLobby().jogadores.some((j) => j.dono)).toBe(false);
    expect(avisos(beto.canal)).toEqual(["Removido da sala: Ana.", "O líder saiu da sala. O PC escolhe o novo líder; em 15 s o mais antigo assume."]);

    avancar(15);
    sala.varrer();
    expect(sala.donoId()).toBe(beto.jogador.id);
    expect(avisos(caio.canal).at(-1)).toBe("Beto agora é o líder (o líder anterior saiu da sala).");
  });

  it("o PC escolhe o novo líder dentro dos 15 s", () => {
    const pc = telaMestre();
    const ana = entrar("Ana");
    entrar("Beto");
    const caio = entrar("Caio");
    sala.tratarTela(pc.tela, { t: "expulsar", id: ana.jogador.id });
    sala.tratarTela(pc.tela, { t: "lider", id: caio.jogador.id });
    expect(sala.donoId()).toBe(caio.jogador.id);
    avancar(60);
    sala.varrer();
    expect(sala.donoId()).toBe(caio.jogador.id);
  });

  it("o PC cai durante a espera depois de expulsar o líder: o celular conectado mais antigo assume na hora", () => {
    const pc = telaMestre();
    const ana = entrar("Ana");
    const beto = entrar("Beto");
    entrar("Caio");
    sala.tratarTela(pc.tela, { t: "expulsar", id: ana.jogador.id });
    expect(sala.esperandoLider).toBe(true);
    avancar(3);
    sala.sairTela(pc.tela);
    sala.varrer();
    expect(sala.donoId()).toBe(beto.jogador.id);
    expect(sala.esperandoLider).toBe(false);
  });

  it("quem não é líder é expulso: a liderança não muda e não há espera", () => {
    const pc = telaMestre();
    const ana = entrar("Ana");
    const beto = entrar("Beto");
    sala.tratarTela(pc.tela, { t: "expulsar", id: beto.jogador.id });
    expect(sala.donoId()).toBe(ana.jogador.id);
    expect(sala.esperandoLider).toBe(false);
  });

  it("expulsar o único celular da sala: a sala espera sem prazo e o próximo que entrar vira o líder provisório", () => {
    const pc = telaMestre();
    const ana = entrar("Ana", AP(1));
    sala.tratarTela(pc.tela, { t: "expulsar", id: ana.jogador.id });
    expect(sala.quantidadeJogadores).toBe(0);
    expect(sala.donoId()).toBeNull();
    expect(sala.esperandoLider).toBe(false);
    const novo = entrar("Novo", AP(2));
    expect(novo.canal.ultimas("bemvindo")[0]).toMatchObject({ dono: true });
  });
});

describe("sala cheia", () => {
  it("com 6 controles o 7º recebe SALA_CHEIA; expulsar um abre a vaga na hora", () => {
    const pc = telaMestre();
    const todos = Array.from({ length: SERVIDOR.maxControlesPorSala }, (_, i) => entrar(`J${i}`, AP(i + 1)));
    expect(sala.entrarControle(new CanalFalso(), "Sétimo", undefined, AP(50))).toMatchObject({ ok: false, codigo: "SALA_CHEIA" });
    sala.tratarTela(pc.tela, { t: "expulsar", id: todos[3]!.jogador.id });
    expect(sala.entrarControle(new CanalFalso(), "Sétimo", undefined, AP(50)).ok).toBe(true);
    // O expulso, mesmo com a sala agora com vaga, continua de fora
    expect(sala.entrarControle(new CanalFalso(), "J3", undefined, AP(4))).toMatchObject({ ok: false, codigo: "EXPULSO" });
  });
});
