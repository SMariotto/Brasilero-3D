import * as THREE from "three";
import { ANIM, uniformesDaPartida, type VagaElenco } from "@b3d/core";
import { el } from "../comum/dom";
import { FiguraBoneco, obterBoneco, prepararBoneco } from "./boneco";
import { aparenciaDoSlot } from "./boneco-dados";
import { PADROES } from "./uniforme";

// Vitrine do boneco novo (`tela.html?boneco=1`): cada linha é um time (a skin PNG do clube, ou a gerada por código) e cada coluna um
// estado do jogo, feito pelo mesmo caminho da partida (`prepararBoneco` + `FiguraBoneco`) e com a mesma duração do estado no servidor.
//   ?times=vasco,flamengo   os clubes das linhas (a segunda linha é o visitante: troca para a camisa reserva se as cores brigam)
//   ?cam=lado               de perfil (padrão: de frente)
//   ?colunas=0,4            só estas colunas (0 = parado ... 7 = defesa alta), maiores na tela
//   ?h=700                  altura de cada linha, em pixels (padrão 400)
//   ?padrao=faixa-diagonal  veste todos com esse padrão de camisa (e sem skin PNG): mostra a skin gerada por código
//   ?t=0.2                  congela nesse instante (s) do ciclo, para foto

interface Coluna {
  nome: string;
  anim: number;
  goleiro: boolean;
  vel: number;
  /** Quanto tempo (s) o estado dura antes de voltar ao repouso (como no servidor); `Infinity` fica sempre. */
  dura: number;
  /** Onde está a bola em relação ao jogador (x à frente, z à direita, y para cima), se aparecer. */
  bola?: { x: number; y: number; z: number };
}

const COLUNAS: Coluna[] = [
  { nome: "Parado", anim: ANIM.parado, goleiro: false, vel: 0, dura: Infinity },
  { nome: "Corrida (7,6 m/s)", anim: ANIM.corrida, goleiro: false, vel: 7.6, dura: Infinity },
  { nome: "Chute (bola à direita)", anim: ANIM.chute, goleiro: false, vel: 0, dura: 0.3, bola: { x: 0.6, y: 0.11, z: 0.3 } },
  { nome: "Chute (bola à esquerda)", anim: ANIM.chute, goleiro: false, vel: 0, dura: 0.3, bola: { x: 0.6, y: 0.11, z: -0.3 } },
  { nome: "Comemoração", anim: ANIM.comemoracao, goleiro: false, vel: 0, dura: 1.8 },
  { nome: "Goleiro parado", anim: ANIM.goleiroParado, goleiro: true, vel: 0, dura: Infinity },
  { nome: "Mergulho (dir.)", anim: ANIM.goleiroMergulhoDir, goleiro: true, vel: 0, dura: 0.45, bola: { x: 1.5, y: 0.5, z: 1.2 } },
  { nome: "Defesa alta", anim: ANIM.goleiroMergulhoEsq, goleiro: true, vel: 0, dura: 0.45, bola: { x: 0.5, y: 2.2, z: -0.3 } },
];

const LARGURA = 1600;
const CICLO_S = 3;
const ESPACO = 2.7;
/** Cada linha fica numa altura diferente (um chão para cada uma), para uma não aparecer no fundo da outra. */
const DISTANCIA_ENTRE_LINHAS = 100;
const FOV = 22;

/** Monta a vitrine do boneco dentro de `raiz`. */
export async function abrirVitrineBoneco(raiz: HTMLElement): Promise<void> {
  const busca = new URLSearchParams(location.search);
  const ids = (busca.get("times") ?? "vasco,flamengo").split(",").filter(Boolean).slice(0, 2);
  const lado = busca.get("cam") === "lado";
  const altura = Math.min(1000, Math.max(200, Number(busca.get("h")) || 400));
  const escolhidas = busca.has("colunas") ? (busca.get("colunas") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < COLUNAS.length) : COLUNAS.map((_, i) => i);
  const colunas = escolhidas.length ? escolhidas : COLUNAS.map((_, i) => i);
  const congelarEm = busca.has("t") ? Math.max(0, Number(busca.get("t")) || 0) : null;
  const casa = ids[0] ?? "vasco";
  const visitante = ids[1] ?? casa;
  const linhas = ids.length >= 2 ? 2 : 1;

  const aviso = (texto: string): void => raiz.replaceChildren(el("p", { class: "aviso" }, texto));
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  } catch {
    aviso("Este navegador não conseguiu abrir o 3D, e a vitrine precisa dele.");
    return;
  }
  const base = await obterBoneco(import.meta.env.BASE_URL);
  if (!base) {
    aviso("O boneco não carregou (public/boneco/model-brasilero-3d-rig-1malha.glb).");
    return;
  }

  // O elenco de mentira: por linha, uma vaga por coluna (os slots variam o rosto e o cabelo)
  const elenco: VagaElenco[] = [];
  for (let l = 0; l < linhas; l++) colunas.forEach((i, k) => elenco.push({ slot: l * COLUNAS.length + i, time: l as 0 | 1, numero: 1 + k, nome: COLUNAS[i]!.nome, humano: false, goleiro: COLUNAS[i]!.goleiro }));
  const padrao = PADROES.find((p) => p === busca.get("padrao"));
  const [uCasa, uVisitante] = uniformesDaPartida(casa, visitante);
  const uniformes: [typeof uCasa, typeof uVisitante] = padrao ? [{ ...uCasa, padrao }, { ...uVisitante, padrao }] : [uCasa, uVisitante];
  const pronto = await prepararBoneco(base, elenco, uniformes, [casa, visitante]);

  renderer.setPixelRatio(1);
  renderer.setSize(LARGURA, altura * linhas, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setScissorTest(true);
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.maxWidth = `${LARGURA}px`;
  renderer.domElement.id = "vitrine-boneco";

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14301d);
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x2a5a33, 0.95));
  const sol = new THREE.DirectionalLight(0xfff4e0, 2.3);
  sol.position.set(-25, 55, 32);
  scene.add(sol);
  const materialDoChao = new THREE.MeshStandardMaterial({ color: 0x1f5a2d });

  interface Item {
    coluna: Coluna;
    figura: FiguraBoneco;
    x: number;
    z: number;
  }
  const itens: Item[] = [];
  const bolaGeo = new THREE.SphereGeometry(0.11, 16, 12);
  const bolaMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  for (let l = 0; l < linhas; l++) {
    const chao = new THREE.Mesh(new THREE.PlaneGeometry(200, 120), materialDoChao);
    chao.rotation.x = -Math.PI / 2;
    chao.position.y = l * DISTANCIA_ENTRE_LINHAS;
    scene.add(chao);
    colunas.forEach((idx, k) => {
      const coluna = COLUNAS[idx]!;
      const v = elenco[l * colunas.length + k]!; // a vaga desta linha e coluna
      const figura = new FiguraBoneco(base, pronto.materialDoKit(`${v.time}${v.goleiro ? "g" : "l"}`), pronto.cabeloDe(v.slot), aparenciaDoSlot(v.slot).tipoRosto, v.goleiro, v.slot);
      const deslocamento = (k - (colunas.length - 1) / 2) * ESPACO;
      const x = lado ? deslocamento : 0;
      const z = lado ? 0 : deslocamento;
      figura.raiz.position.set(x, l * DISTANCIA_ENTRE_LINHAS, z);
      scene.add(figura.raiz);
      if (coluna.bola) {
        const bola = new THREE.Mesh(bolaGeo, bolaMat);
        bola.position.set(x + coluna.bola.x, l * DISTANCIA_ENTRE_LINHAS + coluna.bola.y, z + coluna.bola.z);
        scene.add(bola);
      }
      itens.push({ coluna, figura, x, z });
    });
  }

  // A câmera afasta o quanto precisa para caber todas as colunas na largura e o boneco inteiro (e o salto) na altura
  const aspecto = LARGURA / altura;
  const tanMeio = Math.tan((FOV / 2) * (Math.PI / 180));
  const metadeDaLargura = ((colunas.length - 1) / 2) * ESPACO + 1.6;
  const distancia = Math.max(metadeDaLargura / (tanMeio * aspecto), 3.1 / (2 * tanMeio));
  const camera = new THREE.PerspectiveCamera(FOV, aspecto, 0.1, 200);
  const desenhar = (): void => {
    for (let l = 0; l < linhas; l++) {
      const y0 = l * DISTANCIA_ENTRE_LINHAS;
      if (lado) camera.position.set(0, y0 + 1.5, distancia);
      else camera.position.set(distancia, y0 + 1.5, 0);
      camera.lookAt(0, y0 + 1, 0);
      const y = (linhas - 1 - l) * altura;
      renderer.setViewport(0, y, LARGURA, altura);
      renderer.setScissor(0, y, LARGURA, altura);
      renderer.render(scene, camera);
    }
  };

  const passo = (dt: number, t: number): void => {
    const u = t % CICLO_S;
    for (const it of itens) {
      const c = it.coluna;
      const ativo = u < c.dura;
      const anim = ativo ? c.anim : c.goleiro ? ANIM.goleiroParado : ANIM.parado;
      // A bola em relação ao jogador (a altura é a do chão: as linhas só ficam em alturas diferentes na cena para não aparecerem uma na outra)
      const bola = c.bola ? { x: it.x + c.bola.x, y: c.bola.y, z: it.z + c.bola.z } : undefined;
      it.figura.atualizar({ anim, vel: ativo ? c.vel : 0, x: it.x, z: it.z, dir: 0 }, dt, bola);
    }
  };

  const nomes = colunas.map((i) => COLUNAS[i]!.nome).join(" · ");
  const quem = linhas === 2 ? `${casa} (casa) em cima e ${visitante} (visitante) embaixo` : casa;
  raiz.replaceChildren(
    el("h1", {}, "Vitrine do boneco"),
    el("p", { class: "dica-vitrine" }, `${quem}. Da esquerda para a direita: ${nomes}. Troque os clubes com ?times=vasco,flamengo; de perfil com &cam=lado; congele com &t=0.2.`),
    renderer.domElement,
  );

  let t = 0;
  if (congelarEm !== null) {
    for (; t < congelarEm; t += 1 / 60) passo(1 / 60, t);
    desenhar();
  } else {
    let anterior = performance.now();
    const quadro = (agora: number): void => {
      const dt = Math.min(0.05, (agora - anterior) / 1000);
      anterior = agora;
      t += dt;
      passo(dt, t);
      desenhar();
      requestAnimationFrame(quadro);
    };
    requestAnimationFrame(quadro);
  }
  (window as unknown as Record<string, unknown>)["__vitrineBonecoPronta"] = { clipes: itens.map((i) => i.figura.clipeAtual), t: Math.round(t * 100) / 100 };
}
