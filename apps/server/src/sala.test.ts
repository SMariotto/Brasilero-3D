import { beforeEach, describe, expect, it } from "vitest";
import { CONFIG_PADRAO, SERVIDOR } from "@b3d/core";
import { CanalFalso } from "./canal-falso";
import { Sala, type Jogador } from "./sala";
import { Salas } from "./salas";

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
  sala = new Sala("ABCD", agora, () => `token${contadorToken++}`);
});

/** Entra um controle novo e devolve o canal e o jogador. */
function entrar(apelido = "Sam"): { canal: CanalFalso; jogador: Jogador } {
  const canal = new CanalFalso();
  const r = sala.entrarControle(canal, apelido);
  if (!r.ok) throw new Error(`não entrou: ${r.codigo}`);
  return { canal, jogador: r.valor };
}

describe("entrada de controles", () => {
  it("o primeiro é o Dono e recebe id, token e o lobby", () => {
    const a = entrar("Ana");
    const b = entrar("Beto");
    expect(a.canal.ultimas("bemvindo")[0]).toMatchObject({ papel: "controle", sala: "ABCD", id: 0, token: "token0", dono: true });
    expect(b.canal.ultimas("bemvindo")[0]).toMatchObject({ id: 1, token: "token1", dono: false });
    const lobby = b.canal.ultimoLobby();
    expect(lobby.jogadores.map((j) => [j.apelido, j.dono, j.lado, j.conectado])).toEqual([
      ["Ana", true, "tanto", true],
      ["Beto", false, "tanto", true],
    ]);
    expect(lobby.config).toEqual(CONFIG_PADRAO);
  });

  it("apelido inválido é recusado e ninguém entra", () => {
    const canal = new CanalFalso();
    for (const ruim of ["", "   ", "a".repeat(13), "x\ny"]) {
      const r = sala.entrarControle(canal, ruim);
      expect(r).toMatchObject({ ok: false, codigo: "APELIDO_INVALIDO" });
    }
    expect(sala.quantidadeJogadores).toBe(0);
  });

  it("o 7º controle recebe SALA_CHEIA (3 por time, 6 por sala)", () => {
    for (let i = 0; i < SERVIDOR.maxControlesPorSala; i++) entrar(`J${i}`);
    const r = sala.entrarControle(new CanalFalso(), "Extra");
    expect(r).toMatchObject({ ok: false, codigo: "SALA_CHEIA" });
    expect(sala.quantidadeJogadores).toBe(SERVIDOR.maxControlesPorSala);
  });
});

describe("telões", () => {
  it("o 9º telão recebe TELAS_CHEIAS", () => {
    for (let i = 0; i < SERVIDOR.maxTelasPorSala; i++) expect(sala.entrarTela(new CanalFalso()).ok).toBe(true);
    expect(sala.entrarTela(new CanalFalso())).toMatchObject({ ok: false, codigo: "TELAS_CHEIAS" });
    expect(sala.quantidadeTelas).toBe(8);
  });

  it("o primeiro telão é o principal; ao sair, o mais antigo que sobrou assume", () => {
    const c1 = new CanalFalso();
    const c2 = new CanalFalso();
    const c3 = new CanalFalso();
    const t1 = sala.entrarTela(c1);
    sala.entrarTela(c2);
    sala.entrarTela(c3);
    if (!t1.ok) throw new Error();
    expect(c1.ultimas("bemvindo")[0]?.principal).toBe(true);
    expect(c2.ultimas("bemvindo")[0]?.principal).toBe(false);
    sala.sairTela(t1.valor);
    expect(c2.ultimas("principal")).toEqual([{ t: "principal", valor: true }]);
    expect(c3.ultimas("principal")).toEqual([]);
  });

  it("o lobby chega aos telões com a contagem de telões e de jogadores", () => {
    const tela = new CanalFalso();
    sala.entrarTela(tela);
    entrar("Ana");
    expect(tela.ultimoLobby().jogadores).toHaveLength(1);
    expect(tela.ultimoLobby().telas).toBe(1);
  });

  it("telão que manda comando de controle recebe SEM_PERMISSAO; câmera é aceita sem erro", () => {
    const canal = new CanalFalso();
    const t = sala.entrarTela(canal);
    if (!t.ok) throw new Error();
    sala.tratarTela(t.valor, { t: "camera", modo: "aerea" });
    expect(canal.ultimoErro()).toBeUndefined();
    sala.tratarTela(t.valor, { t: "config", n: 3 });
    expect(canal.ultimoErro()).toBe("SEM_PERMISSAO");
  });
});

describe("lado e pronto", () => {
  it("muda de lado e marca pronto, e todos veem", () => {
    const a = entrar("Ana");
    const b = entrar("Beto");
    sala.tratarControle(a.jogador, { t: "lado", lado: "casa" });
    sala.tratarControle(b.jogador, { t: "lado", lado: "visitante" });
    sala.tratarControle(b.jogador, { t: "pronto", valor: true });
    const j = a.canal.ultimoLobby().jogadores;
    expect(j.map((x) => [x.apelido, x.lado, x.pronto])).toEqual([
      ["Ana", "casa", false],
      ["Beto", "visitante", true],
    ]);
  });

  it("um lado aceita no máximo 3 humanos (LADO_CHEIO); 'tanto faz' sempre cabe", () => {
    const jogadores = Array.from({ length: 4 }, (_, i) => entrar(`J${i}`));
    for (const j of jogadores.slice(0, 3)) sala.tratarControle(j.jogador, { t: "lado", lado: "casa" });
    const quarto = jogadores[3]!;
    sala.tratarControle(quarto.jogador, { t: "lado", lado: "casa" });
    expect(quarto.canal.ultimoErro()).toBe("LADO_CHEIO");
    expect(quarto.jogador.lado).toBe("tanto");
    sala.tratarControle(quarto.jogador, { t: "lado", lado: "visitante" });
    expect(quarto.jogador.lado).toBe("visitante");
  });
});

describe("permissão do Dono", () => {
  it("só o Dono muda a config, começa, pede revanche e volta ao lobby", () => {
    const dono = entrar("Ana");
    const outro = entrar("Beto");

    sala.tratarControle(outro.jogador, { t: "config", n: 3 });
    expect(outro.canal.ultimoErro()).toBe("SEM_PERMISSAO");
    expect(sala.config.n).toBe(5);

    for (const t of ["comecar", "revanche", "lobby"] as const) {
      sala.tratarControle(outro.jogador, { t });
      expect(outro.canal.ultimoErro()).toBe("SEM_PERMISSAO");
      sala.tratarControle(dono.jogador, { t });
    }
    expect(dono.canal.ultimoErro()).toBeUndefined();

    sala.tratarControle(dono.jogador, { t: "config", n: 3, modo: "arena", duracao: 8, dificuldade: "dificil", faltas: false });
    expect(sala.config).toMatchObject({ n: 3, modo: "arena", duracao: 8, dificuldade: "dificil", faltas: false });
    expect(outro.canal.ultimoLobby().config.n).toBe(3);
  });

  it("trocar um clube pelo que está do outro lado troca os dois de lugar", () => {
    const dono = entrar();
    const { casa, visitante } = sala.config;
    sala.tratarControle(dono.jogador, { t: "config", casa: visitante });
    expect(sala.config.casa).toBe(visitante);
    expect(sala.config.visitante).toBe(casa);
    sala.tratarControle(dono.jogador, { t: "config", visitante: visitante });
    expect(sala.config.visitante).toBe(visitante);
    expect(sala.config.casa).toBe(casa);
  });

  it("os dois lados com o mesmo clube na mesma mensagem é recusado", () => {
    const dono = entrar();
    const antes = { ...sala.config };
    sala.tratarControle(dono.jogador, { t: "config", casa: "vasco", visitante: "vasco" });
    expect(dono.canal.ultimoErro()).toBe("MENSAGEM_INVALIDA");
    expect(sala.config).toEqual(antes);
  });
});

describe("queda, reconexão e troca de Dono", () => {
  it("quem cai fica 30 s com a vaga guardada e volta com o token como o mesmo jogador", () => {
    const a = entrar("Ana");
    const b = entrar("Beto");
    sala.tratarControle(b.jogador, { t: "lado", lado: "visitante" });

    sala.desconectarControle(b.jogador, b.canal);
    expect(a.canal.ultimoLobby().jogadores[1]).toMatchObject({ apelido: "Beto", conectado: false });

    avancar(10);
    sala.varrer();
    expect(sala.quantidadeJogadores).toBe(2);

    const novoCanal = new CanalFalso();
    const r = sala.entrarControle(novoCanal, "qualquer", b.jogador.token);
    expect(r.ok).toBe(true);
    expect(novoCanal.ultimas("bemvindo")[0]).toMatchObject({ id: 1, token: b.jogador.token, dono: false });
    expect(a.canal.ultimoLobby().jogadores[1]).toMatchObject({ apelido: "Beto", lado: "visitante", conectado: true });

    // A vaga não vence depois de voltar.
    avancar(60);
    sala.varrer();
    expect(sala.quantidadeJogadores).toBe(2);
  });

  it("o Dono que cai e volta a tempo continua Dono", () => {
    const a = entrar("Ana");
    entrar("Beto");
    sala.desconectarControle(a.jogador, a.canal);
    avancar(29);
    sala.varrer();
    const r = sala.entrarControle(new CanalFalso(), "Ana", a.jogador.token);
    expect(r.ok).toBe(true);
    expect(sala.donoId()).toBe(a.jogador.id);
  });

  it("depois de 30 s a vaga vence e o próximo controle mais antigo vira Dono", () => {
    const a = entrar("Ana");
    const b = entrar("Beto");
    entrar("Caio");
    sala.desconectarControle(a.jogador, a.canal);

    avancar(29);
    sala.varrer();
    expect(sala.donoId()).toBe(a.jogador.id);

    avancar(2);
    sala.varrer();
    expect(sala.quantidadeJogadores).toBe(2);
    expect(sala.donoId()).toBe(b.jogador.id);
    expect(b.canal.ultimoLobby().jogadores.map((j) => [j.apelido, j.dono])).toEqual([
      ["Beto", true],
      ["Caio", false],
    ]);
    // O novo Dono já pode mexer na config.
    sala.tratarControle(b.jogador, { t: "config", n: 4 });
    expect(sala.config.n).toBe(4);
  });

  it("token vencido dá TOKEN_EXPIRADO, e entrar de novo sem token funciona", () => {
    const a = entrar("Ana");
    entrar("Beto");
    sala.desconectarControle(a.jogador, a.canal);
    avancar(31);
    sala.varrer();

    const canal = new CanalFalso();
    expect(sala.entrarControle(canal, "Ana", a.jogador.token)).toMatchObject({ ok: false, codigo: "TOKEN_EXPIRADO" });
    const r = sala.entrarControle(canal, "Ana");
    expect(r.ok).toBe(true);
    expect(r.ok && r.valor.id).not.toBe(a.jogador.id);
  });

  it("token que nunca existiu também dá TOKEN_EXPIRADO", () => {
    entrar("Ana");
    expect(sala.entrarControle(new CanalFalso(), "Ana", "inventado")).toMatchObject({ ok: false, codigo: "TOKEN_EXPIRADO" });
  });

  it("reconectar enquanto a conexão antiga ainda parece aberta derruba a antiga sem perder a vaga", () => {
    const a = entrar("Ana");
    const novo = new CanalFalso();
    sala.entrarControle(novo, "Ana", a.jogador.token);
    expect(a.canal.fechadoCom).toBe(4002);

    // O "close" atrasado da conexão antiga não pode marcar o jogador como desconectado.
    sala.desconectarControle(a.jogador, a.canal);
    expect(novo.ultimoLobby().jogadores[0]).toMatchObject({ conectado: true });
    avancar(60);
    sala.varrer();
    expect(sala.quantidadeJogadores).toBe(1);
  });
});

describe("salas e limpeza", () => {
  it("códigos têm 4 letras do alfabeto sem I e O e não se repetem", () => {
    const salas = new Salas({ maxSalas: 50 });
    const codigos = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const s = salas.criar();
      expect(s?.codigo).toMatch(/^[A-HJ-NP-Z]{4}$/);
      codigos.add(s!.codigo);
    }
    expect(codigos.size).toBe(50);
  });

  it("sorteia de novo quando o código já existe", () => {
    // 1ª sala: AAAA. 2ª sala: sorteia AAAA (já existe), descarta e sorteia BBBB.
    const sequencia = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1];
    let i = 0;
    const salas = new Salas({ maxSalas: 5, sortear: () => sequencia[i++]! });
    expect(salas.criar()?.codigo).toBe("AAAA");
    expect(salas.criar()?.codigo).toBe("BBBB");
  });

  it("respeita o limite de salas do servidor", () => {
    const salas = new Salas({ maxSalas: 2 });
    expect(salas.criar()).not.toBeNull();
    expect(salas.criar()).not.toBeNull();
    expect(salas.criar()).toBeNull();
  });

  it("achar ignora maiúsculas e espaços", () => {
    const salas = new Salas({ maxSalas: 2 });
    const s = salas.criar()!;
    expect(salas.achar(` ${s.codigo.toLowerCase()} `)).toBe(s);
    expect(salas.achar("ZZZZ")).toBeUndefined();
  });

  it("sala com telão conectado não é apagada, por mais tempo que passe", () => {
    const salas = new Salas({ maxSalas: 5, agora });
    const s = salas.criar()!;
    s.entrarTela(new CanalFalso());
    avancar(600);
    salas.varrer();
    expect(salas.total).toBe(1);
    expect(salas.conexoes).toBe(1);
  });

  it("depois que a última conexão cai, a sala some em 120 s", () => {
    const salas = new Salas({ maxSalas: 5, agora });
    const s = salas.criar()!;
    const canalTela = new CanalFalso();
    const t = s.entrarTela(canalTela);
    if (!t.ok) throw new Error();
    const c = new CanalFalso();
    const j = s.entrarControle(c, "Ana");
    if (!j.ok) throw new Error();

    s.sairTela(t.valor);
    s.desconectarControle(j.valor, c);

    avancar(119);
    salas.varrer();
    expect(salas.total).toBe(1);
    avancar(2);
    salas.varrer();
    expect(salas.total).toBe(0);
    expect(salas.achar(s.codigo)).toBeUndefined();
  });

  it("voltar a conectar zera a contagem dos 2 minutos", () => {
    const salas = new Salas({ maxSalas: 5, agora });
    const s = salas.criar()!;
    const t1 = s.entrarTela(new CanalFalso());
    if (!t1.ok) throw new Error();
    s.sairTela(t1.valor);
    avancar(100);
    salas.varrer();
    expect(salas.total).toBe(1);

    const t2 = s.entrarTela(new CanalFalso());
    if (!t2.ok) throw new Error();
    avancar(100);
    salas.varrer();
    expect(salas.total).toBe(1);

    s.sairTela(t2.valor);
    avancar(121);
    salas.varrer();
    expect(salas.total).toBe(0);
  });

  it("sala criada e abandonada (ninguém chegou a entrar) também some em 2 minutos", () => {
    const salas = new Salas({ maxSalas: 5, agora });
    salas.criar();
    avancar(119);
    salas.varrer();
    expect(salas.total).toBe(1);
    avancar(2);
    salas.varrer();
    expect(salas.total).toBe(0);
  });
});
