import { conectar, textoEstado, type EstadoConexao, type OlaSemVersao } from "./conexao";

/** Página de teste da F0: conecta e escreve o estado em #estado. */
export function mostrarConexao(ola: OlaSemVersao): void {
  const el = document.getElementById("estado");
  if (!el) return;
  conectar(ola, (estado: EstadoConexao, detalhe?: string) => {
    el.textContent = detalhe ? `${textoEstado[estado]}: ${detalhe}` : textoEstado[estado];
    el.className = estado;
  });
}
