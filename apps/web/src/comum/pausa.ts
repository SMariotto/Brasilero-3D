// O que cada tela mostra quando a partida está pausada (H7.3). Lógica pura, sem DOM, com teste; vale para o telão e para o celular (por isso
// fica em `comum/`: o controle nunca importa nada de `src/tela/`).

/** Quem pausou: o `lider` (celular) ou a `tela` (o PC, telão mestre). É o que o servidor manda em `lobby.pausadaPor`. */
export type QuemPausou = "lider" | "tela";

/** Quem está olhando: o PC (telão mestre), um telão que só assiste, o líder (celular) ou um jogador comum (celular). */
export type PapelNaPausa = "pc" | "telao" | "lider" | "jogador";

export interface VisaoDaPausa {
  visivel: boolean;
  titulo: string;
  detalhe: string;
  /** Mostra o botão "Retomar"? Só para quem o servidor deixa retomar: o PC (qualquer pausa) e o líder (a pausa que ele mesmo fez). */
  botaoRetomar: boolean;
}

const SEM_PAUSA: VisaoDaPausa = { visivel: false, titulo: "", detalhe: "", botaoRetomar: false };

/**
 * O PC retoma qualquer pausa; o líder retoma a que ele fez e, se o PC pausou e ficou sem sinal por 30 s (`lobby.pausaSemPc`, H7.4a), a do
 * PC também; fora isso a do PC ele não passa por cima (`PAUSA_DO_TELAO`); o resto nunca retoma.
 */
export function podeRetomar(papel: PapelNaPausa, por: QuemPausou | undefined, pcSemSinal = false): boolean {
  if (papel === "pc") return true;
  return papel === "lider" && (por === "lider" || (por === "tela" && pcSemSinal));
}

/** O texto e o botão da tela de pausa para quem está olhando. Sem pausa, nada aparece. */
export function visaoDaPausa(pausada: boolean, por: QuemPausou | undefined, papel: PapelNaPausa, pcSemSinal = false): VisaoDaPausa {
  if (!pausada) return SEM_PAUSA;
  const quem = por === "tela" ? "pelo PC" : "pelo líder";
  const semPc = por === "tela" && pcSemSinal;
  const botaoRetomar = podeRetomar(papel, por, pcSemSinal);
  let detalhe: string;
  if (papel === "pc") detalhe = por === "tela" ? "Você pausou o jogo." : "O líder pausou o jogo. Você pode retomar.";
  else if (papel === "lider") {
    if (por === "lider") detalhe = "Você pausou o jogo.";
    else detalhe = semPc ? "O PC pausou o jogo e está sem sinal. Você pode retomar." : "O PC pausou o jogo. Só ele retoma.";
  } else detalhe = semPc ? "Pausado pelo PC, que está sem sinal. O líder pode retomar." : `Pausado ${quem}.`;
  return { visivel: true, titulo: "Jogo pausado", detalhe, botaoRetomar };
}
