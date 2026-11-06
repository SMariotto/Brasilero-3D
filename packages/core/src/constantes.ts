// TODOS os números ajustáveis do jogo moram aqui. Mexa à vontade; nada de número mágico espalhado.
// A seção da SPEC de cada bloco está no comentário. Unidades: metro, segundo, grau (salvo aviso).
// Os valores são pontos de partida para ajuste de "sentimento".

// ---------------------------------------------------------------------------
// Tempo (SPEC 6 e ARQUITETURA 4.1)
// ---------------------------------------------------------------------------
export const TEMPO = {
  /** Passos da física por segundo. Passo fixo de 1/60 s. */
  tickHz: 60,
  /** Snapshots por segundo mandados aos telões. */
  snapHz: 30,
  /** No máximo quantos passos o laço roda por volta, para não espiralar se o PC engasgar. */
  maxPassosPorVolta: 5,
} as const;

// ---------------------------------------------------------------------------
// Campo (SPEC 4.3). Eixo X = comprimento (gol da Casa em X negativo), Z = largura, Y = altura.
// areaLarg = largura da área em Z; areaProf = profundidade da área em X (no PROTOCOLO: areaComp).
// ---------------------------------------------------------------------------
export interface MedidasCampo {
  comp: number;
  larg: number;
  golLarg: number;
  golAlt: number;
  areaLarg: number;
  areaProf: number;
}

export const CAMPOS: Record<3 | 4 | 5, MedidasCampo> = {
  3: { comp: 44, larg: 28, golLarg: 5.0, golAlt: 2.0, areaLarg: 10, areaProf: 6 },
  4: { comp: 52, larg: 33, golLarg: 5.5, golAlt: 2.1, areaLarg: 11, areaProf: 7 },
  5: { comp: 60, larg: 38, golLarg: 6.0, golAlt: 2.2, areaLarg: 12, areaProf: 8 },
};

/** Altura das paredes do modo Arena (SPEC 4.2). */
export const PAREDE_ALTURA = 1;

// ---------------------------------------------------------------------------
// Partida (SPEC 3.2, 4.1, 4.4, 4.5, 4.6, 4.7)
// ---------------------------------------------------------------------------
export const PARTIDA = {
  duracoesMin: [2, 4, 6, 8] as const,
  duracaoPadraoMin: 4,
  nLinhaPadrao: 5,
  nLinhaMax: 5,
  /** Máximo de humanos por time (G1, decisão do Samuel). Também decide o máximo de controles por sala (2 times). */
  maxHumanosPorTime: 3,
  /** A saída de bola solta sozinha depois disso, se ninguém tocar. (SPEC 4.4) */
  saidaSoltaAposS: 3,
  /** Duração do pré-jogo, com os times entrando. (SPEC 3.1) */
  preJogoS: 3,
  /** Cobrança automática de lateral, escanteio e falta. (SPEC 4.5) */
  cobrancaAutomaticaS: 5,
  /** Tempo para o cobrador de lateral deslizar até a bola. (SPEC 4.5) */
  lateralDeslizaS: 1,
  /** Distância mínima dos adversários à bola num reinício. (SPEC 4.5) */
  distanciaAdversarioReinicioM: 4,
  /** Distância dos adversários numa falta. (SPEC 4.6) */
  distanciaAdversarioFaltaM: 5,
  /** Janela para contar assistência (toque anterior do mesmo time). (SPEC 4.7) */
  assistenciaJanelaS: 6,
  /** Vaga guardada de quem caiu da conexão; um bot joga no lugar. (SPEC 4.1) */
  vagaGuardadaS: 30,
  /** Humano cobra o reinício se estiver a até esta distância da bola; senão cobra o bot mais perto (provisório, F3). */
  cobradorHumanoMaxM: 12,
  /** Tempo máximo (s) que o cobrador leva para deslizar até a bola. */
  cobradorDeslizaS: 1,
  /** Comemoração depois do gol, com o relógio parado (provisório, F2). */
  golComemoracaoS: 6,
  /** Prorrogação de gol de ouro (F8b, provisório): se ninguém marcar nesse tempo, o jogo termina empatado. */
  prorrogacaoS: 120,
  /** Cores fixas dos goleiros (provisório, ver PROGRESSO). (SPEC 9.3) */
  corGoleiroCasa: "#E6D800",
  corGoleiroVisitante: "#FF7F11",
  /** Diferença de cor (ΔE em Lab) abaixo da qual o Visitante troca de camisa. (SPEC 9.3) */
  conflitoCorDeltaE: 25,
} as const;

// ---------------------------------------------------------------------------
// Bola (SPEC 6.1)
// ---------------------------------------------------------------------------
export const BOLA = {
  raio: 0.11,
  gravidade: 9.81,
  /** v -= arrasto · v · |v| · dt */
  arrasto: 0.012,
  /** Desaceleração rolando na grama (m/s²). */
  atritoChao: 1.6,
  restituicaoChao: 0.55,
  /** Fração da velocidade horizontal perdida a cada quique. */
  perdaHorizontalQuique: 0.15,
  /** Abaixo disso (m/s) a bola para. */
  velocidadeParada: 0.05,
  travesRaio: 0.06,
  travesRestituicao: 0.6,
  paredeRestituicao: 0.7,
  /** Provisório (F2): abaixo desta velocidade vertical (m/s) a bola não quica mais, só rola. */
  quiqueMinimo: 1,
  /**
   * Efeito (H2): a bola pode ter um `giro` (rad/s) que gira o rumo da velocidade horizontal, curvando a trajetória sem mudar a
   * rapidez. No ar o giro cai devagar (constante de tempo em segundos); no chão (rolando ou quicando) cai depressa.
   */
  giroDecaimentoArS: 2,
  giroDecaimentoChaoS: 0.25,
  /** Fração do giro que sobra a cada quique no chão e a cada batida na trave. */
  giroSobraQuique: 0.6,
  giroSobraTrave: 0.2,
  /** Abaixo disto (rad/s) o giro vale zero. */
  giroMinimo: 0.02,
} as const;

// ---------------------------------------------------------------------------
// Gol e rede (provisório, F2): depois de entrar, a bola fica presa numa caixa atrás da linha até a saída de bola.
// ---------------------------------------------------------------------------
export const GOL = {
  profundidadeRede: 2,
  restituicaoRede: 0.2,
} as const;

// ---------------------------------------------------------------------------
// Jogador (SPEC 6.2)
// ---------------------------------------------------------------------------
export const JOGADOR = {
  raio: 0.4,
  /**
   * Velocidade máxima (m/s), com o joystick inclinado até o fim (H3). Todo mundo corre sempre, sem stamina e sem botão de correr: esta
   * é a antiga velocidade de "CORRER" (8,2) ou um pouco abaixo; o valor escolhido e a medida estão no PROGRESSO.md.
   */
  velocidadeMax: 7.6,
  /** Com a bola nos pés o jogador usa esta fração da velocidade. */
  fatorVelocidadeComBola: 0.9,
  /**
   * A velocidade segue a inclinação do joystick por uma curva suave (sem degrau): abaixo de `inclinacaoAnda` ele quase não anda e a
   * partir de `inclinacaoCorre` corre na velocidade máxima. No meio, anda (dá para conduzir a bola devagar).
   */
  inclinacaoAnda: 0.1,
  inclinacaoCorre: 0.95,
  aceleracao: 21.0,
  /** Freada (m/s²) ao diminuir a velocidade ou virar para trás (H2: era 24). */
  freada: 32.7,
  /** Freada (m/s²) ao SOLTAR o joystick: o jogador para mais firme, sem deslizar (H2). */
  freadaSolto: 39.8,
  /**
   * Aceleração (m/s²) para o LADO, ao mudar de direção em movimento (H2). Antes a curva usava os mesmos 18 m/s² da largada, e o jogador
   * derrapava de lado (parecia "no sabão"). Não mexe na velocidade máxima, só na rapidez de virar.
   */
  aceleracaoLateral: 35.1,
  /** Graus por segundo. */
  giroMax: 720,
  massa: 1,
  massaGoleiro: 1.3,
  /** Altura do corpo (m): a bola abaixo disso e perto do corpo bate nele (F2, provisório). */
  alturaCorpo: 1.8,
  /** Quanto a bola quica no corpo quando o jogador não consegue dominá-la (F2, provisório). */
  restituicaoCorpo: 0.5,
} as const;

// ---------------------------------------------------------------------------
// Domínio e condução (SPEC 6.3)
// A mola de condução (rigidez e amortecimento) não está na SPEC: entra na F2, marcada como provisória.
// ---------------------------------------------------------------------------
export const DOMINIO = {
  /** Distância máxima do centro do jogador à bola. */
  alcance: 0.7,
  alturaMax: 0.6,
  /** Velocidade relativa máxima (m/s). A SPEC original dizia 9; a R0 subiu para 14. */
  velocidadeRelativaMax: 14,
  /** Distância à frente do jogador onde a bola é conduzida. */
  alvoConducao: 0.55,
  /** Intervalo do "toque" extra quando o jogador corre com a bola. */
  toqueIntervaloS: 0.35,
  /** Depois de chutar ou passar, o próprio jogador não domina por este tempo. */
  bloqueioAposChuteS: 0.25,
  /** Mola de condução (provisório, F2: a SPEC não define). Amortecimento perto do crítico: 2·√rigidez. */
  molaRigidez: 180,
  molaAmortecimento: 26,
  /** Velocidade extra (m/s) dada à bola a cada "toque" de drible (provisório, F2). */
  toqueImpulso: 2,
  /** Ao disputar, vence quem estiver mais perto do alvo; diferença menor que isto conta como empate. */
  disputaEmpateM: 0.05,
} as const;

// ---------------------------------------------------------------------------
// Tipos de chute (H2, provisório): o servidor escolhe o tipo pelo lance; o jogador só aperta CHUTE
// ---------------------------------------------------------------------------
export const TIPO_CHUTE = {
  /** Um toque rápido (carga abaixo disto, de 0 a 1) continua sendo o chute fraco de sempre: o tipo automático é para chute de verdade. */
  forcaMinParaTipo: 0.3,
  /** Só há tipo de chute quando o chute aponta para o gol e o jogador está a menos disto (m) do centro do gol. */
  alcanceMaxM: 32,
  /** Abertura do gol vista pelo jogador (graus): abaixo disto o ângulo é fechado (chapada); a partir do aberto, canudo. */
  anguloFechadoGraus: 18,
  anguloAbertoGraus: 26,
  /** A chapada só vale até esta distância (m) do gol: medido no simulador, de mais longe o chute reto rende mais. */
  chapadaDistanciaMaxM: 20,
  /** H4: com o goleiro saído da linha por mais disto (m), ele já fecha o ângulo e a chapada perde a graça: vai de chute reto. */
  chapadaGoleiroAteM: 1.2,
  /** O canudo só vale até esta distância (m) do gol; mais longe com ângulo aberto vira trivela. */
  canudoDistanciaMaxM: 20,
  /** Um adversário de linha a menos disto (m) do jogador conta como pressão. */
  pressaoM: 2.5,
  /** Com pressão e o ângulo aberto, a partir desta distância (m) o jogador chuta de trivela para contornar o marcador (perto, é canudo). */
  pressaoTrivelaDistanciaM: 10,
  /** Força mínima do chute (0 a 1) em cada tipo: o tipo "automático" não é um toquinho. */
  canudoForcaMin: 1,
  chapadaForcaMin: 0.6,
  trivelaForcaMin: 0.85,
  /** Quanto a bola curva (graus de rumo entre a saída e a chegada) na chapada e na trivela. */
  chapadaCurvaGraus: 16,
  trivelaCurvaGraus: 14,
  /** Velocidade vertical extra (m/s) do chute com efeito (0: o chute reto já sobe o bastante e mais que isso passa do travessão). */
  chapadaVyExtra: 0,
  trivelaVyExtra: 0,
  /** Os cantos do gol (alvo da chapada e da trivela) ficam a esta distância (m) para dentro das traves. */
  alvoMargemTraveM: 0.5,
  /** O erro angular aleatório do chute com efeito é esta fração do erro do chute reto (o efeito é um gesto mais cuidadoso). */
  erroEfeitoFator: 0.5,
  /** Usa-se 92% da velocidade da bola para estimar o tempo de voo (arrasto e quique). */
  fatorTempoDeVoo: 0.92,
  /** Cavadinha: chute leve por cima do goleiro adiantado, com o jogador livre e perto do gol. */
  cavadinha: {
    /**
     * O goleiro está "adiantado" se está a mais disto (m) da linha de fundo. Medido: ele fica de 1,1 a 1,7 m quando o jogador se
     * aproxima, então a cavadinha só aparece quando ele está bem fora do lugar (para encobrir e ainda entrar sob o travessão, a bola
     * precisa descer íngreme, o que não dá com o goleiro colado na linha).
     */
    goleiroAdiantadoM: 1.9,
    distanciaMinM: 6,
    distanciaMaxM: 16,
    /** Abertura mínima (graus): a cavadinha não vale com o gol quase de lado. */
    anguloMinGraus: 12,
    /** A bola tem que cruzar a linha do gol a esta altura (m, abaixo do travessão de 2,2 m), descendo. */
    alturaNoGolM: 1.8,
    /** E tem que ficar acima disto (m) em toda a zona onde o goleiro alcançaria a bola (ele alcança 2 m em pé). */
    alturaSobreGoleiroM: 2.05,
    /**
     * O goleiro recua em direção à linha enquanto a bola voa (medido: de 2 m/s perto da linha a 4 m/s antes da H3; com os jogadores a 7,6 m/s o goleiro chega a uns 6 m/s partindo de longe, até 0,8 m da linha): a zona onde ele alcança a
     * bola vai até onde ele chega no fim do voo. Por isso a cavadinha só encobre quando ele está bem fora do lugar.
     */
    goleiroRecuoMS: 1.5,
    goleiroRecuoMinimoM: 0.8,
    /** Faixa de velocidade vertical (m/s) e teto da velocidade horizontal (m/s) que a busca aceita. */
    vyMin: 4,
    vyMax: 8.5,
    /** Velocidade horizontal mínima (m/s): abaixo disso seria um balão quase vertical, não uma cavadinha. */
    vhMin: 6,
    vhMax: 15,
  },
} as const;

// ---------------------------------------------------------------------------
// Recepção da bola (H1, provisório): o primeiro toque do jogador controlado por humano
// ---------------------------------------------------------------------------
/**
 * Quando uma bola solta que chega passa perto do pé de um jogador controlado por humano, ela é amortecida e puxada para o pé
 * durante uma recepção curta. É só força na bola (a física continua mandando: sem teleporte), e só vale para humanos (os bots
 * seguem as regras de domínio de antes).
 */
export const RECEPCAO = {
  /** A recepção começa se a bola está a menos disto (m) do centro do jogador. O domínio normal é 0,7: isto é o "perto do pé". */
  raio: 1.6,
  /** ...e abaixo desta altura (m): bola alta passa por cima. */
  alturaMax: 0.9,
  /** ...e com velocidade relativa ao jogador abaixo disto (m/s): um chute forte demais ainda quica no corpo. */
  velocidadeMax: 22,
  /** "Chegando": a bola tem que se aproximar a pelo menos esta velocidade (m/s), ou estar quase parada em relação ao jogador. */
  aproximacaoMin: 0.5,
  velocidadeParada: 2.5,
  /** Duração (s) da recepção: a animação de amortecer e o tempo em que a bola é puxada. */
  duracaoS: 0.2,
  /** Depois de uma recepção, só começa outra depois disto (s). */
  recargaS: 0.7,
  /** Constante de tempo (s) com que a velocidade da bola em relação ao jogador é amortecida: menor = amortece mais rápido. */
  amortecimentoS: 0.07,
  /** Aceleração (m/s²) que puxa a bola para o pé (o ponto de condução, à frente do jogador). */
  puxao: 38,
  /** A recepção termina antes se a bola se afastar mais que isto (m). */
  raioDesiste: 2.2,
} as const;

/**
 * Recepção do passe (H3): quem foi escolhido para receber um passe (humano ou bot) amortece e controla a bola com mais raio e mais
 * força que a recepção comum acima. Mesma ideia (só força na bola, nada de teleporte), números maiores.
 */
export const RECEPCAO_PASSE = {
  raio: 2.4,
  alturaMax: 1.1,
  velocidadeMax: 32,
  aproximacaoMin: 0.3,
  velocidadeParada: 3,
  duracaoS: 0.3,
  recargaS: 0.4,
  amortecimentoS: 0.045,
  puxao: 60,
  raioDesiste: 3.2,
} as const;

// ---------------------------------------------------------------------------
// Passe (SPEC 6.4)
// ---------------------------------------------------------------------------
export const PASSE = {
  /** Abertura total do cone de busca (graus). */
  coneGraus: 60,
  pesoAlinhamento: 0.6,
  pesoDistancia: 0.25,
  pesoLinhaLivre: 0.15,
  distanciaIdealMin: 8,
  distanciaIdealMax: 18,
  /**
   * Velocidade rasteira: limitar(base + porMetro · distância, min, max). H3: bem mais rápida que a da R0/H1 (era 6 + 0,9·d, entre 8
   * e 16 m/s), porque todo o campo corre mais e o passe lento era interceptado. Vale para todas as dificuldades.
   */
  velocidadeBase: 10,
  velocidadePorMetro: 1,
  velocidadeMin: 12,
  velocidadeMax: 22,
  /**
   * Amortecimento do passe (H3): enquanto a bola de um passe rasteiro viaja, ela perde velocidade só esta fração da perda normal
   * (atrito + arrasto). 1 = como uma bola qualquer; menor = o passe "corre" mais e chega firme.
   */
  desaceleracaoFator: 0.55,
  /** Segurar PASSE mais que isso vira lançamento por cima. */
  lancamentoSegurarS: 0.25,
  lancamentoVzMin: 5,
  lancamentoVzMax: 9,
  /** Provisório (F2): velocidade do passe sem mira em alvo. Na F3 vira a fórmula por distância. */
  velocidadeSemAlvo: 12,
  /**
   * Ajuda de mira do passe do humano (H3), IGUAL em todas as dificuldades: `coneGraus` é a abertura em que o jogo procura o companheiro
   * (em volta da direção do joystick); sem ninguém no cone, vai para o mais perto da direção. `forca` 1 = a bola vai em cheio para
   * onde o companheiro vai estar (100% mirada).
   */
  ajuda: { coneGraus: 80, forca: 1 },
  /**
   * A bola do passe rasteiro "segue" o receptor (H3): no último terço do trajeto a direção da bola gira devagar na direção dele.
   * Nada de teleporte: só a direção muda, no máximo `giroMaxRadS` por segundo, com a mesma velocidade. Para se alguém toca na bola.
   */
  seguir: {
    /** Começa depois desta fração do trajeto (2/3 = o último terço)... */
    inicioFracao: 0.66,
    /** ...e a força da correção sobe suave ao longo desta fração do trajeto (sem solavanco). */
    rampaFracao: 0.12,
    /** Curvatura máxima: quanto a direção da bola pode girar por segundo (rad/s). */
    giroMaxRadS: 2.4,
    /** Mira onde o receptor estará daqui a no máximo isto (s). */
    antecipacaoMaxS: 0.3,
    /** Desiste se a bola foi mais devagar que isto (m/s), ou depois de tanto tempo (s), ou se subiu mais que esta altura (m). */
    velocidadeMin: 3,
    tempoMaxS: 4,
    alturaMax: 0.6,
  },
  /** Quantas vezes se refina o ponto de encontro (o companheiro anda enquanto a bola viaja). */
  iteracoesDeMira: 3,
  /** Sem joystick, o companheiro é escolhido por: quanto está à frente (peso), linha livre de adversários e distância ideal (H1). */
  semDirecaoPesoAvanco: 0.5,
  semDirecaoPesoLivre: 0.3,
  semDirecaoPesoDistancia: 0.2,
  /** O quanto o companheiro mais à frente conta, em metros de avanço para nota máxima (H1). */
  semDirecaoAvancoM: 30,
  /** A mira para o ponto de encontro fica a pelo menos esta distância (m) das linhas do campo. */
  margemDoCampoM: 0.6,
} as const;

// ---------------------------------------------------------------------------
// Chute (SPEC 6.5)
// ---------------------------------------------------------------------------
export const CHUTE = {
  /** Tempo segurando CHUTE para a carga ir de 0 a 1. */
  cargaTotalS: 0.8,
  /** Força de um toque rápido. */
  forcaToque: 0.15,
  /** Velocidade = base + extra · força. */
  velocidadeBase: 14,
  velocidadeExtra: 16,
  /** Velocidade vertical = base + extra · força. */
  vzBase: 1,
  vzExtra: 5,
  /** Mira assistida: até quantos graus para fora da trave ela vale, e quanto puxa para dentro. */
  miraMargemGraus: 25,
  miraPuxaGraus: 12,
  /** Erro angular aleatório (graus). */
  erroGraus: 2,
  erroAltoGraus: 7,
  /** Acima desta força vale o erro alto. */
  erroAltoForca: 0.9,
  /**
   * Chute de muito longe (H4): quanto mais longe do gol, menos força final e mais erro de direção, sem ficar impossível.
   * A distância é medida até o centro do gol e dividida pelo comprimento do campo (60 m no campo 5; o meio de campo é 50%).
   * Abaixo de `inicioFracao` nada muda; de `inicioFracao` a `fimFracao` o efeito sobe suave (smoothstep); depois fica no máximo:
   * a velocidade da bola perde até `perdaForca` (fração) e o erro angular ganha até `erroExtraGraus` (para cada lado).
   */
  longe: { inicioFracao: 0.3, fimFracao: 0.6, perdaForca: 0.15, erroExtraGraus: 12 },
  /** Voleio: alcance horizontal, faixa de altura e força fixa. */
  voleioAlcance: 1,
  voleioAlturaMin: 0.6,
  voleioAlturaMax: 1.6,
  voleioForca: 0.7,
  /** Cabeceio (F6): bola entre voleioAlturaMax e esta altura. */
  cabeceioAlturaMax: 2.2,
} as const;

/** Tempo (s) que a animação de chute e de passe aparece no snapshot (provisório, F2). */
export const ANIMACAO = { chuteS: 0.3, passeS: 0.3 } as const;

// ---------------------------------------------------------------------------
// Defesa (SPEC 6.6)
// ---------------------------------------------------------------------------
export const DEFESA = {
  bote: {
    duracaoS: 0.25,
    /** H3: era 9 (contra 5,85 m/s do portador); agora o portador corre a 6,84 e o bote sobe para manter quase a mesma vantagem. */
    velocidade: 9.5,
    /** Se a bola ficar a menos disto durante o avanço, rouba. */
    raioRoubo: 0.8,
    recargaS: 0.8,
  },
  carrinho: {
    duracaoS: 1.0,
    /** H3: era 9; sobe junto com o bote. */
    velocidadeInicial: 9.5,
    /** Velocidade da bola quando o carrinho encosta nela. */
    velocidadeBola: 8,
    /** Quanto tempo o adversário atingido antes da bola fica caído. */
    quedaAdversarioS: 1.2,
    /** Quanto tempo quem deu o carrinho fica no chão depois do deslize. */
    chaoAposS: 0.8,
    recargaS: 1.5,
    /** G1 (provisório): sem a bola, segurar PASSE por este tempo (depois do bote) vira carrinho. Era o CHUTE sem a bola. */
    segurarPasseS: 0.3,
  },
} as const;

// ---------------------------------------------------------------------------
// Troca de jogador estilo FIFA (G1, provisório)
// ---------------------------------------------------------------------------
export const TROCA = {
  /** Sem a bola, o humano só passa para outro companheiro se ele estiver pelo menos isto (m) mais perto da bola (histerese). */
  histereseM: 2.5,
  /** Depois de qualquer troca sozinha, o humano fica este tempo (s) sem trocar sozinho de novo. */
  travaAposTrocaS: 0.6,
  /** Depois de trocar à mão (CHUTE sem a bola), fica este tempo (s) sem trocar sozinho, para o controle não "voltar". */
  travaAposManualS: 1.5,
} as const;

// ---------------------------------------------------------------------------
// Goleiro bot (SPEC 6.7)
// ---------------------------------------------------------------------------
export type Dificuldade = "facil" | "medio" | "dificil";

export const GOLEIRO = {
  /** Quanto à frente da linha do gol ele fica, conforme a distância da bola. */
  adiantadoMin: 0.5,
  adiantadoMax: 3,
  alcanceLateral: 2.2,
  alcanceAltura: 2.4,
  /** Atraso de reação do mergulho (s). */
  reacaoS: { facil: 0.3, medio: 0.22, dificil: 0.15 } satisfies Record<Dificuldade, number>,
  /** Encaixa se a bola chega abaixo disto (m/s); acima, espalma. */
  encaixaAteVelocidade: 18,
  /** H4: com a bola nas MÃOS (defesa ou bola solta), segura no máximo isto (s) antes de lançar. */
  maosS: 1.2,
  /** H4: com a bola nos PÉS (bola recuada pelo companheiro, tiro de meta), joga em até isto (s). */
  peS: 0.8,
  /** H4: segura pelo menos isto (s) para a bola assentar, mesmo com adversário em cima. */
  segurarMinS: 0.35,
  /** H4: com um adversário a menos disto (m), distribui assim que passa o mínimo. */
  pressaoM: 2.2,
  /** H4: quanto o corpo gira por passo (graus) para pôr a bola do lado oposto ao adversário mais perto. */
  protegeGiroGraus: 12,
  /**
   * H4: saída no 1 contra 1. Quando um atacante com a bola está sozinho com o goleiro e a até `atacanteAteM` do gol, o goleiro sai da
   * linha para fechar o ângulo: o avanço sobe de `adiantadoMinM` (atacante longe) até `adiantadoMaxM` (atacante a `cheioAteM`) e
   * volta a `adiantadoPertoM` quando o atacante já está colado na área (`pertoAteM` ou menos), onde sair mais não ajuda. Só a posição
   * muda; a velocidade do goleiro é a de sempre.
   */
  saida: { atacanteAteM: 20, adiantadoMinM: 2, adiantadoMaxM: 4, cheioAteM: 13, pertoAteM: 7, adiantadoPertoM: 2 },
  /**
   * H4: distribuição. Receptor "livre" = nenhum adversário a menos de `livreM` dele; só vale entre `distanciaMinM` e `distanciaMaxM`
   * do goleiro. O lançamento do goleiro sobe com velocidade vertical de `vyMin` a `vyMax` (mais longe, mais alto) e leva a bola
   * ao companheiro como regra de jogo (domínio garantido). Sem ninguém livre: lança para `longeM` à frente e a `bordaM` da linha lateral.
   */
  lance: { livreM: 4, distanciaMinM: 7, distanciaMaxM: 42, vyMin: 5, vyMax: 9, longeM: 30, bordaM: 5, raioDominioM: 1.6, passeLivreM: 2.4 },
  /** Provisório (F3): chance de falhar uma defesa que exigia espalmar (bola acima de 18 m/s). */
  falhaChance: { facil: 0.25, medio: 0.12, dificil: 0.05 } satisfies Record<Dificuldade, number>,
  /** Provisório (F3): duração e velocidade lateral do mergulho. */
  mergulhoDuracaoS: 0.45,
  /** H4: ele só mergulha quando a bola chega em até a duração do mergulho mais esta folga (s). */
  mergulhoFolgaS: 0.08,
  mergulhoVelocidade: 9,
  /** Alcance horizontal (m) para encaixar ou espalmar, em pé e mergulhando. */
  alcanceEmPe: 0.85,
  alcanceMergulhando: 1.25,
  /** Altura máxima (m) que o goleiro alcança em pé. */
  alturaEmPe: 2,
  /** Depois de espalmar, o goleiro não encaixa a mesma bola por este tempo. */
  bloqueioAposEspalmarS: 0.35,
  /** Quanto da velocidade a bola espalmada mantém, e a velocidade lateral dada a ela (m/s). */
  espalmaFator: 0.35,
  espalmaLateral: 6,
  /** Quantos passos à frente (1/60 s) o goleiro simula a bola para prever o chute. */
  previsaoPassos: 80,
} as const;

// ---------------------------------------------------------------------------
// Bots de linha (SPEC 6.8)
// ---------------------------------------------------------------------------
export const BOT = {
  /** Tempo de reação por dificuldade (s). */
  reacaoS: { facil: 0.35, medio: 0.22, dificil: 0.12 } satisfies Record<Dificuldade, number>,
  /** Passa se tiver adversário a menos disto na frente. */
  passaSeAdversarioAMenosDe: 2,
  /** Chuta se estiver a menos disto do gol, com ângulo aberto. */
  chutaSeAMenosDe: 18,
  /** Provisório (F3): erro angular (graus) do passe e do chute dos bots, por dificuldade. */
  erroGraus: { facil: 8, medio: 4, dificil: 1.5 } satisfies Record<Dificuldade, number>,
  /** G2 (provisório): chance de dar o bote em quem está com a bola, a cada decisão com ele ao alcance. */
  chanceBote: { facil: 0.14, medio: 0.22, dificil: 0.32 } satisfies Record<Dificuldade, number>,
  /** G2: a que distância (m) do portador o bot arrisca o bote. O bote avança 2,25 m, então além disso é inútil. */
  alcanceBote: { facil: 1.2, medio: 1.5, dificil: 1.7 } satisfies Record<Dificuldade, number>,
  /** G2: fração da velocidade máxima que o bot usa. Fácil é lento de verdade; Difícil corre tanto quanto o humano. */
  velocidade: { facil: 0.88, medio: 0.96, dificil: 1 } satisfies Record<Dificuldade, number>,
  /** G2: quantos bots do time sem a bola vão em cima dela (o seguinte fecha a linha de passe). */
  pressionam: { facil: 1, medio: 1, dificil: 1 } satisfies Record<Dificuldade, number>,
  /** G2: até quantos segundos à frente o bot que persegue a bola mira (interceptar em vez de correr atrás). */
  antecipacaoS: { facil: 0.2, medio: 0.4, dificil: 0.6 } satisfies Record<Dificuldade, number>,
  /** G2: quanto à frente da bola (s da velocidade dela) o bote mira. Fácil mira onde a bola está. */
  miraBoteS: { facil: 0, medio: 0.06, dificil: 0.12 } satisfies Record<Dificuldade, number>,
  /** G2: velocidade que o bot supõe para si mesmo ao calcular onde interceptar a bola (m/s). */
  velocidadeParaInterceptar: JOGADOR.velocidadeMax,
  /** Abertura (graus) do cone em que o bot procura companheiro para passar. */
  coneGraus: 140,
  /** Nota mínima de um companheiro para o bot preferir passar a driblar. */
  notaMinimaPasse: 0.4,
  /** Espera do bot antes de cobrar um reinício (s), somada ao tempo de reação. */
  esperaCobrancaS: 0.8,
} as const;

// ---------------------------------------------------------------------------
// Controle (SPEC 5)
// ---------------------------------------------------------------------------
export const CONTROLE = {
  joystickRaioPx: 60,
  joystickZonaMorta: 0.1,
  botaoMinPx: 72,
  /** Mudança só do joystick sai no máximo isto por segundo. */
  envioJoystickMaxHz: 30,
  /** "Ainda estou aqui" quando nada muda. */
  envioPresencaS: 1,
  apelidoMaxCaracteres: 12,
} as const;

// ---------------------------------------------------------------------------
// Servidor e salas (ARQUITETURA 4.2, 4.4 e PROTOCOLO 1)
// ---------------------------------------------------------------------------
export const SERVIDOR = {
  portaPadrao: 8787,
  /** 2 times × `PARTIDA.maxHumanosPorTime` (G1). Mais gente que isso assiste por um telão. */
  maxControlesPorSala: PARTIDA.maxHumanosPorTime * 2,
  maxTelasPorSala: 8,
  maxSalasPadrao: 50,
  /** Mensagem maior que isto derruba a conexão. */
  maxBytesMensagem: 1024,
  /** Acima disto por segundo, o excesso é descartado. */
  maxMensagensPorSegundo: 60,
  /** Sala sem nenhuma conexão por este tempo é apagada. */
  salaVaziaApagaAposS: 120,
  /** Sem `ola` neste tempo, o servidor fecha a conexão. */
  olaTimeoutS: 5,
  /** Alfabeto do código da sala, sem I e O. */
  alfabetoSala: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  tamanhoCodigoSala: 4,
  /** Ping/pong do telão e do controle. */
  pingIntervaloS: 2,
  /** Acima disto (ms) o telão e o controle avisam "conexão lenta" (F4). */
  pingAvisoMs: 150,
} as const;
