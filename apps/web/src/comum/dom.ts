// Ajudantes pequenos para montar tela sem biblioteca. Texto sempre entra por textContent (apelidos vêm de outras pessoas).

type Filho = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  atributos: Record<string, string> = {},
  ...filhos: Filho[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(atributos)) {
    if (k === "class") e.className = v;
    else e.setAttribute(k, v);
  }
  for (const f of filhos) {
    if (f === null || f === undefined || f === false) continue;
    e.append(typeof f === "string" ? document.createTextNode(f) : f);
  }
  return e;
}

export function porId<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Faltou #${id} no HTML`);
  return e as T;
}

/** Troca os filhos de um elemento. */
export function trocar(pai: HTMLElement, ...filhos: Filho[]): void {
  pai.replaceChildren(...filhos.filter((f): f is Node | string => f !== null && f !== undefined && f !== false));
}
