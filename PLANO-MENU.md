# PLANO H7: menu da partida e líder da sala

Só plano. Nada de código nem de teste foi alterado para escrevê-lo. Ele foi feito lendo o código de verdade (arquivo e função citados em cada ponto) e **não foi testado no jogo**.

Resumo: hoje a sala tem um "Dono" (o primeiro celular que entra) e o telão só observa. O plano troca isso por um **Líder** (celular) escolhido pelo **PC** (telão), dá ao PC poder de verdade no servidor, e acrescenta o menu com pausar, acabar a partida, convidar, expulsar e trocar de time. São **6 fases pequenas, mais uma fase 0 de pré-requisitos (H7.0, já feita)**, cada uma com um commit `H7:` e testes. **Decisões D1, D2 e D3 aprovadas, com ajustes: ver 2.5.**

Fora do escopo (não proponho mexer): física, regras de jogo, bots, goleiro, animações. As únicas mudanças dentro de `packages/core` são as necessárias para (1) retomar depois de pausar sem disparar ação antiga e (2) trocar de time no meio do jogo.

---

## 1. (a) O estado atual da sala e do lobby

### 1.1 Quem manda hoje

| Assunto | Como é hoje | Onde |
|---|---|---|
| Dono da sala | É `jogadores[0]`, o primeiro controle que entrou. Não existe campo "dono": é a posição na lista. | `apps/server/src/sala.ts`, `Sala.ehDono` (linha 624), `Sala.lobby` (136), `entrarControle` (183, `dono: this.jogadores[0] === jogador`) |
| Se o Dono sai | Só passa para o próximo quando a vaga dele vence (30 s depois de cair). Cair não troca. | `Sala.varrer` (599), `PARTIDA.vagaGuardadaS = 30` (`constantes.ts:106`) |
| O que só o Dono faz | `config`, `comecar`, `revanche`, `lobby` (voltar ao lobby), `zerar` | `Sala.tratarControle` (265 a 317) |
| O que todo controle faz | `lado` e `pronto`, **só no lobby** (com partida rolando devolve `MENSAGEM_INVALIDA`) | `tratarControle`, casos `lado` (270) e `pronto` (284) |
| O que o telão faz | Nada. Qualquer mensagem além de `camera` responde `SEM_PERMISSAO`. | `Sala.tratarTela` (260) |
| Telão principal | O mais antigo ainda conectado (`telas[0]`). Só decide quem toca o som de torcida. | `sairTela` (169), `bemvindo.principal` |
| Quem vira telão | **Qualquer aparelho com o código da sala** (`ola` `assistir`). Não há segredo nenhum. | `apps/server/src/servidor.ts`, `entrar` (181), `salas.achar` |
| Recarregar o telão (F5) | Entra de novo como `assistir`, sem ser "o que criou". | `apps/web/src/tela/main.ts`, `gerarOla` (220) e `lembrarSala` (127) |
| Limite de gente | 6 controles por sala (`SERVIDOR.maxControlesPorSala`, `constantes.ts:615`), 8 telões, 3 humanos por time (`PARTIDA.maxHumanosPorTime = 3`, `constantes.ts:90`) | `sala.ts` linhas 202 e 274 |
| Gente nova com partida rolando | Vira humano no time com menos humanos, no lugar de um bot (o mais perto da bola). Sem vaga em nenhum time: fica em "espera". | `Sala.assumirVagaNoMeio` (424), `Partida.promoverHumano` (`partida.ts:285`), `GestorDeControle.adicionar` (`controle.ts:99`) |
| Queda de conexão | Vaga guardada 30 s, um bot joga no lugar. Ao voltar, ganha o companheiro livre mais perto da bola, não o que tinha. | `desconectarControle` (245), `GestorDeControle.definirAusente` (127) |
| Voltar ao lobby | Existe e funciona **no meio do jogo** (não exige `terminou`). Apaga a partida, não conta no campeonato. | `Sala.voltarAoLobby` (436), caso `lobby` (302) |
| Pausa | **Não existe.** O laço roda sempre que há partida e ela não acabou. | `Sala.avancar` (465), `passoUnico` (493) |
| Expulsar | **Não existe.** Só sai quem fecha o aparelho ou quem tem a vaga vencida. | `varrer` (599) |
| Trocar de time na partida | **Não existe.** `lado` é recusado durante a partida; o time é fixo até o fim. | `tratarControle` (271), `Jogador.time` ("fixo até o fim dela") |
| Convite (QR) | O QR e o código só aparecem no **lobby do telão**. Em jogo não há como ver. | `apps/web/src/tela/lobby.ts` (`definirEntrada`, 80), `tela/main.ts` `montarEntrada` (133) |
| Menu no celular | Não existe. A tela de jogo só tem joystick, CHUTE e PASSE. O Dono só vê Revanche e Lobby na tela de fim. | `apps/web/src/controle/jogo.ts` (`JogoControle`, 25; `fim`, 177) |
| Menu no telão | Não existe. Teclas em uso: `T` (tabela), `M` (som), `C`, `N`, `L` (câmera e modo leve), `Esc` (fecha a tabela). | `tela/main.ts` (40, 67), `tela/cena.ts` (`aoTeclar`, 68) |

### 1.2 Achados do código que mudam o desenho

1. **"Dono" é uma posição, não um campo.** Para o PC escolher o líder precisa existir `liderId` na sala. Hoje o código inteiro (e os testes `sala.test.ts`, "o primeiro é o Dono", "troca de Dono quando ele sai") assume `jogadores[0]`.
2. **O telão não tem identidade.** Como qualquer um com o código vira telão, "o PC tem a última palavra" não pode ser "qualquer telão". Na festa com amigos de outras casas (SPEC, seção 2) cada amigo abre o telão dele: esses telões não podem expulsar ninguém. Falta algo que diga qual telão é o do dono do PC (ver decisão D1).
3. **O telão trata todo `erro` como fatal.** `tela/main.ts`, `aoMensagem`, caso `erro` (193), chama `voltarAoInicio`. Hoje nunca sobra erro não fatal para o telão, porque ele não manda nada. No dia em que o telão mandar "expulsar", um `SEM_PERMISSAO` ou `ALVO_INVALIDO` jogaria o PC para a tela inicial. Tem de mudar para: só `ERROS_FATAIS` voltam ao início, o resto vira aviso.
4. **O cliente só trata 4002 e 4004 como "não reconecte".** `apps/web/src/comum/cliente.ts`, linhas 104 a 109. Quem for expulso fechando o WebSocket com outro código ficaria reconectando sozinho para sempre. Precisa de um código novo (4005) tratado ali, nos dois sites.
5. **Parado, o telão não recebe snapshot, e o interpolador não está pronto para isso.** (Hoje só falta snapshot na tela de fim.) `interpolacao.ts`, `adicionar` (76 a 97): o relógio do servidor é estimado pelo menor `chegada − hora do tick` dos últimos 90 snapshots (~3 s). Depois de uma pausa o tick continua, mas a hora real saltou: por até 3 s o telão acharia que está "à frente" dos dados e mostraria o jogo aos soquinhos (`amostrar`, 116 a 124, extrapola só a bola e congela o resto). Na retomada o interpolador precisa reancorar o relógio.
6. **Um aperto ou toque feito durante a pausa dispararia depois.** `partida.ts`, `processarComando` (404 a 461): a ação (chute ou passe) dispara quando `acaoSeq` muda; o aperto novo de CHUTE sem a bola vira **troca de jogador** (412 a 423). Com o jogo parado, nada disso roda, e na primeira volta depois de retomar tudo dispara de uma vez. A retomada precisa "consumir" o que veio durante a pausa (a mesma ideia de `GestorDeControle.atribuir`, `controle.ts:301-306`).
7. **A estatística do humano guarda o time de quando ele apareceu.** `Partida.creditoDe` (`partida.ts:327-337`) atualiza `slot` e `nome`, mas não `time`. Quem trocar de time no meio da partida entraria na tabela do campeonato (`campeonato.ts:62`) no time errado.
8. **Com 6 controles a sala está cheia e ninguém troca de time sozinho.** Se são 3 contra 3 humanos, nenhum dos dois pode ir para o outro lado (limite de 3). A troca de lugar entre dois humanos (permuta) precisa existir, senão "trocar de time" nunca funciona na sala cheia (ver 3.1, mensagem `permutar`).
9. **A partida já aguenta humano saindo e entrando no meio.** `removerHumano` (`partida.ts:292`) e `promoverHumano` (285) são o que `varrer` e `entrarControle` usam hoje, e `elencoMudou` (`sala.ts:417`) reenvia a lista. Expulsar e trocar de time reaproveitam isso, não reinventam.
10. **A mensagem `lobby` já é "a verdade única" que o celular e o telão usam** (`emPartida` troca de tela). É o lugar certo para pôr `pausada` e o time real de cada jogador.

---

## 2. Decisões

### 2.1 Já tomadas pelo Samuel (não reabertas)
Líder escolhido pelo PC e passável; se sair, o PC escolhe outro. Menu abre pelo celular do líder e pelo PC (teclado ou mouse); o PC tem a última palavra. Ações: pausar e retomar, acabar a partida e voltar ao lobby, conectar gente (convite ou QR), expulsar, trocar de time. Cada humano troca o próprio time, o líder move qualquer um, limite de 3 humanos por time. O PC expulsa também no lobby. Permissão sempre no servidor.

### 2.2 Interpretações minhas (confira; são fáceis de trocar)
- **"Líder" é o "Dono" de hoje com outro nome.** Na tela vira "Líder". No protocolo o campo continua `dono` para não mexer em 8 arquivos e nos testes; o texto do guia diz "dono = líder". (A mensagem `donos`, que é "quem controla cada jogador", não tem relação e continua igual.)
- **O líder também pode passar a liderança** (além do PC). "Pode ser passado a outro quando quiser" não diz quem passa.
- **O PC pode fazer tudo que o líder faz** (config, começar, revanche, zerar), só que no começo o PC terá botões apenas para o menu e para Revanche e Lobby na tela de fim. O servidor já aceita o resto (é uma linha por permissão).
- **Só celular pode ser líder.** O PC é o PC.
- **O primeiro celular que entra é o líder provisório** (como hoje), para a sala funcionar sem o PC mexer em nada. O PC troca quando quiser.
- **O menu aberto não pausa o jogo.** "Pausar" é um item do menu. (Se o Samuel quiser que abrir o menu pause sozinho, é uma linha por lado.)
- **Acabar a partida não conta no campeonato** (já é assim em `voltarAoLobby`).
- **Telões que só assistem não aparecem em lista nenhuma e não são expulsáveis** (o lobby só conta quantos são).

### 2.3 As 3 decisões de design que ainda dependem do Samuel

**D1. Quem é "o PC"? (poder do telão)**
- **Opção A (recomendada): chave do telão.** A sala gera um segredo quando o telão cria a sala, entrega só a esse telão, e o telão guarda no navegador. Quem apresenta a chave é o "mestre". Telões de amigos (que só digitaram o código) assistem e nada mais. Se o mestre fechar a aba e voltar, entra de novo com a chave. Custo: um campo a mais em `ola` e `bemvindo`, e a chave fica no `localStorage` do PC.
- **Opção B: o telão principal (o mais antigo conectado) manda.** Não precisa de chave. Risco: na festa online, se o PC do Samuel cair ou recarregar, o telão de um amigo vira principal e passa a poder expulsar todo mundo. Sem chave, qualquer um com o código de 4 letras que entre cedo como telão herda o poder.
- Recomendo A. Sem decisão, a fase 1 não começa (ela cria o modelo de permissão).

**D2. Líder sai e o PC não escolhe: o que acontece?**
O Samuel decidiu "o PC escolhe outro". Falta o que fazer enquanto ele não escolhe, e se não há PC mestre conectado.
- **Opção A (recomendada):** a sala fica **sem líder** e o PC vê um aviso com a lista de celulares conectados. Passados **15 s** sem escolha (constante `MENU.liderAutoEscolheAposS`), o servidor escolhe o celular conectado mais antigo e avisa. Sem nenhum mestre conectado, escolhe na hora. Ninguém fica preso em lobby sem poder começar.
- **Opção B:** espera o PC para sempre. Mais fiel ao pedido, mas se o PC estiver sem ninguém olhando ou fechado, a sala trava.
- Em ambos, enquanto não há líder, só o PC age.

**D3. Expulsar de verdade ou só remover?**
Sem conta de usuário, quem é expulso pode digitar o código de novo (ou escanear o QR, que o menu agora mostra).
- **Opção A (recomendada):** remove e **bloqueia o aparelho** até a sala fechar. O celular sorteia um identificador no `localStorage` (`b3d.aparelho`) e manda no `ola`; a sala guarda os bloqueados. Quem limpar os dados do navegador ou usar aba anônima volta (sem bloqueio perfeito), mas é suficiente para amigos. O PC pode "perdoar" (limpar a lista) com um item de menu.
- **Opção B:** só remove (o expulso volta quando quiser). Mais simples, mas expulsar vira só "dar um susto".
- **Opção C:** além de A, um interruptor "sala fechada para novos". Não está no pedido; deixo de fora, mas é pequeno depois.

### 2.4 Decisões menores (padrão que vou usar se o Samuel não disser nada)
1. **Menu do celular:** botão "☰" pequeno no canto de cima da faixa do time (longe dos polegares), toque simples; ações que destroem pedem segundo toque (como o "Zerar campeonato" de hoje, `controle/lobby.ts:130`).
2. **Teclas do PC:** `Esc` abre e fecha o menu (se a tabela estiver aberta, fecha a tabela primeiro), `P` pausa e retoma. Com o menu aberto, as teclas de câmera (`C`, `N`, `L`) ficam desligadas. Mouse: botão "☰ Menu" no canto.
3. **Ao retomar, sem contagem regressiva** (o jogo volta na hora). Se parecer brusco, é uma fase de polimento depois.
4. **Troca de time:** sem tempo mínimo entre trocas. Se virar bagunça, vira constante.
5. **Quem entra com a sala em pausa** recebe tudo e vê a tela de pausa.
6. **Versão do protocolo sobe de 1 para 2** na fase 1, para um celular com a página velha em cache ser obrigado a atualizar (hoje isso vira `VERSAO`, "Atualize a página"), em vez de ficar parado sem entender a pausa.

### 2.5 Aprovado pelo Samuel (11/11/2026), com ajustes

As três recomendações (A) foram aprovadas. Ajustes pedidos e como entram no plano:

- **D1 (chave do telão), com dois ajustes:**
  - **A chave fica no navegador do PC** (`localStorage`, por código de sala, com `sessionStorage` de reserva se o primeiro falhar; sempre em `try/catch`).
  - **Recarregar o telão dono não perde o controle.** Hoje o F5 já volta à mesma sala como `assistir` (`tela/main.ts`: o `?sala=` da URL e `gerarOla`); passa a mandar a chave guardada no mesmo `ola`, e o servidor devolve `bemvindo.mestre = true`. O servidor aceita **dois telões com a mesma chave ao mesmo tempo** (o novo entra antes de o antigo ser notado como caído). Se o navegador não guardar nada (aba anônima), o telão avisa na tela "Sem a chave deste PC: este telão só assiste". Teste de recarregar, de duas abas com a mesma chave e de chave errada entram na H7.1.
- **D2 (15 s e o celular mais antigo), com um ajuste:** **avisar na tela quem virou líder.** Mensagem nova do servidor, `{ t: "aviso", texto: string }` (H7.1), enviada a todos: o telão mostra o texto grande por alguns segundos (o mesmo aviso não fatal criado na H7.0) e o celular mostra um toast; o celular de quem virou líder ainda recebe "Você é o líder agora". Vale para toda mudança de líder (PC escolheu, líder passou, saída automática de 15 s, líder expulso). O mesmo `aviso` serve depois para "Fulano foi removido da sala".
- **D3 (bloquear o aparelho até a sala fechar, com o 4005), com um ajuste:** **o líder pode esconder ou desligar o QR pelo menu.** Interpretei como dois interruptores (H7.4), e **peço sua confirmação antes da H7.4**:
  1. **"Mostrar QR"**: esconde ou mostra o QR (e o link) no telão, no lobby e no Convidar; o código de 4 letras continua visível. Só visual.
  2. **"Aceitar novas pessoas"**: desligado, quem **ainda não é da sala** recebe `SALA_FECHADA` e não entra, mesmo sabendo o código; quem já é da sala e reconecta (com o token) entra normal. É o "sala fechada" que eu tinha deixado de fora (D3, opção C), agora pedido.
  Os dois estados vão no `lobby` (`qrVisivel`, `aceitaNovos`), então todo mundo vê o mesmo. O PC (mestre) também pode mexer neles. Se a sua ideia de "desligar" era outra, me diga e eu troco.
- **Autorização:** o Samuel autorizou atualizar `PROTOCOLO.md` e `SPEC.md` (`guia-claude-code/`). Cada fase que muda o protocolo atualiza os dois no mesmo commit; o `README.md` e o `PROGRESSO.md` também.
- **Ordem de trabalho:** uma fase por vez, começando pelos pré-requisitos; ao fim de cada fase, testes verdes, um commit `H7:`, sem `git push` (o Samuel faz), e a entrega no formato padrão (comando de push, o que foi feito, o que testar, o que falta). **Parar e esperar a confirmação antes da fase seguinte.**

---

## 3. (b) Protocolo e estados novos

Tudo é acréscimo (campos opcionais e mensagens novas), menos a mudança de versão. `guia-claude-code/` só muda com aprovação do Samuel: as mudanças de protocolo vão para o `PROGRESSO.md` e, na fase 6, ele aprova o texto novo do `PROTOCOLO.md` e do `SPEC.md`.

### 3.1 Aparelho para servidor (`MensagemCliente`, `mensagens.ts:56`)

| Mensagem | Quem pode | Campos | O que faz |
|---|---|---|---|
| `ola` telão (existente) | todos | `+ chave?: string` | Com a chave certa, o telão entra como **mestre** (D1, opção A). |
| `ola` controle (existente) | todos | `+ aparelho?: string` | Identificador do aparelho, para o bloqueio (D3, opção A). Até 64 caracteres, como o `token`. |
| `pausa` (nova) | líder, mestre | `valor: boolean` | Pausa ou retoma. Repetir o mesmo valor não faz nada e não dá erro. |
| `lado` (existente) | todos / líder / mestre | `+ id?: number` | Sem `id`: troca o próprio. Com `id`: move outro (líder ou mestre). Na partida só vale `casa` e `visitante`. **Passa a valer também com a partida rolando.** |
| `permutar` (nova) | líder, mestre | `a: number, b: number` | Troca os times de dois humanos de lados opostos de uma vez (mantém 3 contra 3). |
| `expulsar` (nova) | líder, mestre | `id: number` | Tira o controle da sala (no lobby ou na partida). |
| `lider` (nova) | líder, mestre | `id: number` | Passa a liderança a um celular conectado. |
| `lobby` (existente) | líder, mestre | nada | Acaba a partida e volta ao lobby (hoje só o Dono). |
| `config`, `comecar`, `revanche`, `zerar` | líder, **mestre (novo)** | como hoje | Sem mudança de campos. |

Validação em `lerMensagemCliente` (`mensagens.ts:309`): `id`, `a`, `b` inteiros de 0 a 999; `chave` e `aparelho` texto de até 64; `pausa.valor` booleano. Tudo cabe nos 1024 bytes.

### 3.2 Servidor para aparelho

| Mensagem | O que muda |
|---|---|
| `bemvindo` (telão) | `+ mestre?: boolean`; `+ chave?: string` (só para o telão que criou a sala). |
| `lobby` | `+ pausada: boolean`; `+ pausadaPor?: "lider" \| "tela"`; `JogadorLobby` ganha `time: 0 \| 1 \| null` (o time **de verdade** na partida; `lado` continua sendo a escolha do lobby). Sem líder, nenhum `jogadores[].dono` é verdadeiro. |
| `erro` | Códigos novos: `ALVO_INVALIDO` (o `id` não existe, já saiu ou está sem sinal), `PAUSA_DO_TELAO` (o líder tentou retomar uma pausa do PC), `EXPULSO` (vai para o expulso e entra em `ERROS_FATAIS`). `LADO_CHEIO` é reaproveitado para "esse time já tem 3". |
| Fechamento do WebSocket | **4005** = expulso. O site não reconecta (junto com 4002 e 4004, `cliente.ts:106`). |
| Snapshot binário | Não muda de formato. Parado, **não é mandado**; ao pausar e a quem entra pausado, manda-se um snapshot só. |
| `partida`, `donos`, `voce` | Sem mudança de formato. Troca de time reenvia `partida` (mesmo `id`) e `donos`, como já fazem `removerHumano` e `promoverHumano`. |

### 3.3 Estados novos da sala (`Sala`)

| Campo | Para quê |
|---|---|
| `liderId: number \| null` | Quem é o líder. Provisório = o primeiro controle a entrar. `null` = sem líder. |
| `semLiderDesde: number \| null` | Hora (`agora()`) em que ficou sem líder, para o prazo de 15 s (D2). |
| `chaveDoTelao: string` | O segredo do mestre (D1). Gerado com um **gerador à parte** (senão os testes de hoje, que esperam `token0`, `token1`, deixam de bater). |
| `pausada: { por: "lider" \| "tela" } \| null` | Se a partida está parada e quem parou. |
| `bloqueados: Set<string>` | Identificadores de aparelho expulsos (D3, opção A). |
| `Tela.mestre: boolean` | Se aquele telão pode agir. |

Estados do menu (só no site, nada no servidor): fechado, aberto, pedindo confirmação. A fonte de verdade de tudo que o menu mostra é a mensagem `lobby`.

---

## 4. (c) Regras de permissão

Sempre no servidor: `Sala.tratarTela` e `Sala.tratarControle` conferem **cada** mensagem contra o estado de agora. Esconder botão só ajuda a pessoa.

### 4.1 Quem pode o quê

| Ação | PC (telão mestre) | Líder (celular) | Jogador (celular) | Telão visitante |
|---|---|---|---|---|
| Pausar | sim | sim | não | não |
| Retomar | sim | sim, **menos** pausa feita pelo PC | não | não |
| Acabar e voltar ao lobby | sim | sim | não | não |
| Expulsar | qualquer controle | qualquer controle, **menos ele mesmo** | não | não |
| Trocar o **próprio** time | n/a | sim | sim | n/a |
| Mover outro de time / permutar | sim | sim | não | não |
| Passar a liderança | sim (a qualquer celular conectado) | sim (a um celular conectado) | não | não |
| `config`, `comecar`, `revanche`, `zerar` | sim (novo) | sim | não | não |
| Ver o convite (código, link) | sim, com QR | sim, código e link | sim, código e link | só o código que já digitou |
| `camera` | sim | n/a | n/a | sim |

Respostas: sem permissão → `SEM_PERMISSAO`; alvo inexistente → `ALVO_INVALIDO`; time cheio → `LADO_CHEIO`.

### 4.2 O que acontece com a liderança

| Situação | O que acontece |
|---|---|
| Sala nova | O primeiro celular a entrar é líder provisório. Se o PC mestre escolher outro, o provisório vira jogador comum. |
| Líder **cai da conexão** | Mantém a liderança durante os 30 s da vaga guardada (como hoje). O PC pode passar para outro na hora. Se ele volta antes e ninguém trocou, continua líder. |
| A vaga do líder **vence** (30 s) | Sem líder. Começa o prazo de 15 s (D2). O PC vê aviso e lista. |
| Líder **expulso** pelo PC | Sem líder na hora, mesmo prazo de 15 s. |
| Líder **vai para o outro time** | Continua líder. |
| **PC passa** a liderança | O líder antigo perde na hora todos os poderes dele (a mensagem dele que chegar depois leva `SEM_PERMISSAO`). |
| **Nenhum mestre conectado** e sem líder | O servidor escolhe na hora o celular conectado mais antigo. |
| Não sobrou nenhum celular conectado | Fica sem líder; o próximo a entrar (ou o primeiro que voltar) assume como provisório. |
| PC (mestre) cai ou fecha a aba | A partida segue. Quando um telão com a chave volta, o poder volta. |

### 4.3 "O PC tem a última palavra", em regra concreta
1. **Pausa do PC só o PC retoma.** O líder que tentar leva `PAUSA_DO_TELAO`. Pausa do líder, os dois retomam.
2. **O PC pode tirar a liderança** e **expulsar o líder**; o líder não pode fazer nada parecido com o PC (o PC nem aparece na lista de quem se expulsa).
3. **Toda mensagem é conferida contra o estado no instante em que é processada.** Se o PC agiu um instante antes, a do líder já chega num mundo diferente e é recusada ou vira não-fazer-nada.

---

## 5. (d) Casos de borda

**1. Pausa com a bola em jogo.**
- `Sala.avancar` (465) e `passoUnico` (493) não rodam passos enquanto `pausada`. Tudo congela junto: bola, jogadores, relógio da partida, a cobrança automática de 5 s e as animações (tudo conta em ticks, nada em hora real).
- Ao pausar e ao retomar, `relogioAnterior = null` e `acumulado = 0`, para não "recuperar" o tempo parado numa rajada de passos.
- Ao pausar: `lobby` com `pausada` e um snapshot final. Telão: tela de pausa e `som.parar()`. Celular: sobreposição "Jogo pausado" (o botão Retomar só aparece para quem pode).
- Ao retomar: o telão reancora o interpolador (novo método, `interpolacao.ts`; ver achado 5) e a partida chama o novo `aoRetomar()`, que **consome** o que ficou pendente: `acaoSeq` de cada humano igualado ao último recebido, e `chute.apertado` e `passe.apertado` iguais ao que o dedo está fazendo agora (mesma lógica de `GestorDeControle.atribuir`, `controle.ts:301-306`). Efeito prático: o que o jogador apertar ou soltar durante a pausa é descartado (uma carga de chute segurada na hora da pausa se perde). O joystick vale o do momento da retomada.
- A vaga guardada de quem cai (30 s) segue em hora real durante a pausa. Se vencer, o jogador vira bot normalmente.
- Pausa na tela de fim (`terminou`) e fora de partida: ignorada (sem erro).
- Quem entra com a sala pausada recebe `partida`, `voce`, o `lobby` com `pausada` e, se é telão, um snapshot (senão veria o campo vazio, já que parado não há snapshot).
- Pausa sem prazo máximo. Se todos saírem, a sala é apagada em 120 s como hoje (`salaVaziaApagaAposS`).

**2. Expulsar quem está controlando um jogador.**
- Servidor: `Partida.removerHumano(id)` (mesma chamada de `varrer`, 606), depois `aposMudancaDeControle()` e `elencoMudou()`. O jogador dele vira bot na hora, **no lugar onde está**, com a bola se estiver com ela. O comando dele some. A linha dele na estatística continua (`h<id>`).
- Ao expulso: `erro EXPULSO` + fechamento 4005 + remoção de `jogadores` (o token deixa de valer). A tela do celular volta à entrada com "Você foi removido da sala".
- Funciona em pausa e no lobby (no lobby é só sair da lista e `transmitirLobby`).
- Expulsar quem está **sem sinal** é permitido (libera a vaga sem esperar 30 s). Com isso a sala cheia (SALA_CHEIA) abre espaço.
- Expulsar o **líder**: ver 4.2. Expulsar quem é **cobrador de lateral/escanteio/falta**: o bot assume a cobrança (**não confirmei no código** como o bot cobra; ver seção 7).

**3. Trocar de time com 3 humanos já no outro.**
- `LADO_CHEIO` para quem pediu, e nada muda. No celular o botão do time cheio fica desligado e diz "cheio (3)".
- Com 3 contra 3 a sala está cheia e **ninguém troca sozinho**. Saída: `permutar a, b` (líder ou PC), que troca um humano de cada lado de uma vez e nunca estoura o limite.
- Troca de time de um humano que **não** está nesse caso (o outro lado tem espaço):
  - o jogador antigo vira bot onde está (como na expulsão);
  - o humano ganha o companheiro livre mais perto da bola **do novo time** (a mesma regra de `GestorDeControle.adicionar`, `controle.ts:99`);
  - sai da fila de trocas do time de antes e entra no fim da fila do novo;
  - o comando segue (joystick continua valendo) e botões segurados não disparam (como em `atribuir`);
  - celular recebe `voce` novo (cor, número), telão recebe `partida` (mesmo `id`) e `donos`;
  - a estatística dele continua a mesma linha, com o `time` atualizado (achado 7);
  - o `lado` dele na sala passa a ser o novo (`casa` ou `visitante` explícito), para Revanche e próxima partida o manterem lá;
  - só se troca **humano conectado** (quem está sem sinal fica no time dele, volta para ele).
- Não há tempo mínimo entre trocas (decisão menor 4).

**4. Voltar ao lobby no meio da partida.**
- É o `voltarAoLobby` (436) que já existe, com cuidado novo: apaga também `pausada`, `ultimaMira` e `versaoControleEnviada`.
- Pede confirmação no celular (segundo toque) e no PC (diálogo). O resultado parcial **não** entra no campeonato (vai por `registrar` só quando a partida termina, `passoUnico` 508).
- Ninguém perde o lado nem o apelido. Quem foi expulso antes continua fora. `pronto` volta a falso para todos ao começar a próxima (já é assim em `comecar`).
- Duas pessoas pedindo ao mesmo tempo: a segunda acha `partida === null` e não faz nada.

**5. Entrada de gente nova no meio do jogo.**
- O caminho já existe (`assumirVagaNoMeio`, 424): a pessoa vira humano no time com menos humanos, no lugar do bot mais perto da bola.
- Novo: o convite fica à mão em jogo (item "Convidar" no menu do celular e do PC), a tela de pausa também mostra o código; o PC mostra QR (a biblioteca `qrcode` já está no telão).
- Sala cheia (6 controles): `SALA_CHEIA`, o que o expulsar resolve.
- Se o aparelho está bloqueado (D3, opção A): recusa com `EXPULSO` e fechamento 4005 também (ele vê "Você foi removido desta sala").
- Entrando com a sala **pausada**: recebe o estado de pausa e fica parado como todos. A pessoa nova pode trocar de time pelo menu, como os outros.

**6. PC e líder mandando comandos ao mesmo tempo.**
- O servidor processa uma mensagem por vez, na ordem de chegada. Cada uma é conferida contra o estado daquele instante (4.3). As ações são idempotentes: pausar de novo, voltar ao lobby de novo e passar a liderança a quem já é líder não fazem nada nem dão erro; expulsar quem já saiu dá `ALVO_INVALIDO` (aviso, não erro fatal).
- A resposta a toda ação é o `lobby` novo para todos. Os dois menus se redesenham pelo mesmo `lobby`, então convergem mesmo se um deles mostrava coisa velha. Cada menu mostra a lista pelo `lobby` mais recente e refaz o botão de pausa/retomar pelo `pausada`.
- Comandos de **jogo** (binário) e de **menu** (JSON) não competem: são caminhos diferentes (`comandoControle` e `tratarControle`).
- Líder com o menu aberto: o celular zera joystick e botões ao abrir (as funções `zerar()` de `jogo.ts` já existem) e o jogador dele fica parado até ele fechar. O jogo continua para os outros (decisão menor: o menu não pausa).

---

## 6. (e) Fases, arquivos e testes

Um commit `H7:` por fase, `npm test`, `npm run typecheck` e `npm run build` passando antes de cada um, sem `git push`, `PROGRESSO.md` atualizado, e uma fase só começa depois de o Samuel testar a anterior. A **D1 e a D2** precisam estar respondidas antes da fase 1 (ela cria o modelo de permissão e a regra de líder sem líder); a **D3**, antes da fase 2 (expulsar).

| Fase | Entrega | Como o Samuel confere |
|---|---|---|
| **H7.0** | **Pré-requisitos (feita):** o telão não volta ao início em qualquer erro; `Interpolador.pausar` e `retomar`; `Partida.aoRetomar` | Nada muda no jogo; só os testes e a verificação do telão com um erro não fatal |
| **H7.1** | Líder de verdade, PC mestre e permissões no servidor (quase sem tela) | PC + 2 celulares: o primeiro celular é líder; o PC (mestre) consegue mandar; um telão de outra aba não consegue |
| **H7.2** | Expulsar e escolher o líder, pelo PC no lobby | No lobby do telão, clicar no nome: "Tornar líder" e "Expulsar" funcionam; o expulso vê a mensagem e não volta sozinho |
| **H7.3** | Pausar e retomar (PC, líder e celular), sem o menu completo | Pausar no meio de um lance, esperar, retomar: nada pula; apertos durante a pausa não valem |
| **H7.4** | O menu (telão e celular) com Pausar, Acabar a partida, Convidar e a lista com Expulsar | Abrir o menu pelo `Esc`, pelo mouse e pelo ☰ do celular do líder |
| **H7.5** | Trocar de time na partida (próprio, mover e permutar) | Trocar de time com a bola rolando; tentar entrar no time com 3; permutar na sala cheia |
| **H7.6** | Revanche e Lobby pelo PC, textos, versão do protocolo e documentação | PC: Revanche e Lobby na tela de fim; "Líder" em todos os textos |

### H7.1: Líder, PC mestre e permissões
- `packages/core/src/protocolo/mensagens.ts`: `VERSAO_PROTOCOLO` = 2; `OlaTela.chave?`, `Bemvindo.mestre?` e `chave?`; `Lobby.pausada` (já vem `false`) e `JogadorLobby.time`; códigos `ALVO_INVALIDO`, `PAUSA_DO_TELAO`, `EXPULSO` (este em `ERROS_FATAIS`); mensagens novas no tipo e em `lerMensagemCliente` (`lider`, `permutar`, `expulsar`, `pausa`, `lado.id`). Só os tipos e a validação nesta fase; as ações entram nas fases certas.
- `packages/core/src/constantes.ts`: bloco novo `MENU` com `liderAutoEscolheAposS: 15`.
- `apps/server/src/sala.ts`: `liderId`, `semLiderDesde`, `chaveDoTelao`, `Tela.mestre`; `ehDono` vira `ehLider(jogador)`; novo `ehMestre(tela)`; `lobby()` e `entrarControle` usam `liderId`; `varrer` passa a liderança ou aplica o prazo; `tratarTela` aceita as ações do mestre e `lider`; `podeGerir` (líder ou mestre) vale para `config`, `comecar`, `revanche`, `lobby`, `zerar`.
- `apps/server/src/servidor.ts`: passa `criou` e `chave` a `entrarTela`; erros não fatais ao telão não fecham a conexão.
- `apps/server/src/salas.ts`: gerador de chave à parte.
- `apps/web/src/tela/main.ts`: guarda a chave (`localStorage`, por sala, com `sessionStorage` de reserva) e manda no `ola assistir`, inclusive ao recarregar (2.5). **O "só `ERROS_FATAIS` voltam ao início" (achado 3) já foi feito na H7.0** (`tela/erros.ts`, `tela/main.ts`, aviso `#aviso-telao`).
- Mensagem `aviso` (2.5, D2) e o aviso de quem virou líder.
- **Testes** (`sala.test.ts`, `servidor.test.ts`): o primeiro controle é líder provisório; telão que criou é mestre; telão que só digitou o código não é; telão com a chave certa (depois de reconectar) é mestre; chave errada não é; mestre manda `config`/`comecar`/`lobby`; telão visitante recebe `SEM_PERMISSAO` e **continua conectado**; líder some e o prazo de 15 s passa a liderança; sem mestre conectado a escolha é na hora; `lider` do PC tira os poderes do antigo; os testes "Dono" de hoje passam a ler `liderId`. Os tokens `token0`, `token1` não mudam.

### H7.2: Expulsar e escolher o líder pelo PC
- `sala.ts`: `expulsar(id)` (remove de `jogadores`, `Partida.removerHumano`, `aposMudancaDeControle`, `elencoMudou`, `erro EXPULSO`, fechamento 4005, bloqueio do aparelho); o `ola` do controle confere `bloqueados`.
- `apps/web/src/comum/cliente.ts`: 4005 vira "não reconectar", como 4002 e 4004 (`aoFechar`).
- `apps/web/src/tela/lobby.ts`: botões por jogador ("Tornar líder", "Expulsar") só para o mestre; aviso "sala sem líder, escolha um" com a lista; `main.ts` da tela passa as ações.
- `apps/web/src/controle/main.ts`: trata `EXPULSO` (volta à entrada com o motivo, sem reconectar) e gera o `aparelho` no `localStorage` (try/catch, como o apelido).
- **Testes:** expulsar no lobby e na partida (o bot assume o jogador, a lista de `donos` atualiza, o expulso recebe `EXPULSO` e 4005); expulsar sem sinal; o expulso não consegue entrar de novo com o mesmo aparelho; token do expulso dá `TOKEN_EXPIRADO`; líder não se expulsa; líder expulso → sem líder; `ALVO_INVALIDO` para id velho; `cliente.ts` não reconecta com 4005 (teste de unidade do cliente, se couber, senão no `servidor.test.ts`).

### H7.3: Pausar e retomar
- `sala.ts`: `pausada`, `pausa` do líder/mestre, regra `PAUSA_DO_TELAO`; `avancar` e `passoUnico` param; `relogioAnterior`/`acumulado` zerados ao pausar e ao retomar; snapshot final ao pausar e para quem entra pausado (`reenviarPartida`, 447); `voltarAoLobby` limpa a pausa; `lobby` leva `pausada` e `pausadaPor`.
- ~~`Partida.aoRetomar()`~~ e ~~`Interpolador.pausar()`/`retomar()`~~ **já foram feitos na H7.0** (com testes). Nesta fase só falta **ligá-los**: a sala chama `partida.aoRetomar()` ao retomar; o telão chama `interp.pausar()` ao receber `lobby.pausada = true` e `interp.retomar()` quando volta a `false` (em `tela/cena.ts` e `main.ts`), além da tela de pausa, do `som.parar()` e da tecla `P` do mestre.
- `apps/web/src/controle/jogo.ts` e `main.ts`: sobreposição "Jogo pausado" e botão Retomar só para quem pode (a regra é do servidor; o botão escondido é só conforto).
- **Testes:** `sala.partida.test.ts`: pausar para o `tick`, não manda snapshot, o relógio da partida não anda, retomar não dá rajada de passos, cobrança automática de 5 s não anda; comando durante a pausa não dispara depois (CHUTE sem a bola não vira troca ao retomar); líder retoma pausa do líder, **não** retoma pausa do PC; pausa fora de partida e no fim é ignorada; entrar pausado recebe `partida` + snapshot; voltar ao lobby limpa a pausa; vaga que vence durante a pausa vira bot. Web: `interpolacao.test.ts` (reancorar elimina o "à frente" depois de pausa longa).

### H7.4: O menu (telão e celular)
- `apps/web/src/tela/menu.ts` (novo): sobreposição do telão, com `Esc`, `P` e o botão "☰ Menu" (só para o mestre). Itens: Pausar/Retomar, Acabar a partida (com confirmação), Convidar (código, link e QR, reaproveitando `montarEntrada` de `tela/main.ts`), lista dos jogadores com Expulsar e Tornar líder. As funções que decidem "o que aparece para quem" ficam puras e com teste.
- `apps/web/src/controle/menu.ts` (novo): o ☰ da faixa do time; para o líder: Pausar/Retomar, Acabar a partida (2 toques), Convidar (código, link, "Compartilhar" com `navigator.share` e cópia), lista com Expulsar; para os demais: só Convidar e (fase 5) Meu time. Sem `qrcode` no celular (o limite de 300 KB do controle, conferido no `build`, e a regra de nunca importar nada de `src/tela/`).
- `apps/web/src/controle/jogo.ts`: o menu zera joystick e botões ao abrir.
- Interruptores do QR (2.5, D3): `Lobby.qrVisivel` e `Lobby.aceitaNovos`; `SALA_FECHADA` em `CodigoErro` (aviso, não fatal para quem já está); o telão esconde o QR (`tela/lobby.ts`, `tela/menu.ts`). **Confirmar o sentido de "desligar" antes de começar.**
- CSS dos dois menus.
- **Testes:** lógica pura (quem vê qual item; texto da confirmação; o menu se redesenha a cada `lobby` e some se perdeu a permissão; o botão de pausa acompanha `pausada`); `build` confere que o controle não puxou Three.js nem o QR.

### H7.5: Trocar de time na partida
- `packages/core/src/regras/controle.ts`: `trocarDeTime(id, novoTime)` e `permutar(a, b)` (limite 3, fila e atribuição como na seção 5, caso 3).
- `packages/core/src/regras/partida.ts`: `trocarDeTime` e `permutar` por fora; `creditoDe` passa a atualizar o `time` (achado 7).
- `apps/server/src/sala.ts`: `lado` com partida rolando e com `id`; `permutar`; atualiza `Jogador.lado`, `Jogador.time`, `Jogador.slot`; `lobby.jogadores[].time`; `elencoMudou` e `aposMudancaDeControle`; mensagens `LADO_CHEIO` e `ALVO_INVALIDO`.
- `apps/web/src/controle/menu.ts` e `tela/menu.ts`: "Meu time" para todos (botões Casa e Visitante, o cheio desligado) e, para líder e PC, "Mover" e "Trocar lugares" na lista.
- **Testes** (`controle.test.ts`, `partida`, `sala.partida.test.ts`): o jogador antigo vira bot e o novo é o livre mais perto da bola do time novo; o limite de 3 vale (com `LADO_CHEIO`); permutar na sala 3 contra 3; humano sem sinal não é movido; a estatística segue no time novo; `voce` chega com a cor e o número novos; o telão recebe `partida` com o mesmo `id`; a revanche mantém o lado novo; trocar de time durante a pausa; trocar com a bola nos pés do jogador antigo.

### H7.6: Fim, textos e documentação
- Telão (`tela/fim.ts` ou `hud.ts`, a confirmar): botões Revanche e Lobby para o mestre.
- Textos "Dono" viram "Líder" em `controle/lobby.ts` e `tela/lobby.ts`.
- Documentação: `PROGRESSO.md` (o que cada fase mudou e como testar) e, **com a aprovação do Samuel**, `PROTOCOLO.md`, `SPEC.md` (seção 2 e 3) e `README.md`.
- Teste de ponta a ponta (`e2e/partida.spec.ts` já existe): PC cria a sala, dois celulares entram, o PC pausa e retoma, expulsa um e o outro vê.

### O que muda em cada arquivo (resumo)

| Arquivo | Fases | Mudança |
|---|---|---|
| `packages/core/src/protocolo/mensagens.ts` | 1 | Tipos, validação, versão 2 |
| `packages/core/src/constantes.ts` | 1 | Bloco `MENU` |
| `packages/core/src/regras/controle.ts` | 5 | `trocarDeTime`, `permutar` |
| `packages/core/src/regras/partida.ts` | 3, 5 | `aoRetomar`; `trocarDeTime`, `permutar`; `creditoDe` atualiza o time |
| `apps/server/src/sala.ts` | 1, 2, 3, 5 | Líder, mestre, expulsar, pausa, troca de time |
| `apps/server/src/servidor.ts`, `salas.ts` | 1 | Chave, `criou`, erros não fatais ao telão |
| `apps/web/src/comum/cliente.ts` | 2 | 4005 não reconecta |
| `apps/web/src/tela/main.ts`, `lobby.ts`, `cena.ts`, `interpolacao.ts` | 1 a 4 | Chave, erros, botões de lobby, pausa, reancorar |
| `apps/web/src/tela/menu.ts` (novo) | 4, 5 | Menu do telão |
| `apps/web/src/controle/main.ts`, `lobby.ts`, `jogo.ts` | 2 a 6 | Aparelho, expulso, pausa, ☰, textos |
| `apps/web/src/controle/menu.ts` (novo) | 4, 5 | Menu do celular |
| Testes: `sala.test.ts`, `sala.partida.test.ts`, `servidor.test.ts`, `controle.test.ts`, `interpolacao.test.ts`, os dos menus | todas | Em cada fase |

---

## 7. (f) O que não consegui confirmar no código

1. **Como o bot cobra lateral, escanteio e falta quando o humano que ia cobrar sai (expulso ou trocou de time) no meio da cobrança.** Vi `cobrancaAutomatica` (`partida.ts:1453`) e `GestorDeControle.portadorDoTime` (`controle.ts:250`, que olha `reinicio.cobrador`), mas não li a parte dos bots (`bots.ts`) que decide a cobrança. Antes da fase 2 vale um teste "expulsar o cobrador" para ver o que acontece.
2. **Se o telão (`cena.ts`, replay e `gravador.capturar`) aguenta ficar sem snapshot por muito tempo** (o replay dos gols também lê snapshots) e **se `som.ts` para de verdade** com a bola parada. Pelo que li, os dois só reagem a snapshot recebido, mas não abri o replay nem o som por dentro.
3. **Onde os botões do telão ficam na tela de fim** (`tela/fim.ts`, `hud.ts`). Não li esses dois arquivos; a fase 6 confirma. Também não li o CSS, então posições do "☰ Menu" e do ☰ do celular são intenção, não medida.
4. **Se o celular usa o `voce` (reenviado a cada 1 s) como batimento** para algo. Pelo `jogo.ts` só atualiza a tela. Parado, o `voce` não sai (só sai dentro de `passoUnico`).
5. **Comportamento em iPhone e Android reais:** `navigator.share`, o toque no ☰ perto da borda, `localStorage` em aba anônima (o `try/catch` do apelido existe, mas o bloqueio do aparelho depende dele) e o app instalado. Nada foi rodado.
6. **Como a festa pela internet (`npm run festa`, túnel Cloudflare) vê o aparelho de cada um.** Não li essa parte; por isso o bloqueio proposto é por identificador do navegador (D3) e não por endereço de rede.
7. **Os testes que citam "Dono" literalmente** (`sala.test.ts`, linhas 31 a 37, 128 a 169, e os da troca de Dono) precisam ser reescritos na fase 1; não conferi se há outros nos testes de `servidor.test.ts` e `e2e/partida.spec.ts`.
8. **O custo da mudança de versão do protocolo** para quem já tem o site instalado em cache. O servidor serve o site junto (`SITE_DIR`), então deve atualizar, mas não conferi o `manifest` nem o service worker (se houver).
