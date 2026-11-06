import * as THREE from "three";
import { ANIM, type UniformeResolvido, type VagaElenco } from "@b3d/core";
import { el } from "../comum/dom";
import { ElencoProcedural, type AmostraDoJogador } from "./corpos";

// Vitrine das poses (`tela.html?poses=1`): o jogador feito por código fazendo cada animação, de perfil, em duas filas. Serve para
// conferir o visual e a corrida (`?poses=1&vel=6` muda a velocidade da corrida). Os golpes de uma jogada só repetem em laço.

interface Item {
  nome: string;
  anim: number;
  vel: number;
  goleiro: boolean;
  /** Golpe de uma jogada só: repete a cada 2 s voltando a "parado" no meio. */
  laco: boolean;
}

function itens(velCorrida: number): Item[] {
  return [
    { nome: "Parado", anim: ANIM.parado, vel: 0, goleiro: false, laco: false },
    { nome: "Corrida", anim: ANIM.corrida, vel: velCorrida, goleiro: false, laco: false },
    { nome: "Chute", anim: ANIM.chute, vel: 0, goleiro: false, laco: true },
    { nome: "Passe", anim: ANIM.passe, vel: 0, goleiro: false, laco: true },
    { nome: "Carrinho", anim: ANIM.carrinho, vel: 0, goleiro: false, laco: true },
    { nome: "Queda", anim: ANIM.queda, vel: 0, goleiro: false, laco: true },
    { nome: "Comemoração", anim: ANIM.comemoracao, vel: 0, goleiro: false, laco: false },
    { nome: "Cabeceio", anim: ANIM.cabeceio, vel: 0, goleiro: false, laco: true },
    { nome: "Cobrança", anim: ANIM.cobranca, vel: 0, goleiro: false, laco: false },
    { nome: "Recepção", anim: ANIM.recepcao, vel: 0, goleiro: false, laco: true },
    { nome: "Goleiro parado", anim: ANIM.goleiroParado, vel: 0, goleiro: true, laco: false },
    { nome: "Goleiro com bola", anim: ANIM.goleiroComBola, vel: 0, goleiro: true, laco: false },
    { nome: "Mergulho (esq.)", anim: ANIM.goleiroMergulhoEsq, vel: 0, goleiro: true, laco: true },
    { nome: "Mergulho (dir.)", anim: ANIM.goleiroMergulhoDir, vel: 0, goleiro: true, laco: true },
  ];
}

const LARGURA = 1280;
const ALTURA = 720;

/** Monta a vitrine das poses dentro de `raiz`. */
export function abrirVitrinePoses(raiz: HTMLElement): void {
  const busca = new URLSearchParams(location.search);
  const vel = Math.min(9, Math.max(1, Number(busca.get("vel") ?? 5.5) || 5.5));
  const lista = itens(vel);

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  } catch {
    raiz.replaceChildren(el("p", { class: "aviso" }, "Este navegador não conseguiu abrir o 3D, e a vitrine precisa dele."));
    return;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(LARGURA, ALTURA, false);
  renderer.shadowMap.enabled = true;
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.maxWidth = `${LARGURA}px`;
  renderer.domElement.id = "vitrine-poses";

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14301d);
  scene.add(new THREE.HemisphereLight(0xdfeeff, 0x2f6b3a, 1.1));
  const sol = new THREE.DirectionalLight(0xffffff, 2.2);
  sol.position.set(-6, 12, 9);
  sol.castShadow = true;
  Object.assign(sol.shadow.camera, { left: -14, right: 14, top: 10, bottom: -10, near: 1, far: 40 });
  sol.shadow.mapSize.set(2048, 2048);
  scene.add(sol);
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshStandardMaterial({ color: 0x1f5a2d }));
  chao.rotation.x = -Math.PI / 2;
  chao.receiveShadow = true;
  scene.add(chao);

  const colunas = 7;
  const espaco = 2.9;
  const elenco: VagaElenco[] = lista.map((it, i) => ({
    slot: i,
    time: (i % 2) as 0 | 1,
    numero: 7 + i,
    nome: it.nome,
    humano: false,
    goleiro: it.goleiro,
  }));
  const uniformes: [UniformeResolvido, UniformeResolvido] = [
    { padrao: "listras-verticais", cor1: "#C8102E", cor2: "#F2F2F2", calcao: "#F2F2F2", meiao: "#C8102E" },
    { padrao: "faixa-diagonal", cor1: "#1565C0", cor2: "#FFFFFF", calcao: "#102A5C", meiao: "#1565C0" },
  ];
  const corpos = new ElencoProcedural(elenco, uniformes);
  scene.add(corpos.grupo);

  const posicao = (i: number): [number, number] => {
    const coluna = i % colunas;
    const fila = Math.floor(i / colunas);
    return [(coluna - (colunas - 1) / 2) * espaco, fila === 0 ? -2.6 : 2.6];
  };

  const camera = new THREE.PerspectiveCamera(42, LARGURA / ALTURA, 0.1, 100);
  camera.position.set(0, 6.5, 18.5);
  camera.lookAt(0, 0.9, 0);

  const legenda = el(
    "p",
    { class: "dica-vitrine" },
    `De trás para a frente, da esquerda para a direita: ${lista.map((i) => i.nome).join(", ")}. Corrida a ${vel} m/s (mude com ?poses=1&vel=7).`,
  );
  raiz.replaceChildren(el("h1", {}, "Vitrine das poses do jogador"), legenda, renderer.domElement);

  let anterior = performance.now();
  let tempo = 0;
  const desenhar = (agora: number): void => {
    const dt = Math.min(0.05, (agora - anterior) / 1000);
    anterior = agora;
    tempo += dt;
    const amostras: AmostraDoJogador[] = lista.map((it, i) => {
      const [x, z] = posicao(i);
      const emLaco = it.laco && tempo % 2.2 > 1.4;
      // Corrida: o jogador "anda" no lugar; o que importa é a perna casar com a velocidade
      return { slot: i, x, z, dir: 0, vel: it.vel, anim: emLaco ? ANIM.parado : it.anim };
    });
    corpos.atualizar(amostras, dt);
    renderer.render(scene, camera);
    requestAnimationFrame(desenhar);
  };
  requestAnimationFrame(desenhar);
}
