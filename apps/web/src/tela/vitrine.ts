import * as THREE from "three";
import { TIMES, uniformeReserva, uniformeTitular, type PadraoCamisa, type Time, type UniformeResolvido } from "@b3d/core";
import { el } from "../comum/dom";
import { distintivo } from "../comum/escudo";
import { PADROES, criarMaterialUniforme } from "./uniforme";

// Vitrine dos clubes (`tela.html?vitrine=1`): todos os clubes de times.json lado a lado, com a camisa titular e a reserva
// pintadas pelo mesmo shader do jogo, e os 7 padrões de camisa. Serve para o Samuel ajustar cores e padrões no JSON e
// ver a mudança ao recarregar a página.

const LARGURA = 420;
const ALTURA = 320;

/** Cria (uma vez) o renderizador de fotos e devolve uma função que fotografa um conjunto de uniformes lado a lado. */
function criarFotografo(): (uniformes: UniformeResolvido[]) => string {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(LARGURA, ALTURA, false);

  const camera = new THREE.PerspectiveCamera(28, LARGURA / ALTURA, 0.1, 50);

  return (uniformes) => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x14301d);
    scene.add(new THREE.HemisphereLight(0xdfeeff, 0x2f6b3a, 1.2));
    const sol = new THREE.DirectionalLight(0xffffff, 1.7);
    sol.position.set(2, 4, 5);
    scene.add(sol);

    const chao = new THREE.Mesh(new THREE.PlaneGeometry(20, 6), new THREE.MeshLambertMaterial({ color: 0x1f5a2d }));
    chao.rotation.x = -Math.PI / 2;
    scene.add(chao);

    const n = uniformes.length;
    const espaco = 1.5;
    uniformes.forEach((u, i) => {
      const grupo = new THREE.Group();
      const corpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.0, 6, 24), criarMaterialUniforme(u));
      corpo.position.y = 0.9;
      // De frente e um pouco virado, para a faixa diagonal e as mangas aparecerem
      corpo.rotation.y = -0.5;
      grupo.add(corpo);
      grupo.position.x = (i - (n - 1) / 2) * espaco;
      scene.add(grupo);
    });

    camera.position.set(0, 1.5, 3 + n * 0.9);
    camera.lookAt(0, 0.95, 0);
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL("image/png");
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    return url;
  };
}

function amostraDeCor(hex: string): HTMLElement {
  const a = el("span", { class: "amostra", title: hex });
  a.style.background = hex;
  return a;
}

function linhaDeUniforme(nome: string, u: UniformeResolvido): HTMLElement {
  return el(
    "div",
    { class: "linha-uniforme" },
    el("strong", {}, nome),
    el("span", { class: "padrao-nome" }, u.padrao),
    el("span", { class: "amostras" }, amostraDeCor(u.cor1), amostraDeCor(u.cor2), amostraDeCor(u.calcao), amostraDeCor(u.meiao)),
    el("span", { class: "hexs" }, `${u.cor1} · ${u.cor2}`),
  );
}

function cartaoDoClube(t: Time, foto: (u: UniformeResolvido[]) => string): HTMLElement {
  const titular = uniformeTitular(t);
  const reserva = uniformeReserva(t);
  const img = el("img", { class: "foto", alt: `Camisas do ${t.nome}`, width: String(LARGURA), height: String(ALTURA) });
  img.src = foto([titular, reserva]);
  return el(
    "article",
    { class: "cartao", "data-id": t.id },
    img,
    el("header", {}, distintivo(t), el("div", {}, el("strong", {}, t.nome), el("small", {}, `${t.nomeOficial} · ${t.cidade}`))),
    el("p", { class: "id" }, `id: ${t.id}`),
    linhaDeUniforme("Titular", titular),
    linhaDeUniforme("Reserva", reserva),
  );
}

function cartaoDoPadrao(padrao: PadraoCamisa, foto: (u: UniformeResolvido[]) => string): HTMLElement {
  const u: UniformeResolvido = { padrao, cor1: "#C8102E", cor2: "#F2F2F2", calcao: "#F2F2F2", meiao: "#C8102E" };
  const img = el("img", { class: "foto pequena", alt: `Padrão ${padrao}`, width: String(LARGURA), height: String(ALTURA) });
  img.src = foto([u]);
  return el("article", { class: "cartao padrao" }, img, el("strong", {}, padrao));
}

/** Monta a página da vitrine dentro de `raiz`. */
export function abrirVitrine(raiz: HTMLElement): void {
  let foto: (u: UniformeResolvido[]) => string;
  try {
    foto = criarFotografo();
  } catch {
    raiz.replaceChildren(el("p", { class: "aviso" }, "Este navegador não conseguiu abrir o 3D, e a vitrine precisa dele."));
    return;
  }

  raiz.replaceChildren(
    el("h1", {}, "Vitrine dos clubes"),
    el(
      "p",
      { class: "dica-vitrine" },
      "Cada cartão mostra a camisa titular (esquerda) e a reserva (direita). Para mudar cor ou padrão, edite packages/core/src/dados/times.json e recarregue esta página. ",
      "Os padrões são: liso, listras-verticais, listras-horizontais, faixa-diagonal, faixa-horizontal, metade-vertical e mangas-contraste.",
    ),
    el("div", { class: "grade" }, ...TIMES.map((t) => cartaoDoClube(t, foto))),
    el("h2", {}, "Os 7 padrões de camisa"),
    el("div", { class: "grade" }, ...PADROES.map((p) => cartaoDoPadrao(p, foto))),
  );
}
