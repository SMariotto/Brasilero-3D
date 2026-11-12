import { describe, expect, it } from "vitest";
import type { JogadorLobby } from "@b3d/core";
import { podeExpulsar, podeTornarLider, salaSemLider } from "./lider";

const jogador = (id: number, extra: Partial<JogadorLobby> = {}): JogadorLobby => ({ id, apelido: `J${id}`, lado: "tanto", pronto: false, dono: false, conectado: true, ...extra });

describe("salaSemLider", () => {
  it("com líder, não", () => {
    expect(salaSemLider([jogador(0, { dono: true }), jogador(1)])).toBe(false);
  });

  it("sem líder e com celular conectado, sim (o PC precisa escolher)", () => {
    expect(salaSemLider([jogador(1), jogador(2)])).toBe(true);
  });

  it("sem ninguém conectado, ou sem ninguém na sala, não: o próximo que entrar vira o líder", () => {
    expect(salaSemLider([])).toBe(false);
    expect(salaSemLider([jogador(1, { conectado: false })])).toBe(false);
  });

  it("o líder que está sem sinal ainda é o líder (cair não troca): não é sala sem líder", () => {
    expect(salaSemLider([jogador(0, { dono: true, conectado: false }), jogador(1)])).toBe(false);
  });
});

describe("podeTornarLider", () => {
  it("só o PC mestre, num celular conectado que ainda não é o líder", () => {
    expect(podeTornarLider(jogador(1), true)).toBe(true);
    expect(podeTornarLider(jogador(1), false)).toBe(false); // telão que só assiste
    expect(podeTornarLider(jogador(1, { dono: true }), true)).toBe(false); // já é o líder
    expect(podeTornarLider(jogador(1, { conectado: false }), true)).toBe(false); // sem sinal
  });
});

describe("podeExpulsar", () => {
  it("só o PC mestre vê o botão, em qualquer controle: o líder, quem está sem sinal e os outros", () => {
    for (const j of [jogador(1), jogador(2, { dono: true }), jogador(3, { conectado: false })]) {
      expect(podeExpulsar(j, true), j.apelido).toBe(true);
      expect(podeExpulsar(j, false), j.apelido).toBe(false); // telão que só assiste
    }
  });
});
