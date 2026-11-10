# PROGRESSO: Brasilero 3D

O Claude Code atualiza este arquivo no fim de toda sessão. Uma sessão nova começa lendo daqui.

## RESUMO PARA QUANDO O SAMUEL VOLTAR (rodadas G1, G2, G3, H1, H2, H3, H4 e H5)
- **H5 (boneco novo, rig-v1): FEITA**, tag `h5-ok`. O jogo agora usa o seu `model-brasilero-3d-rig.glb` (esqueleto de 17 ossos, 9 animações) no lugar do jogador feito por código, com **rosto** (atlas de 25x5: pisca sozinho e muda com o estado), **cabelo** (35 .glb; só o de cada jogador é baixado) e **skin por time**. **Skins:** Vasco, Corinthians, São Paulo e Pé de Sapo usam o PNG que você fez; os outros clubes, a camisa reserva e os goleiros usam uma skin **gerada por código** (cores e padrão do `times.json`, inclusive listras, faixas, metades e mangas). **Pé de Sapo** entrou como 13º clube (PDS; #184722, #B39101 e #E3D391); **faltam o nome oficial e a cidade** (item 23). **Sem animação própria** (ficam em `parado`/`gk_parado`): passe (usa o chute), carrinho, queda, cabeceio, recepção, cobrança e goleiro com a bola. **Atenção, desempenho:** com o glb de 20 peças são **562 draw calls** (limite 300; o jogador por código eram 82). O glb novo (corpo em uma malha só + rosto) deve baixar isso para uns 130 (estimativa minha); eu **não** fundi nada em código, como você pediu. Vitrine nova: `tela.html?boneco=1`. A regra 7 do `CLAUDE.md` agora diz que skins feitas pelo Samuel valem. Para voltar a antes da H5: `git checkout h4-ok` (e `git switch main`).
- **H4 (nome do chute, goleiro, chute de longe, mira do chute): FEITA**, tag `h4-ok`. **1.** O telão não mostra mais "Chapada!", "Trivela!" etc. (o jogo continua escolhendo o tipo). **2. Goleiro:** segura o que defende (inclusive no mergulho, onde antes a bola passava), protege a bola de costas para o adversário, lança de mão em até 1,2 s no companheiro livre mais próximo (domínio garantido por regra de jogo; sem ninguém livre, longe e para o lado), joga de pé em até 0,8 s, **não se joga na bola que o companheiro recua** (domina com o pé e passa; nada de gol contra) e **sai da linha no 1 contra 1**, o que deixou a cavadinha viável. **Achei um erro velho que explicava o "chute de longe fácil demais": o goleiro mergulhava assim que via o chute e já estava no chão quando a bola chegava**; agora ele mergulha na hora certa. **3.** Chute de muito longe: menos força e mais erro; do meio de campo, com força máxima, a taxa de gol caiu de 17-31% para 3% (no 1 contra 1 de 11 a 15 m ficou mais fácil; ver o efeito colateral na tabela H4). **4.** O erro do chute do humano com o gol à frente caiu 20% (efeito pequeno: +0 a +3 pontos de gol de perto). Tabelas antes e depois mais abaixo (item "H4"). **Não testado no Render.**
- Para voltar a antes da H4: `git checkout h3-ok` (e `git switch main`).
- **H3 (passe igual em todas as dificuldades e correr sempre): FEITA**, tag `h3-ok`. **Correr sempre:** acabaram a stamina, a barra de energia e o botão CORRER (celular, protocolo e testes). Todos, humanos e bots, correm a **7,6 m/s** (a antiga corrida era 8,2; escolhi um pouco menos, explicado no item 21) e a velocidade segue a inclinação do joystick (meia inclinação anda a ~3,5 m/s, dá para conduzir devagar). O PASSE ficou maior e fica ao lado do CHUTE. **Passe:** a bola vai 100% mirada no companheiro da direção do joystick (sem ninguém no cone, o mais perto da direção; sem joystick, o mais à frente e livre), **30 a 40% mais rápida** que antes, e **no último terço do trajeto ela gira de leve na direção do receptor** (sem teleporte; para se alguém toca na bola). O receptor (humano ou bot) amortece com mais raio e força, e o bot receptor corre ao encontro da bola. É **igual no Fácil, no Médio e no Difícil**. O anel e o "Passe para #N" continuam. Tabelas antes e depois mais abaixo (item "H3"). **Não testado no Render.**
- Para voltar a antes da H3: `git checkout h2-ok` (e `git switch main` para voltar).
- **H2 (chute com tipo e chão menos escorregadio): FEITA**, tag `h2-ok`. **Chute:** continua um botão só; o servidor escolhe canudo, chapada, trivela ou cavadinha pelo lance, e o telão mostra o nome por 1 s ("Trivela!"). A bola **não tinha efeito**: criei a curva (`BOLA.giro`). **Cavadinha:** está pronta, mas contra o goleiro de hoje quase nunca é viável (ele recua rápido); decisão sua no item 20. **Chão:** o giro de 90° caiu de 0,47 s para 0,23 s e a derrapagem lateral de 4,8 para 2,7 m/s, sem mexer na velocidade máxima. Tabelas antes e depois mais abaixo. **Não testado no Render.**
- Para voltar a antes da H2: `git checkout h1-ok` (e `git switch main`).
- **H1 (domínio de bola e passe com mira): FEITA**, tag `h1-ok`. **Recepção:** a bola que chega perto do pé do jogador controlado é amortecida e puxada por 0,2 s (sem teleporte, só força na bola). **Passe:** mira onde o companheiro VAI ESTAR (tempo de voo com a física real da bola), com ajuda forte no Fácil e fraca no Difícil; sem joystick manda para o mais à frente e livre; o telão e o celular mostram quem vai receber enquanto PASSE está apertado. Testes e passos de teste abaixo (item "H1"). **Não testado no Render nem com amigos:** o sentimento da recepção e da ajuda do passe precisa de você.
- Para voltar a antes da H1: `git checkout g3-ok` (e `git switch main` para voltar).
- **G1 (controle estilo FIFA): FEITA**, tag `g1-ok`. Máx. 3 humanos por time, 6 controles por sala; cada humano controla um jogador de cada vez; o controle passa para quem recebe o passe; CHUTE sem a bola troca de jogador; carrinho agora é segurar PASSE por 0,3 s.
- **G2 (bots: desarme, pressão, dificuldade): FEITA**, tag `g2-ok`. Simulador `npm run simular`; Fácil, Médio e Difícil agora são bem diferentes (velocidade, alcance e mira do bote, antecipação). Tabela antes e depois em "Testes que o Samuel precisa fazer", G2.
- **G3 (jogador 3D feito por código): FEITA**, tag `g3-ok`. Corpo humanoide de peças articuladas (InstancedMesh, 82 draw calls no jogo), animações por código, vitrine `tela.html?poses=1`. Mixamo e Blender marcados **obsoletos, nada apagado: posso apagar? (item 18)**.
- **Não testado por mim:** nada disso no Render nem com celulares de verdade (só testes automáticos e Edge sem placa de vídeo). O "sentimento" da troca de jogador precisa de você.
- **Perguntas abertas para você** (seção "Dúvidas para o Samuel", itens 16, 17 e 18): o carrinho no PASSE segurado; 6 controles por sala; o `guia-manual/GUIA-MANUAL.html` ainda diz "até 10 controles" e o passo 7 (Mixamo) ficou obsoleto (não mexi, é seu); **posso apagar os arquivos do Mixamo e do Blender?** (item 18).
- **Para subir tudo** (no PowerShell): `cd "C:\Users\Samuel\Documents\Jarvis\vault\projetos\Brasilero 3D\projeto"; git push; git push --tags`
- Para voltar a uma fase (se uma ficar ruim): `git checkout g1-ok`, `g2-ok` ou `g3-ok` (e `git switch main` para voltar ao mais novo).
- Os passos de teste no Render estão em "Testes que o Samuel precisa fazer", na ordem das fases: **G1, G2, G3, H1, H2** (e depois os das fases antigas).

## Estado das fases
| Fase | Estado | Último commit | Observação |
|---|---|---|---|
| R0 Revisão do guia | pronta (falta o Samuel conferir) | (fora do git: guia) | Correções em `guia-claude-code/`; resumo em DECISOES.md, seção "Revisão R0" |
| F0 Fundação | pronta (falta o Samuel conferir) | a4c0ccd | Monorepo, servidor /saude e /ws, 3 páginas, 39 testes, controle com 6,7 KB |
| F1 Sala e conexão | pronta (falta o Samuel conferir) | d0b6073 | Salas, lobby, reconexão, ping, QR, carga 18 conexões sem erro, 95 testes |
| F2 Primeiro jogo | pronta (falta o Samuel conferir) | 702e32f | Física, partida, protocolo binário, laço 60 Hz, telão 3D, controle com joystick, 243 testes + 2 Playwright |
| F3 Futebol de verdade | pronta (falta o Samuel conferir) | ver registro | Reinícios, passe com mira, bote, carrinho, faltas, goleiro, bots, vagas; 323 testes; 8 min de bots simulam em ~0,6 s |
| F4 No ar | pronta (falta o Samuel conferir) | ver registro | ORIGENS, servidor serve o site, npm run festa, vercel.json, Dockerfile, fly.toml, render.yaml, telões extras, aviso de ping; 358 testes + 4 Playwright |
| F5 Times e uniformes | pronta (falta o Samuel conferir) | b5a730f | Clubes sem conflito de cor (ΔE), "Aleatório", distintivo (PNG opcional ou neutro), uniforme por shader (7 padrões), vitrine, placar de TV |
| F6 Visual 3D realista | pronta (falta o Samuel conferir) | 69da5c0 | Estádio noturno, torcida, sombras, bloom, replay do gol, modo leve, `?debug=1`, jogador 3D (GLB) com reserva em cápsula, script do Blender. **O modelo do Mixamo ainda não existe**: precisa do Samuel (passo 7 do guia manual) |
| F7 Som e acabamento | pronta (falta o Samuel conferir) | b520fa7 | Sons por Web Audio e botão de mudo (tecla M), identidade visual dos menus, manifest + ícones, Wake Lock, dica do iPhone, tela de fim nova, revisão de textos |
| F8a Campeonato da sala | pronta (falta o Samuel conferir) | 4ba83b8 | Tabela de pontos corridos dos clubes e estatísticas dos jogadores na memória da sala; tecla T no telão; o Dono zera pelo celular |
| F8b Gol de ouro e câmera "segue jogador" | pronta (falta o Samuel conferir) | 718288c | Empate pode ir para prorrogação de 2 min em que o primeiro gol decide (opção no lobby); câmera que segue um jogador (tecla N, `?segue=Apelido`) |
| G1 Controle estilo FIFA | pronta (falta o Samuel conferir) | tag `g1-ok` | 3 humanos por time, um jogador de cada vez, fila rotativa, troca por passe, sozinha (histerese) e à mão (CHUTE sem a bola), carrinho no PASSE segurado, seta/anel/apelido que seguem o humano |
| G2 Bots (desarme, pressão, dificuldade) | pronta (falta o Samuel conferir) | tag `g2-ok` | Simulador de bots, diagnóstico, bote mais esperto (alcance, mira, antecipação), bots lentos no Fácil, qualquer bot defensor dá o bote ao alcance |
| H5 Boneco novo (rig-v1) | pronta (falta o Samuel conferir) | tag `h5-ok` | Corpo com esqueleto e 9 animações (`boneco.ts`, `animacoes-boneco.ts`), rosto de atlas, 35 cabelos, skin por time (PNGs do Samuel ou gerada por código com os padrões do `times.json`), Pé de Sapo como 13º clube, vitrine `?boneco=1`. 562 draw calls com o glb de 20 peças (limite 300): espera o glb de malha única |
| H4 Goleiro, chute de longe, mira do chute e sem nome de chute no telão | pronta (falta o Samuel conferir) | tag `h4-ok` | Telão sem o nome do chute; goleiro que segura, protege, distribui de mão e de pé, não se joga na bola recuada e sai no 1 contra 1; mergulho na hora certa; chute de muito longe mais fraco e torto; mira do chute do humano 20% mais certeira |
| H3 Passe igual em todas as dificuldades e correr sempre | pronta (falta o Samuel conferir) | tag `h3-ok` | Sem stamina nem botão CORRER (7,6 m/s sempre, velocidade pela inclinação do joystick), passe 100% mirado, mais rápido e igual nas três dificuldades, a bola segue o receptor no último terço, recepção reforçada para quem recebe o passe |
| H2 Chute com tipo e chão menos escorregadio | pronta (falta o Samuel conferir) | tag `h2-ok` | Efeito na bola (`BOLA.giro`), chute automático (canudo, chapada, trivela, cavadinha), nome do chute no telão, simuladores `npm run chutes` e `npm run medir`, freada e curva mais firmes |
| H1 Recepção de bola e passe com mira | pronta (falta o Samuel conferir) | tag `h1-ok` | Recepção (amortece e puxa a bola ao pé), ajuda de mira do passe por dificuldade, joystick solto escolhe o mais à frente e livre, mira visível no telão e no celular |
| G3 Jogador 3D por código | pronta (falta o Samuel conferir) | tag `g3-ok` | Corpo humanoide de peças articuladas por código (InstancedMesh), animações por conta sem patinar, uniforme pelo shader do clube, modo leve/`?capsula=1` com cápsulas, vitrine de poses |

Estados possíveis: não começou, em andamento, pronta (falta o Samuel conferir), conferida.

## Onde parou
F0 a F8b, G1, G2, G3, H1, H2, H3, H4 e H5 prontas (esperando o Samuel conferir; só os testes automáticos e capturas de tela no Edge sem placa de vídeo foram feitos por mim). A rodada de 05/11 foi G1 (controle estilo FIFA), G2 (bots) e G3 (jogador 3D por código), cada uma com a sua tag (`g1-ok`, `g2-ok`, `g3-ok`). **Última rodada: H5 (boneco novo, rig-v1; antes dela, H4: goleiro, chute de longe, mira).** **Próximo passo exato:** (H5) o Samuel me passa o glb novo de malha única (corpo + rosto), o nome oficial e a cidade do Pé de Sapo e responde o item 23; e o Samuel testa no site do Render (passos em "Testes que o Samuel precisa fazer") e responde as perguntas 16, 17, 18, 21 (velocidade 7,6 em vez de 8,2) e 22 (posso apagar `tipo-chute.ts`? a regra da bola recuada); depois, se ele pedir, o que sobrou da SPEC 10 (goleiro humano, cabeceio com botão, chute com efeito, modo "celular único", número nas costas da camisa, chuva, pênalti). Nada pela metade; o repositório compila e passa nos testes.

Para jogar pelo site sem rodar no PC: o plano é UM link só pelo Render (grátis), passo a passo em "F4 (publicar de verdade)" mais abaixo. Nada foi publicado; falta o Samuel criar a conta e dar o `git push`.

Dois itens da F6 dependem do Samuel e **não foram feitos nem testados com o modelo de verdade**: (1) o `jogador.glb` do Mixamo (o carregador está pronto e testado com um boneco de caixas; sem o arquivo o jogo usa cápsulas); (2) o `ferramentas/blender/montar_jogador.py` foi escrito mas nunca rodado (Blender e Python não estão instalados nesta máquina). Passo a passo em `ferramentas/blender/LEIA-ME.md`.

## Dúvidas para o Samuel
Decisões provisórias (regra do jogo) que o guia não cobria. Sigo com a opção mais simples; diga se quer outra:
1. ~~Limite de 5 humanos por lado.~~ **Mudou na G1 (decisão sua): 3 humanos por time**, `LADO_CHEIO` ao passar disso (`PARTIDA.maxHumanosPorTime`). (SPEC 4.1)
2. **"Pronto" só informativo.** O Dono pode começar com qualquer número de prontos. (SPEC 3.2)
3. **Cores dos goleiros fixas:** Casa amarelo `#E6D800`, Visitante laranja `#FF7F11`. (SPEC 9.3)
4. **Números de física que mudei na R0:** domínio 9 → 14 m/s e passe máximo 20 → 16 m/s, porque com os valores antigos ninguém conseguia receber um passe. Confirmar no sentimento do jogo na F3.
5. **Aviso do npm:** o `npm install` avisa que o `esbuild` tem script de instalação ainda não aprovado (`npm approve-scripts`). Nada quebra sem ele (tsx, vitest e vite funcionam), então não mexi.
6. **Reconexão e Dono (F1):** o Dono só passa para o próximo quando a vaga dele vence (30 s sem voltar), não no instante em que a conexão cai. Assim um Wi-Fi que pisca não tira o Dono. Se ele fechar o app de propósito, os outros esperam até 30 s para ter um novo Dono.
7. **Mesmo clube nos dois lados:** se o Dono escolhe para a Casa o clube que está no Visitante, os dois trocam de lugar (o servidor não deixa os dois iguais).
8. **Telão sozinho (F1):** o telão vira "principal" por ordem de chegada; se o principal sair, o mais antigo que sobrou assume.
9. **F2, regras que eu completei (confirme ou mande mudar):**
   - *Paredes da Arena valem em qualquer altura:* a bola nunca sai por cima da parede de 1 m (o desenho tem 1 m, a regra não deixa passar). A boca do gol fica aberta até o travessão.
   - *Dá para entrar com a bola andando:* sem goleiro (F3), o jogador que conduz a bola para dentro do gol faz gol. Fica assim até o goleiro existir.
   - *Saída de bola:* cada time na sua metade, adversários a 4 m da bola, o jogo solta quando quem cobra toca na bola ou em 3 s. Comemoração do gol: 3 s com o relógio parado.
   - *Passe da F2:* rasteiro, 12 m/s, na direção do joystick (a mira em companheiro e o lançamento entram na F3). Chute com a mira assistida e erro angular já valem.
   - *Quem entra com a partida rolando* fica em espera até a próxima (Revanche) e quem cai fica parado na vaga por 30 s (bot só na F3).
   - *Constantes novas provisórias* (a SPEC não define): mola de condução 180/26, toque de drible +2 m/s, quique mínimo 1 m/s, rebote no corpo 0,5, rede com 2 m de fundo. Todas em `constantes.ts`.
   - *Telão:* a bola é desenhada com o dobro do tamanho para dar para ler da TV; o relógio do servidor é estimado pelo caminho de rede mais rápido, não por ping/pong (ver PROTOCOLO 7).
10. **F3, o que eu completei (confirme ou mande mudar):**
   - *Gols por partida:* numa partida de 8 min só de bots saem uns 13 a 19 gols (campo pequeno, bots miram o canto longe do goleiro). Se achar demais, ajusto `GOLEIRO.falhaChance`, `BOT.erroGraus` e o alcance do goleiro em `constantes.ts`.
   - *Quem conduz a bola até o alcance do goleiro a perde para ele* (o goleiro "cai nos pés"); sem isso dava para passear com a bola para dentro do gol.
   - *Humano que entra no meio* vai para o time com menos humanos e não escolhe o lado; se os dois times só têm humanos, fica em espera.
   - *Lateral:* cobra o humano do time se estiver a até 12 m da bola; senão o bot mais perto. *Falta com as faltas desligadas:* o carrinho no adversário não faz nada (ninguém cai, sem tiro livre).
   - *Bots não dão carrinho* (só humanos). Bot dá bote conforme a dificuldade (15%, 30% ou 50% por decisão com o adversário perto).
   - *Constantes novas provisórias* (a SPEC não define): falha do goleiro por dificuldade (25%, 12%, 5%), mergulho de 0,45 s a 9 m/s, alcance em pé 0,85 m e mergulhando 1,25 m, rebote da bola espalmada, cone de 140° e erro angular dos bots (8°, 4°, 1,5°).
11. **F4, o que eu completei (confirme ou mande mudar):**
   - *O servidor serve o site* (sugestão que eu tinha deixado aqui): com `SITE_DIR` (o `npm run festa` já liga) o telão, o controle e o WebSocket ficam na mesma origem pelo túnel, sem depender da Vercel. A Vercel continua funcionando com `VITE_SERVIDOR_PADRAO`.
   - *ORIGENS:* em produção só passam os sites da lista e o mesmo site; em desenvolvimento também localhost e a rede local. Quem não manda Origin (testes, `npm run carga`) passa. `ORIGENS=*` libera tudo.
   - *Dockerfile em duas etapas (corrigido depois):* a primeira compila o site (`npm ci` completo + `npm run build -w @b3d/web`); a final instala só as dependências de produção do servidor, copia `packages/core`, `apps/server` e o `apps/web/dist` pronto, e define `SITE_DIR=/app/apps/web/dist`. Antes a imagem só tinha o servidor e o link único daria 404 nas páginas. O servidor roda o TypeScript com `tsx` (por isso `tsx` é dependência normal do servidor). O `.dockerignore` deixou de excluir `apps/web/src` e `apps/web/public` (a etapa do site precisa deles).
   - *ORIGENS não é obrigatória:* o código nunca exigiu (mesma origem passa em produção, `servidor.test.ts` agora prova a combinação produção + `SITE_DIR` + sem `ORIGENS`). `render.yaml` e `fly.toml` não pedem mais o valor. Só quem usar o plano B da Vercel precisa dela. O serviço do Render passou a se chamar `brasilero3d` (era `brasilero3d-servidor`).
   - *Não testei o `docker build`* (Docker não está instalado aqui): simulei as duas etapas à mão em pastas limpas, copiando só o que cada `COPY` copia e respeitando o `.dockerignore` (ver o registro de 05/11, "F4 correção do Dockerfile").
   - *`fly.toml`:* a máquina nunca dorme (`auto_stop_machines = "off"`), 1 máquina de 256 MB em `gru`, checagem em `/saude`.
16. **G1, o que eu completei (confirme ou mande mudar):**
   - *6 controles por sala* (3 + 3, `SERVIDOR.maxControlesPorSala`): mais gente assiste por um telão. O `guia-manual/GUIA-MANUAL.html` ainda diz "até 10 controles" num desenho: **obsoleto, não mexi (é seu). Posso corrigir?** O `npm run carga` passou a usar 6 controles por padrão.
   - *Carrinho = segurar PASSE por 0,3 s sem a bola* (o bote sai no aperto e, se continuar segurando, vira carrinho; se o bote roubou a bola, não vira carrinho). Era o CHUTE sem a bola, que agora **troca de jogador**. Provisório (`DEFESA.carrinho.segurarPasseS`).
   - *Fila rotativa só gira quando o humano passa para um BOT.* Passe para um companheiro que já é de outro humano não muda a fila. Passe sem destino também não.
   - *Troca sozinha sem a bola:* o companheiro livre mais perto da bola, só se estiver 2,5 m mais perto que o atual, com pausa de 0,6 s (1,5 s depois de uma troca à mão). Números em `constantes.ts` (`TROCA`), ajustáveis. "Mais bem posicionado" do CHUTE sem a bola = o mais perto da bola (não olhei o joystick): simples e provisório.
   - *Goleiro nunca é controlado por humano.* Quem cobra um reinício do time conta como portador (o primeiro da fila assume o cobrador).
   - *Estatísticas e campeonato são do humano* (pelo apelido), não do jogador que ele controlava: gol, assistência e desarme vão para quem tocou na bola, mesmo que o humano já tenha trocado de jogador.
   - *Câmera que segue (tecla N / `?segue=Apelido`)* agora segue o humano, esteja ele em qual jogador estiver.
   - *Modo antigo nos testes:* `Partida` tem a opção `controleFifa` (o servidor liga; desligada, cada humano fica na vaga fixa, que é o que os testes das fases F2 a F8 esperam). Só os testes usam o modo antigo.
17. **G2, o que eu completei (confirme ou mande mudar):**
   - *Diagnóstico:* a dificuldade já chegava à partida (conferi lobby → config → partida), mas quase não se sentia: os bots corriam todos à mesma velocidade; só um bot pressionava; o bote só disparava a 1,6 m do portador e **mirava onde a bola estava** (o portador anda, o bote errava); o bot que perseguia a bola mirava 0,25 s à frente sem calcular interceptação; e os outros defensores (os que "fecham" e os de apoio) **nunca** davam bote, mesmo com o portador passando em cima deles. Reação (0,22 s contra 0,12 s) e chance de bote (30% contra 50%) quase não se percebem.
   - *Números que escolhi* (todos em `BOT` no `constantes.ts`; Fácil / Médio / Difícil): velocidade 88% / 96% / 100%; alcance do bote 1,2 / 1,5 / 1,7 m; chance de bote por decisão 14% / 22% / 32%; antecipação 0,2 / 0,4 / 0,6 s; mira do bote 0 / 0,06 / 0,12 s. Reação e erro de passe ficaram como estavam.
   - *O que tentei e tirei:* Difícil com **2 bots pressionando** deixava o jogo injusto (a bola trocava de time 500 vezes por partida e o driblador perdia a bola a cada 0,6 s). Deixei 1 pressionando nos três (o código aceita mais, é só mudar `BOT.pressionam`).
   - *Não dei carrinho aos bots* (só bote): carrinho de bot gera falta e fica injusto para o humano. Posso liberar só no Difícil se você quiser.
   - *Não mexi no bote do humano* (alcance 0,8 m, avanço de 0,25 s), só na mira dos bots.
   - *Dificuldade por time* (`Partida.dificuldades`) existe só para o simulador e os testes; no jogo a dificuldade continua sendo uma só, a do Dono.
23. **H5, o que eu completei (confirme ou mande mudar):**
   - **Pendências suas:** (a) o **nome oficial e a cidade do Pé de Sapo**: por enquanto `nomeOficial: "Pé de Sapo"` e `cidade: "A definir"` no `times.json` (a cidade só aparece na vitrine `?vitrine=1`); (b) o **glb novo com o corpo em uma malha só** (e o rosto separado): o carregador aceita qualquer número de peças com o material "Skin", então basta trocar `apps/web/public/boneco/model-brasilero-3d-rig.glb` (mesmos nomes de osso e de animação) e conferir o `?debug=1`.
   - **Desempenho com o glb atual (20 peças):** 562 draw calls (limite 300; o jogador por código eram 82), 83 mil triângulos. Draw call não depende da placa de vídeo, então o número vale para o seu PC; o fps que medi não (meu navegador roda sem placa). **Não fundi nada em código** (você pediu). O que fiz sem fundir: as peças de um jogador **dividem um esqueleto só** (o `SkeletonUtils.clone` dava um por peça: 21 por jogador, 291 texturas de ossos e 21 atualizações por quadro por jogador). Agora são 63 texturas no total e o meu teste por software foi de 3 para 22 fps.
   - **A corrida não casa com o chão na velocidade máxima:** o clipe `correr` tem passada curta (o pé de apoio anda 2,34 m/s do jogo a 1x). Para acompanhar 7,6 m/s ele teria de tocar a ×3,2 (vira borrão), então limitei a ×2,5 (`ESCALA_MAX_DA_CORRIDA`) e o pé **desliza um pouco** na máxima. Veja no jogo e me diga se prefere mais rápido (mais borrão) ou mais lento (mais deslize).
   - **Chute:** o protocolo não diz o pé, então escolho pelo lado da bola (`chutar_esq` se ela está à esquerda do corpo). O estado dura 0,3 s e o clipe 0,8 s: toco a ×2,7 começando no quadro 8, para o pé bater na bola ~0,1 s depois de o estado começar (o servidor solta a bola na hora).
   - **Goleiro:** o mergulho "esq" do servidor é o lado -Z do campo; para o goleiro que olha para -X troco os clipes (conferi no jogo: o goleiro do gol de +X usa `gk_mergulho_esq` quando o servidor manda "dir"). `gk_defesa_alta` quando a bola está acima de 1,5 m no começo do mergulho (palpite meu). O estado de mergulho dura 0,45 s: toco a ×1,6 e ele volta a `gk_parado` (levanta de uma vez, sem animação de levantar).
   - **Sem animação própria:** passe (usa o chute), carrinho, queda, cabeceio, recepção, cobrança e goleiro com a bola; "andar" não existe (meia inclinação toca `correr` mais devagar). Em carrinho e queda o jogador fica em pé (não deitei por código, você não pediu).
   - **Rosto, cabelo e skin por jogador:** o servidor não manda isso. Rosto (5 tipos) e cabelo (7 cortes x 5 cores) saem do `slot` (`aparenciaDoSlot`; os 12 jogadores nunca repetem corte e cor). A skin é do time, então o time inteiro tem o mesmo tom de pele. Escolher no lobby precisa de protocolo (não fiz).
   - **Skins:** 4 PNGs em `apps/web/public/boneco/skins/` (`vasco`, `corinthians`, `saopaulo`, `pedesapo`), copiados sem mexer. O PNG só vale na camisa **titular**; na camisa reserva (choque de cores) e no goleiro vale a skin gerada. A gerada pinta os 7 padrões do `times.json` (nas costas a faixa e a metade continuam em volta do corpo) e a bermuda leva o `calcao`; **o meião não aparece** (a skin do boneco não tem meia, as pernas são pele).
   - **Regra 7 do `CLAUDE.md`** atualizada (skins feitas por você valem), como você pediu.
   - **Nada apagado.** `modelo.ts`, `animacoes.ts` (Mixamo), `corpos.ts` e `pose.ts` (jogador por código) continuam no lugar: o jogador por código agora é só a reserva se o boneco não carregar, e o modo leve (L) continua trocando para cápsulas. **SPEC 7.3 e ARQUITETURA 6.2 ficaram desatualizadas** e não mexi (o guia só muda com o seu aval): quando você aprovar o resultado, eu proponho o texto novo.
22. **H4, o que eu completei (confirme ou mande mudar):**
   - **Nome do chute:** o `HUD` não mostra mais nada (tirei o elemento e o CSS) e o teste do telão agora confere que nenhum arquivo do telão tem os textos. O arquivo `apps/web/src/tela/tipo-chute.ts` ficou **vazio de propósito** (você mandou não apagar): **posso apagar?** O evento `chute` continua levando `tipoDeChute` (só ninguém desenha). `TIPO_CHUTE.textoS` saiu de `constantes.ts`.
   - **Bola recuada (decisão):** o jogo não tinha regra de recuo. Criei esta, a mais simples: se o **último golpe de pé** na bola (passe, chute ou lançamento) foi de um **companheiro do goleiro** e **ninguém mais tocou nela depois**, ela é "só de pé". Não faço distinção de intenção (um chutão do companheiro que sobra para o goleiro também conta). Nessa bola o goleiro **não mergulha, não espalma e não pega com a mão**: se alinha à linha da bola, a recebe com o pé (recepção reforçada do passe, `RECEPCAO_PASSE`) e joga de pé em até 0,8 s (passe rasteiro ao companheiro livre com a linha limpa, ou chutão para longe e para o lado). Se um adversário toca na bola, ela deixa de ser recuada na hora (o chute dele é jogo normal e o goleiro defende).
   - **Mãos ou pés:** a bola vem para as **mãos** (`maos = true`) quando ele a pega de um chute adversário ou de bola solta fora de reinício; vem para os **pés** quando foi recuada ou no tiro de meta. Mãos: segura 1,2 s no máximo (`GOLEIRO.maosS`) e lança por cima; pés: 0,8 s (`peS`). Se há adversário a menos de 2,2 m, ele distribui assim que passam 0,35 s (`segurarMinS`, a bola precisa assentar). O antigo `esperaComBolaS` (1,5 s) saiu.
   - **Segurar a defesa:** chute abaixo de 18 m/s (relativo ao goleiro) é segurado, e agora também **no mergulho** (antes a bola de quem estava no ar não era pega, a não ser que passasse de 18 m/s e fosse espalmada). Chute forte (acima de 18 m/s) continua espalmado, como hoje, com a mesma chance de falha por dificuldade. A bola segurada não rebate. O goleiro que acabou de segurar mantém a bola até 1,25 m de distância (a mola traz ela às mãos).
   - **Proteger a bola:** com a bola, ele vira o corpo (12° por passo) para ficar de costas para o adversário mais próximo; a bola fica no ponto de condução à frente do corpo, do lado oposto. O adversário **não rouba da mão**: bote já não pegava do goleiro; agora o **carrinho também não** (o contato vira falta pelas regras normais).
   - **Lançamento do goleiro e domínio garantido (REGRA DE JOGO, não física):** o goleiro lança por cima no companheiro livre **mais próximo** (sem adversário a menos de 4 m dele; entre 7 e 42 m; nunca no meio na frente do gol). Durante o voo: (1) o adversário **não consegue tocar na bola** (nem corpo, nem bote, nem carrinho, nem o goleiro adversário), (2) a bola vira de leve na direção do receptor (como o passe da H3) e (3) quando chega a 1,6 m do receptor ele a **domina com 100% de certeza**, humano ou bot, e a velocidade da bola cai à dele nesse instante. Não é física: é regra para o lançamento do goleiro nunca virar bola perdida (`PasseEmVoo.garantido`). O controle passa a quem recebe, como em todo passe. Sem ninguém livre, a bola vai a 30 m à frente e a 5 m da linha lateral, do lado oposto ao adversário mais perto (nunca para o centro na frente do gol), sem garantia de domínio (é um chutão por cima).
   - **Saída no 1 contra 1:** quando o atacante com a bola está sozinho com o goleiro (nenhum companheiro do goleiro entre ele e o gol, nem a menos de 4 m dele) e a até 20 m do gol, o goleiro avança da linha de **2 m** (atacante a 20 m) até **4 m** (atacante a 13 m), e **volta a 2 m** quando o atacante já está colado na área (7 m ou menos), onde sair mais não ajuda (`GOLEIRO.saida`). Só a posição muda; a velocidade dele é a mesma. Com o chute vindo, ele **não recua** (antes recuava para a linha enquanto a bola voava).
   - **Cavadinha (item 20):** agora é viável nesses lances. O modelo da cavadinha supunha o goleiro recuando a 6,5 m/s enquanto a bola voa; como ele não recua mais, mudei `goleiroRecuoMS` para 1,5. No simulador, o AUTO escolhe cavadinha em **6%** dos chutes e, quando escolhe, faz gol em **67%** (mira no canto) ou 39% (mira no meio). Se achar forte demais, é só diminuir `TIPO_CHUTE.cavadinha.distanciaMaxM` (16 m) ou subir `goleiroAdiantadoM`. **Atenção:** com a cavadinha e a saída do goleiro, o 1 contra 1 de 11 a 15 m passou de 3-13% de gol (H3) para 23-35% no simulador (tabela H4). Se achar fácil demais: diminua `GOLEIRO.saida.adiantadoMaxM` (4 m) ou restrinja a cavadinha como acima.
   - **Chapada (efeito colateral da saída do goleiro):** com o goleiro 1,2 m ou mais fora da linha ele fecha o ângulo e a chapada rendia menos que o chute reto; agora, no ângulo fechado perto do gol, **o jogo escolhe chute reto quando o goleiro saiu** (`TIPO_CHUTE.chapadaGoleiroAteM`) e chapada só com o goleiro na linha. Os testes de taxa de gol por tipo (H2) tiveram a tolerância aumentada de 2 para 5 pontos e o teste "chapada rende mais que o reto" virou "o automático rende pelo menos o que o reto", porque eles foram calibrados para o goleiro antigo.
   - **Descoberta importante (goleiro mergulhava cedo demais):** o goleiro começava o mergulho 0,22 s depois de ver o chute e o mergulho dura 0,45 s; depois ficava no chão. Chute de média e longa distância demora mais que isso para chegar, então ele já estava caído quando a bola passava (no simulador, de 41% a 60% de gol entre 23 e 27 m com força máxima, e até 93% com força 0,85!). Agora ele só mergulha quando a bola chega em até 0,53 s (`GOLEIRO.mergulhoFolgaS`). Isso foi o que mais derrubou o chute de longe; o ajuste do item 3 por cima disso é leve. Ele também afeta os chutes dos bots (que chutam até 18 m), mas o simulador de bots mostra o equilíbrio igual (tabela).
   - **Chute de muito longe (item 3):** as medidas reais: o campo 5 tem **60 m**, o meio de campo é a **30 m do gol (50%)**, então "60% do campo" seriam 36 m e não pegariam o meio de campo. Escolhi o efeito sobe suave de **30% (18 m) a 60% (36 m)** do comprimento do campo (`CHUTE.longe`): a velocidade perde até **15%** e o erro de direção ganha até **±12°** (além do normal). No meio de campo (50%) o efeito já está em uns 74%. Vale para o chute reto, o canudo, a chapada e a trivela (a cavadinha é só até 16 m).
   - **Mira do chute (item 4):** com o chute apontando para o gol (dentro da margem da mira assistida), o erro sorteado do humano é multiplicado por **0,8** (`CHUTE.ajudaGol.erroFator`). Os bots não mudam. A medição mostra um efeito pequeno (de 0 a 3 pontos de gol entre 8 e 23 m, e nada de longe): não achei exagero, deixei em 20%. Se quiser sentir mais, diminua para 0,6.
   - **Testes que mudei por causa dessas decisões (nada foi afrouxado sem motivo):** `goleiro.test.ts` (o goleiro agora solta a bola em 1,2 s; o tiro de meta em 0,8 s; chutes fortes de teste saem de 20 m para não virarem cavadinha), `chute-tipos.test.ts` (tolerâncias e 3 casos do goleiro que sai da linha), `acoes.test.ts`, `partida.test.ts` e `reinicios.test.ts` (chutes de teste passaram do meio de campo para perto do gol, porque de longe a bola sai mais fraca).
21. **H3, o que eu completei (confirme ou mande mudar):**
   - **Velocidade máxima: 7,6 m/s, não 8,2 (decisão que você pediu para explicar).** Você mandou correr sempre na velocidade da antiga corrida (8,2). Medi 8,2, 7,4 e 7,6 (`npm run medir` e `npm run simular`): com 8,2 o campo atravessa em 7,5 s e a bola conduzida (90%) vai a 7,4 m/s, quase a velocidade de um passe fraco, e o equilíbrio dos bots da G2 (bote, goleiro) precisaria de mais ajuste; com 7,4 ficou parecido com antes. Escolhi **7,6 (7% abaixo de 8,2)**: atravessa o campo em 8,1 s (antes: 9,2 s andando e 7,5 s correndo). Para mudar é um número só: `JOGADOR.velocidadeMax` em `constantes.ts` (a aceleração e a freada precisam acompanhar: estão escaladas pela razão das velocidades). Se quiser os 8,2 exatos, troque para 8,2 e rode `npm run medir` e `npm run simular`.
   - **Velocidade segue a inclinação do joystick** (curva suave, sem degrau): parado até 0,10 de inclinação, velocidade máxima a partir de 0,95, entre os dois uma suavização (smoothstep). Meia inclinação (0,5) anda a 3,5 m/s; 0,3 anda a 1,1 m/s. Os bots usam a mesma curva (mandam a inclinação que dá a fração de velocidade da dificuldade deles).
   - **Bots:** as frações da G2 não mudaram (Fácil 88%, Médio 96%, Difícil 100% da velocidade máxima), mas agora sobre 7,6: eles correm a 6,7, 7,3 e 7,6 m/s (antes 5,7, 6,2 e 6,5, porque a velocidade máxima de antes era a de andar). O bote subiu de 9 para 9,5 m/s e o carrinho começa a 9,5 (todo mundo corre mais); testei 8,0 a 10,5 e 9,5 foi o que manteve o acerto dos botes perto do que era. A cavadinha ficou ainda mais rara: o goleiro, na velocidade nova, acompanha a bola (só é viável a 16 m com ele a 10 m da linha); o modelo usa 6,5 m/s para o recuo dele. O item 20 continua valendo.
   - **O campo ficou mais gol-eiro:** no simulador de bots os gols por partida subiram (ver tabela). Os testes de equilíbrio (Difícil continua dominando o Fácil) passam; ajustei limites de testes de gols (de 35 para 60 em 8 min) porque o jogo ficou mais ofensivo.
   - **Botões do celular:** sem o CORRER sobrou espaço; o PASSE ficou maior (de 22 para 28% da menor dimensão da tela, até 160 px) e foi para perto do CHUTE. A barra de carga do chute ocupa o lugar da barra de energia. O pacote do controle não mudou de tamanho: o bit 2 (que era CORRER) ficou livre.
   - **Passe, o que mudou** (`PASSE` em `constantes.ts`): **um conjunto só** de ajuda (cone de 80°, mira em cheio), em vez de um por dificuldade; o `PASSE.ajuda` de antes (Fácil 100%/100°, Médio 85%/75°, Difícil 60%/55%) acabou. A bola sai a `10 + 1,0·d` m/s entre 12 e 22 (era `6 + 0,9·d`, entre 8 e 16) e perde só 55% da desaceleração normal enquanto viaja (`desaceleracaoFator`). No último terço (a partir de 66% do trajeto, com subida suave nos 12% seguintes) a direção da bola gira em direção ao receptor, **no máximo 2,4 rad/s** (uns 137°/s), com a mesma rapidez, mirando onde o receptor estará daqui a até 0,3 s. Acaba sozinha se alguém tocar na bola (domínio, bote, defesa do goleiro, corpo de um adversário na frente, trave), se a bola passar do receptor, ou depois de 4 s. O lançamento por cima **não** segue (é balístico), mas tem a recepção forte.
   - **Recepção do passe** (`RECEPCAO_PASSE`): o receptor pretendido, humano ou bot, começa a amortecer com a bola a até 2,4 m (a comum é 1,6 m) e até 32 m/s (a comum é 22), amortece em 0,045 s (a comum, 0,07 s) e puxa a 60 m/s² (a comum, 38) por 0,3 s. Sem recarga para ele. O resto dos bots continua sem recepção (G2 intacta).
   - **O passe do bot não ficou perfeito:** o bot continua com o erro de mira da dificuldade dele (ele é o nível de dificuldade, não o assistente de mira); mas a bola agora também segue o receptor no fim, o que corrige um pouco do erro dos bots.
   - **A mira (anel e texto) aparece sempre que há companheiro:** como o passe agora nunca "fica sem destino" para o humano, o anel aparece mesmo com o joystick apontando para longe de todos (vai para o mais perto da direção).
20. **H2, o que eu completei (confirme ou mande mudar):**
   - *O que existia de efeito na bola:* **nada** (só gravidade, arrasto do ar, quique e atrito rolando; a SPEC deixava a curva para "F6 ou depois"). *O que criei:* `giro` na bola (`BOLA.giro*` em `constantes.ts`), que gira o rumo da velocidade horizontal sem mudar a rapidez, com decaimento (2 s no ar, 0,25 s no chão). Não é Magnus de verdade; é o mínimo que faz a bola curvar. Os testes de física antigos passam sem mudança (bola sem giro = igual a antes).
   - *Quem leva o tipo:* só o chute do **humano** com a bola em jogo. Bots, voleio, escanteio e falta chutam como antes (G2 intacta). **Toque rápido (carga abaixo de 0,3) continua o chute fraco de sempre**, para dar para colocar a bola; o tipo vale quando o jogador carrega o chute.
   - *Regras de escolha* (todas em `TIPO_CHUTE`): só se o chute aponta para o gol e o jogador está a até 32 m. Abertura do gol vista do jogador: 26° ou mais e até 20 m = **canudo**; abaixo de 18° e até 20 m = **chapada**; entre 18° e 26° até 24 m = **trivela** (e também com marcador a menos de 2,5 m, gol aberto e mais de 10 m); **cavadinha** com jogador livre, 6 a 16 m, quando há trajetória viável por cima do goleiro; fora disso, o chute reto de sempre.
   - *Medido no simulador* (ver tabela abaixo): a chapada é o tipo que mais ajuda (ângulo fechado perto: 33% contra 17% do reto, mira no canto). O automático rende o mesmo ou um pouco mais que o reto (+5, 0, +3 e −2 pontos nos quatro cenários); **a trivela não rende mais que o reto** (a ideia dela é o efeito e a variedade, não um chute melhor), e **de longe a curva não compensa** (o reto rende igual ou mais), por isso acima de 20 m o chute fica reto. A **chapada forçada perto do gol com o gol aberto rende 2 a 3 vezes o canudo** (64 a 75% contra 25 a 47%): é o tipo mais forte, mas o automático **não** a usa ali (a regra pede canudo, como você descreveu). Se quiser, é só mudar a regra em `escolherTipoDeChute`.
   - **Cavadinha (decisão sua):** está implementada e testada na física (passa por cima do goleiro e entra, se ele estiver fora do lugar). Mas o goleiro atual fica de 1 a 2 m da linha e **recua a 2 a 4 m/s enquanto a bola voa**, e o travessão tem 2,2 m e o alcance dele é 2,0 m em pé e 2,4 mergulhando: contra ele a cavadinha só é viável com ele a **7 m ou mais da linha**, o que quase nunca acontece. Por isso ela é escolhida só quando é viável e, na prática, **quase não aparece**. Não mexi no goleiro (alteraria o equilíbrio da G2). Opções: (a) deixar assim; (b) o goleiro sair mais da área em lances 1 contra 1 (mexe na G2); (c) subir o travessão. Me diga.
   - *Efeito e goleiro:* o goleiro prevê o chute simulando a bola com o mesmo giro, então ele "lê" a curva; a vantagem da chapada é geométrica (ângulo e tempo de reação), não um truque.
   - *Chão escorregadio, o que medi:* a causa era a mudança de direção: a troca de velocidade usava só 18 m/s² nos dois eixos, então o jogador derrapava de lado a até 4,8 m/s depois de virar. Mudei para duas partes: ao longo do movimento (aceleração 18, freada 28, 34 ao soltar o joystick) e para o lado (30 m/s²). **A velocidade máxima (6,5) e a arrancada (8,2) não mudaram, nem a aceleração da largada, nem a física da bola.** Bots usam a mesma física: refiz o simulador da G2 e o equilíbrio se manteve (Difícil ainda domina o Fácil).
   - *Patinação do pé na animação:* em corrida reta é zero por construção (a cadência vem da velocidade, G3); na curva o que "patinava" era a derrapagem lateral, que caiu de 4,8 para 2,7 m/s.
19. **H1, o que eu completei (confirme ou mande mudar):**
   - *Recepção só para humanos.* Os bots ficam com o domínio de antes (mexer neles mudaria o equilíbrio que medi na G2). Efeito que já espero: o **adversário humano** também amortece e puxa a bola que passa perto dele, então interceptar um passe ficou mais fácil para ele também.
   - *Números da recepção* (`RECEPCAO` em `constantes.ts`): começa com a bola a até 1,6 m do centro do jogador, abaixo de 0,9 m de altura, chegando (ou quase parada) e a menos de 22 m/s em relação a ele; dura 0,2 s; recarga de 0,7 s; amortece a velocidade relativa com constante de 0,07 s e puxa com 38 m/s². Chute muito forte (acima de 22 m/s) ainda quica no corpo.
   - *Animação nova `Recepcao` (id 14)* no protocolo; o pé sobe ao encontro da bola e recua puxando.
   - *(Substituído na H3: agora é uma ajuda só, igual nas três dificuldades; ver item 21.)* *Ajuda do passe por dificuldade* (`PASSE.ajuda`; força da ajuda / abertura do cone): Fácil 100% e 100°, Médio 85% e 75°, Difícil 60% e 55%. **O Médio agora ajuda mais do que antes** (antes era cone de 60° sem mistura): se achar fácil demais, baixe o Médio.
   - *Joystick solto escolhe o companheiro mais à frente e livre* (nota: 50% avanço, 30% linha livre, 20% distância ideal). No lançamento (PASSE segurado) sem joystick continua o mais avançado no cone da frente do corpo.
   - *O tempo de voo do passe agora usa a física real da bola* (atrito mais arrasto), com erro abaixo de 3% de 5 a 25 m; o ponto de encontro fica dentro das linhas do campo.
   - *A mira só aparece enquanto PASSE está apertado com a bola.* No toque rápido ela pisca por uma fração de segundo; depois de 0,25 s segurando vira "Lançamento" (anel amarelo). É mostrada a todos os telões (cada telão é uma tela do mesmo jogo).
   - *Só o passe do humano leva a ajuda* (bots e cobrança automática de 5 s não).
18. **G3, o que eu completei (confirme ou mande mudar):**
   - *O jogador:* cabeça, tronco, calção, coxa, canela, chuteira, braço e antebraço em formas básicas do Three.js (cilindros, esferas, caixas). Pele em 5 tons, escolhidos pelo número do jogador (só enfeite). A camisa leva o padrão e as cores do clube pelo shader da F5 (listras, faixa diagonal etc.); o goleiro usa a cor fixa (amarelo ou laranja), calção preto.
   - *Animações por código* (`pose.ts`): parado (respira), corrida e arrancada, chute, passe, carrinho, queda, comemoração, cabeceio, cobrança, goleiro parado, goleiro com a bola e goleiro mergulhando (esquerda e direita). A passagem de uma para outra é suave. **A cadência da corrida sai da velocidade real** (`ω = v / (comprimento da perna × amplitude)`), então o pé de apoio anda para trás à mesma velocidade que o jogador corre (testado de 1 a 9 m/s).
   - *Medi e corrigi:* os pés afundavam até 15 cm no gramado na corrida. Agora ficam a no máximo 2 cm abaixo do chão em todas as poses em pé (teste permanente).
   - *Desempenho:* 82 draw calls no jogo (as cápsulas eram 64; limite 300) e ~24 mil triângulos. O fps que medi (8 fps) é do navegador sem placa de vídeo desta máquina, não diz nada sobre o seu PC. O modo leve (L, ou automático abaixo de 45 fps) volta para as cápsulas; `?capsula=1` também.
   - *Não feito:* **número nas costas da camisa** (você disse "se couber"; o número continua em cima do bot). Dá para fazer com um atlas de números numa próxima rodada.
   - *Obsoleto, NÃO apaguei:* o caminho do Mixamo e do Blender (`ferramentas/blender/montar_jogador.py` e `LEIA-ME.md`, o carregador de GLB em `modelo.ts` e `animacoes.ts`, o gerador `npm run boneco-teste`, os itens 5 e 6 de teste da F6, o passo 7 do `guia-manual`, que é seu). O jogo só usa um `jogador.glb` se alguém o puser em `apps/web/public/modelos/`. **Posso apagar esses arquivos?**
12. **F5, o que eu completei (confirme ou mande mudar):**
   - *Conflito de cor:* se as camisas dos dois clubes ficam parecidas (diferença de cor ΔE < 25), o Visitante usa o uniforme reserva; se ainda assim parecer, usa branco ou preto. Conferi os 132 pares de clubes do `times.json`: nenhum fica abaixo de 25.
   - *"Aleatório":* aparece como opção de clube no lobby; o servidor sorteia na hora de começar e a Revanche mantém os mesmos clubes sorteados.
   - *Escudos:* só os PNGs que você colocar em `apps/web/public/escudos/<id-do-clube>.png` (ver o LEIA-ME.txt lá). Sem arquivo aparece um distintivo neutro com a sigla nas cores do clube. Não coloquei nenhum escudo nem camisa real.
   - *Goleiros e bots:* goleiro em cor lisa fixa (amarelo/laranja), bot mostra o número da camisa, humano mostra o apelido e a seta.
14. **F7, o que eu completei (confirme ou mande mudar):**
   - *Som:* tudo gerado por código (nenhum arquivo de áudio). Só o telão **principal** toca por padrão; extras ficam mudos até a pessoa ligar. A escolha de mudo fica guardada no navegador. A torcida de fundo sobe com a bola perto do gol e fica alta por 3 s depois de um gol.
   - *Telão sem clique:* se a página recarrega com a sala (`?sala=`) o navegador não deixa tocar até o primeiro clique; o botão fica amarelo piscando ("Clique para ativar o som").
   - *Ícones:* desenhados por código (`node ferramentas/gerar-icones.mjs`): uma bola com anel amarelo num gramado. Se quiser outro desenho, mande um PNG de 512 px que eu troco.
   - *Manifest:* abre em `/controle.html`, tela cheia e deitado. O telão não é "instalável" (só o controle).
   - *Rota de teste nova:* `POST /teste/relogio` (só com NODE_ENV=test), para ver a tela de fim sem esperar 4 min.
15. **F8a/F8b, o que eu completei (confirme ou mande mudar):**
   - *Eu escolhi os dois extras* porque você pediu "os próximos 3" e só a F7 é uma fase fechada do guia. Escolhi o que não mexe no jeito de jogar e que muda a festa: campeonato, gol de ouro e câmera que segue. Se preferia outros (goleiro humano, pênalti, chuva...), me diga.
   - *Campeonato:* as linhas são por **clube** (o clube que o Dono escolheu em cada partida) e por **apelido** do jogador (sem ligar para maiúscula). Fica só na memória da sala (some quando a sala fecha). Conta toda partida que chega ao fim, inclusive a Revanche. Um humano que entrou no meio herda as estatísticas da vaga do bot que ele assumiu (limite que aceitei).
   - *Gol de ouro:* desligado por padrão; prorrogação de 120 s (`PARTIDA.prorrogacaoS`); recomeça com bola ao centro; se ninguém marcar, empata. Um telão que abre **durante** a prorrogação não mostra a etiqueta "GOL DE OURO" (o aviso vai só no momento em que ela começa), mas o relógio e o resto funcionam.
   - *Câmera que segue:* a orientação é a da TV (não gira junto com o jogador, para não dar enjoo); a bola puxa a câmera no máximo 5 m. Só segue humanos.
13. **F6, o que eu completei (confirme ou mande mudar):**
   - *Comemoração do gol subiu de 3 s para 6 s* (`PARTIDA.golComemoracaoS`): 1,4 s de "GOOOL" e depois o replay de ~4 s em câmera lenta (0,8x) atrás do gol. O relógio continua parado nesse tempo.
   - *Estilo:* noite com refletores, céu com estrelas, bloom leve (brilho nos refletores), sombras de um "sol" de transmissão, torcida de 3 silhuetas nas cores dos dois clubes que pula no gol. Tudo opcional: o modo leve desliga sombras, torcida 3D e bloom.
   - *Modo leve automático:* abaixo de 45 fps por 3 s seguidos liga sozinho (e só liga, não desliga sozinho). Na mão: tecla **L** ou o botão no canto do telão. `?debug=1` mostra fps, draw calls, triângulos e o atraso de interpolação.
   - *Medidas (telão no Edge, sem placa de vídeo, só software):* 64 draw calls (limite 300), 9 mil triângulos, site compilado com 0,8 MB (limite 15 MB; o `jogador.glb` ainda vai somar o tamanho dele, comprimido).
   - *Modelo 3D:* se existir `apps/web/public/modelos/jogador.glb` o telão usa; senão, cápsulas (como na F2 a F5). `?capsula=1` força as cápsulas, `?modelo=nome` testa outro arquivo de `modelos/`. A camisa do modelo recebe o padrão do clube pelo mesmo shader da F5 (o material precisa se chamar `Camisa`); calção e meião só trocam de cor.
   - *O que NÃO foi feito:* conferir o visual com o personagem real e com as animações do Mixamo (não tenho o arquivo), e rodar o script do Blender.
   - *PCF de sombras:* usei o tipo `PCFShadowMap` (o "Soft" está marcado como obsoleto no Three.js 0.187).

## Testes que o Samuel precisa fazer
G1 (controle estilo FIFA; no site do Render, com 2 celulares no mínimo; o ideal é 3 + 3):
1. Entre com 2 celulares no mesmo time (os dois escolhem "Casa") e comece. Cada celular tem a faixa de cima com o número do **jogador que ele controla agora**; no telão, só esses dois jogadores têm **seta, anel no chão e apelido** na cor do time. Os outros têm só o número.
2. **Com a bola:** quem estiver com a bola é controlado por um de vocês (o primeiro que entrou, se nenhum controlar o portador). Passe (toque em PASSE): na hora em que a bola sai, **o controle e a seta vão para quem recebeu**, e a faixa do celular **pisca** com o número novo. Com 2 humanos, o outro celular não troca (a menos que o passe vá para o jogador dele).
3. **Fila:** com 3 celulares no time, passem a bola para um bot várias vezes: o controle do bot que recebe vai rodando entre os humanos (quem passou vai para o fim da fila).
4. **Sem a bola:** deixe o time sem a bola. Seu jogador troca sozinho para o companheiro mais perto da bola, **sem ficar trocando toda hora**. Aperte **CHUTE** (agora escrito "TROCAR"): vai para o próximo companheiro mais perto da bola. Se o time inteiro dos humanos estiver na defesa e a troca parecer rápida ou lenta demais, me diga (os números estão em `TROCA`).
5. **Carrinho:** o botão PASSE sem a bola diz "BOTE / segure: carrinho". Toque rápido = bote; segurando mais de 0,3 s = carrinho.
6. **Queda:** desligue o Wi-Fi de um celular por 5 s e religue: um bot joga no lugar dele, e ao voltar ele recebe o companheiro mais perto da bola. Ninguém fica sem jogador.
7. **Entrar no meio:** entre com um celular novo no meio da partida: ele pega um bot do time com menos humanos (máx. 3 por time). O 4º no mesmo time recebe "Esse lado já tem 3 jogadores". A sala aceita no máximo 6 controles.
8. **Fim de jogo e tabela (T):** o artilheiro e os gols saem no **seu apelido**, mesmo que você tenha trocado de jogador antes de a bola entrar.
G2 (bots; no site do Render, 1 ou 2 celulares, o resto é bot):
1. Escolha **Bots: Fácil**, jogue 2 minutos: os bots têm que ser **visivelmente mais lentos** que você, quase não dão bote, passam e chutam mal. Dá para driblar e fazer gol com facilidade.
2. Troque para **Médio** (Revanche com o Dono mudando a opção no lobby): eles correm quase tanto quanto você e dão bote se você passar a menos de ~1,5 m. Você perde a bola de vez em quando.
3. Troque para **Difícil**: correm tanto quanto você, antecipam para onde a bola vai, dão bote de mais longe (~1,7 m) e mais vezes. Para ficar com a bola é preciso passar e proteger. **Se achar demais (ou de menos), me diga qual nível e eu mexo em `BOT` no `constantes.ts`.**
4. Confira se os **companheiros bots** também roubam a bola dos adversários (eles agora dão bote ao alcance mesmo quando não são o que está indo na bola).

Números do simulador (`npm run simular -- --partidas 6`; média por partida de 8 min, modo Campo, 5 de linha, semente fixa; "perdas/min" = quantas vezes um bot toma a bola de um driblador humano de mentira por minuto com a bola):

| Dificuldade | Antes: botes tentados (C+V) | Antes: desarmes (C+V) | Antes: perdas/min do driblador | Depois: botes (C+V) | Depois: desarmes (C+V) | Depois: perdas/min do driblador |
|---|---|---|---|---|---|---|
| Fácil | 63 | 34 | 5,0 | 41 | 24 | 3,7 |
| Médio | 149 | 67 | 12,3 | 155 | 94 | 17,2 |
| Difícil | 236 | 80 | 24,8 | 233 | 128 | 36,3 |

Bots de dificuldades diferentes (Casa:Visitante, gols por partida). Antes: Difícil:Fácil 16,3 x 4,5; Difícil:Médio 12,0 x 5,8; Médio:Fácil 11,5 x 4,8. Depois: **Difícil:Fácil 14,2 x 0,8; Difícil:Médio 13,7 x 3,2; Médio:Fácil 10,3 x 3,3.** O Difícil agora ganha de forma clara e o Fácil quase não marca.

Qual parece mais divertido: o driblador de mentira é burro (corre em zigue-zague sem passar nem proteger a bola), então o humano de verdade perde menos que esse número. Mesmo assim, no Difícil ele perde a bola a cada ~1,7 s, o que é duro de propósito; no Médio, a cada ~3,5 s; no Fácil, a cada ~16 s. Minha recomendação: **Médio como padrão**, Fácil para quem nunca jogou. Se o Difícil estiver frustrante, baixe `BOT.chanceBote.dificil` (0,32) para 0,25.

G3 (jogador feito por código; no site do Render):
1. Abra `SEU-LINK/tela.html?poses=1`: aparecem **13 jogadores fazendo cada animação** (H3: a arrancada saiu; de trás para a frente, da esquerda para a direita: parado, corrida, chute, passe, carrinho, queda, comemoração, cabeceio, cobrança, goleiro parado, goleiro com a bola, mergulho esquerdo e direito). Os golpes repetem em laço. `?poses=1&vel=7` muda a velocidade da corrida.
2. Jogue uma partida: os jogadores têm corpo, camisa com o padrão do clube, calção, meias e chuteiras. Olhe a **corrida**: as pernas têm que acompanhar a velocidade (sem "patinar") e acelerar com a velocidade (H3: não existe mais o botão CORRER). Chute, passe, carrinho, queda, gol (comemoração) e defesa do goleiro têm animação própria.
3. Aperte **L** (modo leve): voltam as cápsulas. `tela.html?capsula=1` também. Aperte L de novo: voltam os jogadores.
4. `?debug=1` mostra os draw calls (têm que ficar abaixo de 300; eu medi 82) e o fps do **seu** PC. Se o fps ficar baixo, me diga o número.
5. Diga o que achou do visual (proporções, cor da pele, tamanho): é estilizado de propósito. Dá para ajustar tudo em `apps/web/src/tela/corpos.ts` (formas) e `pose.ts` (movimentos).

H1 (recepção e passe com mira; no site do Render, o ideal é 2 celulares no mesmo time, o resto bots):
1. **Recepção:** peça a um amigo (ou use um bot) passar a bola rasteira para perto de você, sem apontar o joystick exatamente para a bola. Quando ela chega a ~1,5 m do seu jogador, ela **desacelera e vai para o pé**, com um movimento curto de amortecer (0,2 s), e você fica com a bola. Antes, ela passava reto dependendo do ângulo.
2. A bola **não teleporta**: dá para ver ela rolando até o pé. Uma bola que passa **longe** (mais de ~2 m), uma bola **alta** e um **chute muito forte** continuam como antes (passam, ou quicam no corpo).
3. **Mira do passe:** com a bola nos pés, **segure PASSE**: no celular aparece "Passe para #N" e no telão um **anel branco no companheiro e uma linha** até ele. Mexa o joystick: o alvo muda. Segurando mais de 0,25 s vira "Lançamento para #N" e o anel fica amarelo. Soltou, tudo some.
4. **Mire à frente:** solte o PASSE com um companheiro **correndo de lado**: a bola vai para o ponto onde ele vai estar, não para onde ele está. Teste nos três níveis (Dono muda "Bots" no lobby): no **Fácil** quase sempre acerta, no **Médio** acerta bem, no **Difícil** precisa apontar melhor (se o joystick estiver torto, a bola erra).
5. **Sem joystick** (solte o joystick e toque em PASSE): a bola vai para o companheiro **mais à frente e livre** de adversários.
6. Diga se a recepção está forte ou fraca demais e se o Médio ajuda demais: os números estão em `RECEPCAO` e `PASSE.ajuda` no `constantes.ts` (na H3 a ajuda virou uma só para as três dificuldades e a recepção de quem recebe o passe ficou mais forte: `RECEPCAO_PASSE`).

H2 (chute com tipo e chão; no site do Render, 1 celular, o resto é bot):
1. **Chão:** corra e solte o joystick: o jogador **para firme** (uns 0,6 m). Corra e vire 90° ou 180° com o joystick: ele vira **bem mais rápido, sem deslizar de lado**. A velocidade máxima é a mesma. Se achar que ficou travado, ou ainda escorregadio, diga: os números estão em `JOGADOR` (`freada`, `freadaSolto`, `aceleracaoLateral`).
2. **Canudo:** pertinho do gol, de frente, **segure CHUTE** (não só toque) e solte: sai reto e forte; aparece "Canudo!" no telão por 1 s.
3. **Chapada:** vá para perto da linha de fundo, de lado (ângulo fechado), mire no gol e **segure CHUTE**: a bola **curva** para dentro do gol e aparece "Chapada!".
4. **Trivela:** de uns 12 a 20 m, de frente ou meio de lado, segure CHUTE: a bola sai meio forte e curva para o lado contrário ao da chapada; aparece "Trivela!".
5. **Cavadinha:** quase nunca aparece (ver item 20 em "Dúvidas"). Se aparecer "Cavadinha!", a bola sobe e cai por cima do goleiro.
6. **Toque rápido** no CHUTE continua sendo o chute fraco de sempre (sem nome no telão). O CHUTE **sem a bola** continua trocando de jogador. Voleio, escanteio e falta não mudam.
7. Me diga: a curva está forte ou fraca demais? Algum tipo está bom demais ou inútil? (`TIPO_CHUTE` e `BOLA.giro*` no `constantes.ts`; para ver as taxas de gol, rode `npm run chutes`.)

Antes e depois do chão (`npm run medir`; joystick cheio, sem bola):

| Medida | Antes | Depois |
|---|---|---|
| Aceleração de 0 a 90% da velocidade | 0,33 s | 0,33 s (igual) |
| Velocidade máxima / arrancada | 6,5 / 8,2 m/s | 6,5 / 8,2 m/s (igual) |
| Frenagem ao soltar o joystick | 0,28 s e 0,83 m | 0,20 s e 0,57 m |
| Giro de 45°: alinha / derrapagem máx. | 0,22 s / 3,5 m/s | 0,13 s / 2,4 m/s |
| Giro de 90°: alinha / derrapagem máx. / velocidade mínima | 0,47 s / 4,8 m/s / 4,6 m/s | 0,23 s / 2,7 m/s / 3,8 m/s |
| Giro de 180° (inversão): alinha / derrapagem máx. | 0,70 s / 4,5 m/s | 0,57 s / 3,6 m/s |

Taxa de gol por tipo (`npm run chutes -- --sementes 6`: 54 posições do campo contra um goleiro de verdade, Médio; entre parênteses o número de chutes; "AUTO" é o que o jogo faz de verdade):

| Mira do jogador | Tipo | Perto aberto | Ângulo médio | Fechado perto | Longe | Geral |
|---|---|---|---|---|---|---|
| No canto | reto de antes | 36% (36) | 0% (72) | 17% (84) | 72% (132) | 38% |
| No canto | canudo | 47% | 0% | 10% | 22% | 17% |
| No canto | chapada | 67% | 0% | 33% | 59% | 40% |
| No canto | trivela | 31% | 0% | 19% | 70% | 37% |
| No canto | **AUTO** | 47% | 0% | 33% | 72% | **43%** |
| No meio (impreciso) | reto de antes | 25% | 13% | 24% | 60% | 36% |
| No meio (impreciso) | **AUTO** | 31% | 8% | 26% | 60% | **36%** |
| No meio, com marcador | reto de antes / **AUTO** | 6% / 17% | 2% / 8% | 12% / 15% | 37% / 37% | 20% / **23%** |
| No meio, Difícil | reto de antes / **AUTO** | 14% / 14% | 11% / 4% | 43% / 42% | 60% / 60% | 40% / **38%** |

Leitura: os tipos forçados fora da sua zona (canudo "longe", chapada "longe") não são a regra do jogo: servem para ver o quanto cada um rende. Nenhum tipo passa de 80% no geral. A **chapada perto do gol com o gol aberto** (67 a 75%) é o mais forte; o automático não a usa ali.

H3 (passe e correr sempre; no site do Render, 2 celulares no mesmo time é o ideal, o resto é bot):
1. **Celular:** não tem mais o botão CORRER nem a barra verde de energia. Sobraram **CHUTE e PASSE**, e o PASSE ficou maior, bem do lado do CHUTE. Se algum botão ficou torto na sua tela, me diga o modelo do celular.
2. **Correr sempre:** incline o joystick **todo**: o jogador corre na velocidade nova (7,6 m/s, sem cansar nunca). Incline **pela metade**: ele anda devagar (3,5 m/s) e dá para conduzir a bola sem ela fugir. Confira se a passagem de andar para correr é suave (sem degrau) e se **o campo está rápido demais**: se estiver, é só baixar `JOGADOR.velocidadeMax` em `constantes.ts` (ver item 21).
3. **Os bots também correm sempre:** Fácil ainda é mais lento que você, Difícil corre tanto quanto você. Veja se eles ainda dão para driblar (Fácil) e se o Difícil continua difícil, mas justo.
4. **Passe mirado:** aponte o joystick para um companheiro e toque PASSE: a bola sai **rápida e vai nele**, mesmo que o joystick esteja uns 20° torto. Faça o mesmo nas **três dificuldades** (Revanche mudando "Bots" no lobby): tem que ser **igual** nas três.
5. **Joystick apontando para longe de todos:** o anel e o "Passe para #N" vão para o companheiro **mais perto da direção**, e a bola vai para ele. **Joystick solto:** vai para o mais à frente e livre, como na H1.
6. **A bola segue o receptor:** passe para um companheiro que está correndo de lado: no fim do trajeto a bola **faz uma curvinha de leve** na direção dele (sem teleporte). Se um adversário se colocar na frente e tocar na bola, ela **não** curva mais para o receptor.
7. **Receptor:** o companheiro que recebe (você com o controle que passa para ele, ou o bot) **amortece e fica com a bola**, mesmo com ela chegando forte e a uns 2 m do pé. O bot que vai receber **corre ao encontro** da bola.
8. Me diga: o passe está **rápido demais ou lento demais**? A curva no fim está forte, fraca ou nem se nota? (`PASSE` e `RECEPCAO_PASSE` no `constantes.ts`; para ver a tabela do passe, rode `npm run tabela-passe`.)

Antes e depois do passe rasteiro (`npm run tabela-passe`; "saída" e "chegada" em m/s; tempo = da saída até chegar ao receptor parado):

| Distância | Antes: saída / tempo / chegada | Depois: saída / tempo / chegada | Ganho |
|---|---|---|---|
| 6 m | 11,4 / 0,57 s / 9,7 | 16,0 / 0,39 s / 15,1 | 32% mais rápido |
| 10 m | 15,0 / 0,74 s / 12,2 | 20,0 / 0,52 s / 18,3 | 29% |
| 15 m | 16,0 / 1,09 s / 11,8 | 22,0 / 0,73 s / 19,3 | 33% |
| 20 m | 16,0 / 1,54 s / 10,4 | 22,0 / 0,99 s / 18,5 | 36% |
| 25 m | 16,0 / 2,06 s / 9,0 | 22,0 / 1,27 s / 17,6 | 38% |
| 30 m | 16,0 / 2,67 s / 7,5 | 22,0 / 1,56 s / 16,8 | 42% |

A fórmula da saída era `6 + 0,9·d` (entre 8 e 16) e virou `10 + 1,0·d` (entre 12 e 22); o "amortecimento" é `PASSE.desaceleracaoFator = 0,55` (o passe perde só 55% da desaceleração normal enquanto viaja). Com a bola chegando a 15 a 19 m/s, o domínio comum (que só aceita até 14 m/s) não segura: quem segura é a recepção do passe (`RECEPCAO_PASSE`, até 32 m/s).

Antes e depois do movimento do jogador (`npm run medir`; joystick cheio, sem bola; "antes" é a H2):

| Medida | Antes (H2) | Depois (H3) |
|---|---|---|
| Aceleração de 0 a 90% da velocidade | 0,33 s | 0,33 s (igual) |
| Velocidade máxima | 6,5 m/s andando; 8,2 m/s na arrancada (com CORRER) | **7,6 m/s sempre** (com a bola, 6,84) |
| Atravessar os 60 m do campo | 9,2 s andando; 7,5 s correndo | 8,1 s sem a bola; 8,9 s com a bola |
| Frenagem ao soltar o joystick | 0,20 s e 0,57 m | 0,20 s e 0,66 m |
| Giro de 45°: alinha / derrapagem máx. | 0,13 s / 2,4 m/s | 0,13 s / 2,8 m/s |
| Giro de 90°: alinha / derrapagem máx. / velocidade mínima | 0,23 s / 2,7 m/s / 3,8 m/s | 0,23 s / 3,1 m/s / 4,5 m/s |
| Giro de 180°: alinha / derrapagem máx. | 0,57 s / 3,6 m/s | 0,57 s / 4,2 m/s |

(O tempo para alinhar e para frear ficou igual: a aceleração e a freada foram escaladas pela razão das velocidades. A derrapagem em m/s é um pouco maior só porque o jogador vai mais rápido, em proporção é a mesma.) Velocidade pela inclinação do joystick, sem a bola: 0,2 → 0,3 m/s; 0,3 → 1,1; 0,4 → 2,2; 0,5 → 3,5; 0,6 → 4,8; 0,7 → 6,0; 0,8 → 7,0; 0,9 → 7,5; 0,95 ou mais → 7,6.

Velocidade do jogador contra a da bola (para ver se o campo ficou rápido demais):

| Quem | Velocidade |
|---|---|
| Jogador sem a bola, joystick cheio | 7,6 m/s |
| Jogador com a bola (a bola vai junto) | 6,84 m/s |
| Jogador com meia inclinação | 3,5 m/s |
| Bots Fácil / Médio / Difícil | 6,7 / 7,3 / 7,6 m/s |
| Passe rasteiro, saída | 12 a 22 m/s (**1,6 a 2,9 vezes** o jogador) |
| Passe rasteiro, chegada a 10-25 m | 15 a 19 m/s (**2 a 2,5 vezes**) |
| Chute | 14 + 16·força = 14 a 30 m/s (**1,8 a 4 vezes**; o toque rápido, 16 m/s) |

A bola lançada (passe ou chute) continua pelo menos **1,6 vez mais rápida** que o jogador, então passar continua compensando mais do que correr com ela; só a bola conduzida anda junto com o jogador (6,84). Se mesmo assim o campo ficar rápido demais, ver o item 21.

Equilíbrio dos bots (G2) antes e depois do passe (`npm run simular`; 6 partidas de 8 min por cenário, semente 1, modo Campo; "antes" é já com o correr sempre, mas com o passe da H1; gols Casa x Visitante):

| Cenário (Casa:Visitante) | Gols antes | Gols depois | Acerto do bote antes (C/V) | Acerto depois (C/V) |
|---|---|---|---|---|
| Fácil:Fácil | 10,7 x 11,7 | 17,8 x 16,8 | 55% / 56% | 60% / 52% |
| Médio:Médio | 15,7 x 17,2 | 14,3 x 15,8 | 48% / 49% | 49% / 55% |
| Difícil:Difícil | 10,8 x 10,8 | 11,2 x 8,5 | 38% / 39% | 44% / 45% |
| Difícil:Fácil | 13,5 x 0,8 | 12,5 x 1,7 | 88% / 62% | 90% / 64% |
| Difícil:Médio | 26,0 x 3,5 | 24,5 x 4,8 | 65% / 25% | 69% / 24% |
| Médio:Fácil | 9,8 x 2,3 | 10,5 x 4,0 | 90% / 55% | 88% / 39% |

Driblador humano de mentira contra os bots (perdas da bola por minuto com ela): Fácil 1,3 → 2,1; Médio 10,1 → 10,5; Difícil 37,0 → 32,4. Gols sofridos por partida: 8,8 → 18,3; 15,3 → 16,3; 31,2 → 27,2.

Leitura: **a hierarquia se manteve** (Difícil ganha de Médio, que ganha de Fácil, e o Difícil continua dominando o Fácil por cerca de 12 x 2). A diferença maior está no **Fácil contra Fácil**, que ficou bem mais gol-eiro (de 22 para 35 gols por partida): com o passe e a recepção reforçados, a bola passa mais rápido entre eles (é a explicação mais provável; não verifiquei). Os passes de bots por partida caíram (por exemplo, no Fácil, de 21 para 11) e **não investiguei o porquê**; o resto dos números mexeu pouco e está dentro do que a semente de 6 partidas varia. Se o Fácil:Fácil estiver gol-eiro demais para o seu gosto, a alavanca é a dificuldade do goleiro (`GOLEIRO.falhaChance`).

H4 (nome do chute, goleiro, chute de longe, mira; no site do Render, 1 ou 2 celulares, o resto é bot):
1. **Nome do chute:** dê chutes fortes de vários jeitos (de frente, de ângulo fechado, de longe): **não aparece mais** "Chapada!", "Trivela!" etc. O chute continua curvando quando tem efeito.
2. **Goleiro segura:** chute fraco ou médio no gol: o goleiro **pega e fica com a bola** (não rebate); veja se ele pega até quando se joga. Chute muito forte ainda é espalmado.
3. **Goleiro protege e distribui:** chegue perto dele com a bola nas mãos dele: ele fica de costas para você e **você não consegue roubar** (bote e carrinho não pegam). Em até uns 1,2 s ele **lança por cima** num companheiro livre (o controle passa a quem recebe, se for humano) ou, sem ninguém livre, **longe e para o lado** (nunca para o meio na frente do gol). O companheiro que recebe o lançamento **sempre domina a bola**, e o adversário não consegue interceptar no ar (é regra do jogo, não física).
4. **Bola recuada:** passe a bola de volta para o goleiro do seu time com um adversário em cima. Ele **não se joga na bola**: se coloca, domina com o pé e passa rasteiro (ou chuta para longe) em menos de 1 s. Não pode virar gol contra. Me diga se alguma vez ele ainda se jogou ou deixou passar.
5. **Saída do goleiro:** fique sozinho com ele (sem zagueiro) a uns 10 a 15 m: ele **sai da linha** (uns 2 a 4 m) para fechar o ângulo. Tente a **cavadinha**: segure CHUTE de frente, a uns 8 a 14 m, e veja se aparece a bola por cima (agora é possível). Me diga se ele sai demais ou de menos (`GOLEIRO.saida`).
6. **Chute de longe:** chute do **meio de campo**: a bola sai mais fraca e mais torta e **quase nunca entra** (é raro, mas dá para acontecer). De uns 20 a 25 m ainda dá gol se a mira for boa. (`CHUTE.longe` no `constantes.ts`.)
7. **Mira do chute:** de frente para o gol, a bola vai um pouco mais certeira (erro 20% menor). Me diga se sentiu diferença e se quer mais (`CHUTE.ajudaGol.erroFator`, hoje 0,8; 0,6 é o dobro de ajuda).

Taxa de gol por distância do chute (`npm run chutes -- --distancia --sementes 30`; chute AUTO como no jogo, força máxima, dificuldade Médio, 150 chutes por célula; mira "no canto" = jogador bom, "no meio" = quem só aponta para o gol). O simulador é sempre 1 contra 1 (só o atacante e o goleiro). Distância até o gol; o meio de campo é 31 m (50% do campo de 60 m). Cada coluna é um passo da H4:

| Distância (% do campo) | Fim da H3: canto / meio | Goleiro novo (item 2) | + mergulho na hora certa | Final (itens 3 e 4) |
|---|---|---|---|---|
| 8 m (13%) | 30% / 36% | 23% / 35% | 23% / 35% | 25% / 35% |
| 11 m (19%) | 9% / 13% | 19% / 35% | 19% / 35% | 23% / 35% |
| 15 m (25%) | 3% / 3% | 49% / 42% | 31% / 29% | 29% / 27% |
| 19 m (31%) | 7% / 5% | 3% / 7% | 6% / 11% | 6% / 9% |
| 23 m (38%) | 41% / 45% | 42% / 50% | 4% / 13% | 7% / 9% |
| 27 m (44%) | 45% / 60% | 47% / 61% | 5% / 8% | 11% / 9% |
| **31 m (50%, meio de campo)** | **17% / 31%** | 19% / 34% | 5% / 8% | **3% / 3%** |
| 36 m (61%) | 1% / 1% | 2% / 2% | 2% / 2% | 1% / 1% |
| 42 m (71%) | 1% / 1% | 1% / 1% | 1% / 1% | 2% / 0% |
| 50 m (84%) | 0% / 1% | 33% / 23% | 0% / 2% | 1% / 1% |

Com força 0,85 o meio de campo fazia 5% / 7% no fim da H3 e faz 2% / 1% agora. Leitura: na H3 a curva era esquisita (3% a 15 m, mas 41% a 60% entre 23 e 27 m): era o goleiro que mergulhava cedo e estava no chão quando o chute de média distância chegava. O mergulho na hora certa é o que derruba o chute de longe; o efeito de longe do item 3 tira um pouco mais no meio de campo (de 5-8% para 3%). **Efeito colateral que você precisa saber:** no 1 contra 1 de 11 a 15 m o gol ficou bem mais fácil que na H3 (de 3-13% para 23-35%), por causa do goleiro que sai da linha e da cavadinha, que agora existe (não separei os dois efeitos). O gol de 8 m ficou parecido. No jogo de verdade o 1 contra 1 é mais raro que no simulador, e o simulador de bots (abaixo) mostra menos gols, não mais. Se o 1 contra 1 ficar fácil demais, as alavancas estão no item 22.

Antes e depois da mira do chute (item 4; mesmas sementes, 400 chutes por célula, chute AUTO, força 0,85; "antes" = erro normal, "depois" = erro x 0,8):

| Distância | Antes: canto / meio | Depois: canto / meio |
|---|---|---|
| 8 m | 26% / 36% | 27% / 36% |
| 11 m | 23% / 39% | 26% / 40% |
| 15 m | 31% / 30% | 32% / 31% |
| 19 m | 9% / 12% | 7% / 11% |
| 23 m | 6% / 8% | 6% / 9% |
| 27 m | 3% / 6% | 3% / 6% |
| 31 m | 2% / 2% | 2% / 2% |

O gol de perto e de média distância ficou só um pouco mais fácil (até +3 pontos), de longe nada muda e não há chuva de gols.

Taxa de gol do chute AUTO por zona (`npm run chutes -- --sementes 6`, força 0,85; fim da H3 -> final): **mira no canto**: perto aberto 47% -> 53%; ângulo médio 0% -> 28% (a cavadinha entrou: 12 gols em 18); fechado perto 35% -> 26%; longe (mais de 20 m) 72% -> 23%; geral 44% -> 28%. **Mira no meio**: perto aberto 31% -> 39%; ângulo médio 8% -> 26%; fechado perto 27% -> 56%; longe 61% -> 15%; geral 37% -> 31%. O AUTO agora escolhe: chute reto 63%, trivela 17%, canudo 11%, cavadinha 6%, chapada 4%.

Equilíbrio dos bots (G2) antes e depois da H4 (`npm run simular`; 6 partidas de 8 min por cenário, semente 1; "antes" é o fim da H3; gols Casa x Visitante; posse do goleiro em segundos por partida, Casa / Visitante; "g.contra" = gols contra por partida somando os dois times):

| Cenário (Casa:Visitante) | Gols antes | Gols depois | Acerto do bote antes (C/V) | Acerto depois (C/V) | Posse do goleiro antes (s) | Posse do goleiro depois (s) | Gols contra antes / depois |
|---|---|---|---|---|---|---|---|
| Fácil:Fácil | 17,8 x 16,8 | 11,7 x 7,2 | 60% / 52% | 57% / 55% | 6,3 / 7,3 | 6,3 / 5,9 | 2,7 / 2,7 |
| Médio:Médio | 14,3 x 15,8 | 11,5 x 10,0 | 49% / 55% | 56% / 49% | 9,8 / 9,3 | 5,9 / 4,7 | 5,2 / 3,7 |
| Difícil:Difícil | 11,2 x 8,5 | 7,3 x 10,3 | 44% / 45% | 36% / 42% | 13,8 / 12,3 | 4,7 / 6,5 | 2,5 / 1,7 |
| Difícil:Fácil | 12,5 x 1,7 | 13,2 x 0,3 | 90% / 64% | 85% / 52% | 8,3 / 28,5 | 5,2 / 14,5 | 0,8 / 0,5 |
| Difícil:Médio | 24,5 x 4,8 | 21,3 x 2,8 | 69% / 24% | 65% / 25% | 5,8 / 11,0 | 3,2 / 6,4 | 4,2 / 2,8 |
| Médio:Fácil | 10,5 x 4,0 | 10,0 x 2,2 | 88% / 39% | 91% / 51% | 11,3 / 23,8 | 5,1 / 13,2 | 2,3 / 0,7 |

Marco a marco (gols por partida Casa x Visitante, nos 6 cenários na ordem da tabela; posse do goleiro em s): **depois do item 2** (goleiro novo, ainda com o mergulho antigo): 12,3 x 11,8; 13,7 x 13,0; 10,0 x 9,8; 13,0 x 0,7; 27,0 x 4,5; 10,0 x 3,0; posse do goleiro de 2,9 a 12,3 s; gols contra 0,3 a 4,0. **Depois do item 3** (mergulho na hora e chute de longe): os números finais da tabela. **Depois do item 4**: exatamente iguais aos do item 3, porque a ajuda de mira só vale para o chute do humano e os bots não a usam. (As tabelas "antes" de gols e acerto são as do fim da H3; a posse do goleiro e os gols contra "antes" eu medi rodando o código do fim da H3 com a contagem nova.) Driblador humano de mentira: perdas da bola por minuto Fácil 2,1 -> 2,6, Médio 10,5 -> 8,8, Difícil 32,4 -> 23,6; gols sofridos por partida 18,3 -> 9,3; 16,3 -> 12,0; 27,2 -> 17,0 (menos gols, porque o goleiro e o chute de longe mudaram).

Leitura: **a hierarquia dos bots se manteve** (Difícil ganha de Médio, que ganha de Fácil; Difícil:Fácil 13 x 0,3). **Os gols por partida caíram** (de 8,5-17,8 para 7,2-11,7 nos jogos parelhos), provavelmente porque o goleiro defende mais (segura, não cai cedo e sai da linha); o Fácil:Fácil, que tinha ficado muito gol-eiro na H3, voltou para perto do que era antes. **A posse do goleiro caiu pela metade ou mais** (de 6 a 28 s para 3 a 14 s por partida): ele não fica mais parado, devolve a bola em até 1,2 s. **Gols contra**: caíram em geral (de 0,8-5,2 para 0,5-3,7 por partida), mas **não zeraram entre os bots** (até 3,7 por partida). Não verifiquei de onde eles vêm; no teste do recuo para o goleiro (48 situações com adversário pressionando) não saiu nenhum. Não mexi nisso. O acerto do bote do Difícil caiu um pouco (36-42%); não investiguei, pode ser ruído de 6 jogos.

H5 (boneco novo; no site do Render, 1 celular, o resto é bot):
1. Abra `SEU-LINK/tela.html?boneco=1`: duas linhas de jogadores (Vasco em cima, Flamengo embaixo), cada um fazendo o estado do jogo com a duração do servidor. Da esquerda para a direita (de frente, o lado +Z do campo fica à esquerda): parado, corrida, chute com a bola à direita, chute com a bola à esquerda, comemoração, goleiro parado, mergulho, defesa alta. Variações: `&times=saopaulo,pedesapo` troca os clubes; `&cam=lado` fica de perfil; `&colunas=0,4&h=700` mostra só duas colunas, maiores; `&padrao=faixa-diagonal` veste todos com esse padrão (skin gerada); `&t=0.2` congela em 0,2 s.
2. Jogue uma partida: todos têm **rosto** (olhos e boca), **cabelo** e a skin do time. Vasco, Corinthians, São Paulo e Pé de Sapo aparecem com a camisa que você desenhou (na camisa titular); os outros clubes com a camisa pintada nas cores do `times.json`; os goleiros em amarelo (Casa) e laranja (Visitante).
3. Os rostos **piscam sozinhos**, fazem cara de força no chute e no mergulho, de felicidade na comemoração e de dor na queda.
4. O chute usa o pé do lado em que a bola está. O goleiro mergulha **para o lado certo nos dois gols** (ele olha para lados diferentes em cada gol).
5. `?debug=1`: veja o **fps no seu PC** e os draw calls (562 com o glb de 20 peças; limite 300). Se o fps ficar baixo, aperte **L** (cápsulas) e me diga o número.
6. Corrida: as pernas parecem boas na velocidade máxima ou o pé "desliza" demais? (item 23)

F8a e F8b (extras):
1. **Campeonato:** jogue uma partida até o fim. Quando ela acaba, aparece no telão (lobby e fim) o botão **Tabela (T)**; a tecla **T** (ou clique) abre/fecha. Mostra a tabela dos clubes (3 pontos por vitória, 1 por empate; desempate por vitórias, saldo e gols) e o ranking dos jogadores humanos (gols, assistências, desarmes). Jogue a Revanche: os números somam. No celular do Dono, no fim do lobby: "Campeonato da sala: N partidas" e o botão "Zerar campeonato" (dois toques). Quem não é o Dono não vê o botão.
2. **Gol de ouro:** no celular do Dono, em "Se empatar", escolha "Gol de ouro (2 min)". Deixe o jogo empatar até o fim do tempo (ou faça isso com 2 min de duração): o apito toca, a bola volta ao centro, aparece a etiqueta amarela "GOL DE OURO" e o relógio recomeça em 02:00. O primeiro gol acaba a partida (depois da comemoração e do replay); o fim mostra "Decidido no gol de ouro". Sem gol em 2 min: termina empatado, "Prorrogação sem gols".
3. **Câmera que segue o jogador:** no telão, aperte **C** até aparecer a terceira câmera (depois da TV e da aérea): "Seguindo: Fulano". **N** troca para o próximo humano. Para um telão extra abrir seguindo o amigo dele: acrescente `?segue=Apelido` no endereço do telão (sem ligar para maiúscula/acento). **Teste com 2 humanos** (eu só testei com 1).

F7 (som e acabamento):
1. **Som (só no telão):** no telão, clique em qualquer lugar (o navegador só libera o áudio depois de um clique). O botão embaixo, no meio, diz "Som ligado". Tecla **M** liga/desliga. Escute: chute (pancada grave), passe (mais leve), apito no começo/falta/fim (3 apitos), torcida de fundo que sobe quando a bola chega perto de um gol, "uuuh" na trave e na defesa espalmada, e a explosão no gol. **Eu não consegui ouvir nada** (só conferi que nenhum som dá erro no navegador): se algum soar feio, me diga qual e eu ajusto.
2. **Telão extra** (amigo que "assiste uma sala"): começa mudo; ele liga no botão.
3. **Menus:** logo com bola e "3D" amarelo, fundo de gramado em faixas, botões verdes. Confira se dá para ler de longe na TV.
4. **Celular (Android):** abra o controle, entre na sala e deixe 1 minuto sem encostar: a tela não deve apagar (Wake Lock). Em pé aparece "Fica melhor deitado".
5. **iPhone:** no Safari do iPhone aparece na tela de entrada a dica de "Adicionar à Tela de Início"; depois de adicionar e abrir pelo ícone, o jogo abre em tela cheia. Toque em "Entendi" e a dica some. **Não tenho iPhone para testar**: só testei com um navegador fingindo ser iPhone.
6. **Ícone:** ao "Adicionar à tela inicial" (Android: menu do Chrome > Instalar app), o ícone é uma bola num campo, com o nome "Brasilero 3D".
7. **Fim de jogo:** no 1º gol, o telão mostra o replay; ao acabar o tempo aparece placar grande com os dois distintivos, quem fez os gols de cada time, artilheiro/assistências/desarmes e confete na cor de quem venceu. Empate: sem confete.

F6 (visual; no PC, `npm run dev`, telão em `http://localhost:5173/tela.html`, 1 celular entrando e começando):
1. Olhe o campo: noite, refletores brilhando, placas "BRASILERO 3D" em volta, torcida vermelha e verde (cores dos clubes) nas arquibancadas, sombra dos jogadores e da bola no gramado. A tecla **C** troca entre câmera de TV e aérea.
2. Faça um gol (ou deixe o bot fazer): aparece "GOOOL", a torcida pula, a rede balança e depois entra o **REPLAY** em câmera lenta, atrás do gol, com a etiqueta vermelha. Depois de uns 6 s o jogo volta sozinho.
3. Abra `http://localhost:5173/tela.html?debug=1`: no canto aparecem fps, draw calls (tem que ficar abaixo de 300), triângulos e o atraso de interpolação. Aperte **L** (ou o botão "Modo leve"): sem sombras, torcida e brilho. Num PC fraco o modo leve liga sozinho depois de 3 s abaixo de 45 fps e aparece a etiqueta amarela "Modo leve".
4. **Conferir no seu notebook:** o jogo roda liso? Os jogadores "patinam"? (Só dá para avaliar com o modelo de verdade, passo 6.) Se travar, me diga o fps do `?debug=1`.
5. Para ver o jogador 3D animado sem o Mixamo: `npm run boneco-teste` e abra `tela.html?modelo=boneco-teste` (um boneco de caixas: corre, chuta, cai).
6. **Para ter o jogador de verdade (passo 7 do guia manual):** instale o Blender, baixe do Mixamo o personagem e as animações e siga `ferramentas/blender/LEIA-ME.md`. Se der erro, copie a mensagem para mim. Sem isso o jogo continua com cápsulas.

F5 (times e uniformes):
1. No lobby do celular do Dono, escolha clubes diferentes para Casa e Visitante: a prévia mostra o distintivo (sigla nas cores) e dois pontinhos de cor. Escolha dois clubes de camisa parecida (por exemplo Flamengo e Internacional): o Visitante tem que sair com o uniforme reserva.
2. Teste "🎲 Aleatório" nos dois lados: ao começar, o placar mostra os clubes sorteados; na Revanche, os mesmos.
3. Abra `tela.html?vitrine=1`: mostra os 7 padrões de camisa e os clubes numa grade (serve para conferir as cores).
4. Para escudos, ponha arquivos PNG em `apps/web/public/escudos/` com o nome do clube (ver `LEIA-ME.txt` lá, ex.: `flamengo.png`). Só os que você quiser; sem arquivo vale o distintivo neutro.

F4 (jogar com amigos de outras casas):
1. Instale o túnel uma vez: `winget install --id Cloudflare.cloudflared` (feche e abra o PowerShell depois).
2. Na pasta do projeto: `npm run festa`. Ele compila o site, sobe o servidor e imprime um link do TELÃO (https://....trycloudflare.com/tela.html?srv=...) e um QR no terminal. O link muda a cada vez e o PC tem que ficar ligado.
3. Abra o link do telão no PC, "Criar sala". Os celulares de quem está com você entram pelo QR.
4. O amigo da outra casa abre o MESMO link do telão no PC dele, escolhe "Assistir uma sala" e digita o código. Ele vê o jogo na tela dele (cada telão escolhe a própria câmera) e joga pelo celular (entra no link do controle que você mandar, ou pelo QR).
5. Se o ping passar de 150 ms aparece "Conexão lenta" no telão e no celular.
6. Para parar: Ctrl+C no PowerShell.
**Eu não consegui testar o túnel real aqui** (o ambiente bloqueou abrir um túnel público). O que testei: o servidor em produção servindo o site, o site compilado em outro servidor de arquivos falando com um servidor remoto, as origens, e o caminho "sem cloudflared". Se o `npm run festa` der erro, me mande a mensagem.

F4 (publicar de verdade, só quando você quiser; eu não criei conta nem fiz deploy nenhum). **Plano principal: UM link só, sem Vercel.** O `Dockerfile` compila o site e o servidor da partida entrega o telão, o controle e o WebSocket no mesmo endereço (o site já procura o servidor nele mesmo, e a mesma origem passa sem `ORIGENS`).

**Render (grátis), um link só, passo a passo:**
1. Suba o código: `cd "C:\Users\Samuel\Documents\Jarvis\vault\projetos\Brasilero 3D\projeto"; git push`.
2. Entre em render.com e crie a conta com "Sign in with GitHub" (deixe o Render ver o repositório `SMariotto/Brasilero-3D`).
3. No painel: **New > Blueprint**. Em "Repository" escolha `Brasilero-3D`. **Branch:** `main`. **Blueprint Name:** o que quiser (ex.: `brasilero3d`). Ele lê o `render.yaml` sozinho e mostra 1 serviço chamado `brasilero3d`, tipo Web Service, Docker, plano **Free**. Não há nenhuma variável para preencher (`ORIGENS` não é necessária; `NODE_ENV` e `PORT` já vêm prontas). Clique em **Deploy Blueprint**.
4. Espere o primeiro deploy (uns 5 a 10 min: ele instala e compila o site). Quando o estado ficar **Live**, o endereço aparece no topo da página do serviço, no formato `https://brasilero3d.onrender.com` (se o nome estiver ocupado, o Render põe um sufixo; vale o que aparecer lá).
5. Confira abrindo `https://SEU-ENDERECO.onrender.com/saude` (tem que mostrar `"ok":true`).
6. **Esse é o seu link.** Telão no PC: `https://SEU-ENDERECO.onrender.com/tela.html` > "Criar sala". Os celulares entram pelo QR. Amigo de outra casa: o mesmo link do telão > "Assistir uma sala" (ou o link do controle).
7. Lembretes do plano grátis: depois de 15 min sem ninguém conectado o serviço dorme, e o primeiro acesso seguinte demora cerca de 1 min (abra o `/saude` uns 2 min antes de começar a festa). Cada novo `git push` na `main` refaz o deploy sozinho.
8. Se o Render pedir cartão no Blueprint, faça o caminho manual (mesmo resultado): **New > Web Service > Build and deploy from a Git repository > Brasilero-3D**. Campos: **Language** = `Docker`; **Branch** = `main`; **Root Directory** = vazio; **Dockerfile Path** = `./apps/server/Dockerfile`; **Docker Build Context Directory** = `.`; **Instance Type** = `Free`; em **Advanced**: **Health Check Path** = `/saude` e uma variável `NODE_ENV` = `production`. O resto fica como está.

**Fly.io (um link só, região São Paulo, ~US$ 2/mês, precisa de cartão de um adulto):** instale o flyctl (guia em fly.io/docs/flyctl/install), `fly auth login`, depois na pasta do projeto: `fly launch --no-deploy --copy-config` (aceite usar o fly.toml; se o nome `brasilero3d-servidor` estiver ocupado, escolha outro) e `fly deploy`. Não precisa de `fly secrets set ORIGENS`. O link é `https://SEU-APP.fly.dev/tela.html` e a checagem é `https://SEU-APP.fly.dev/saude`.

**Plano B: site na Vercel** (só se quiser o site em outro endereço; o servidor acima continua necessário). Suba o código (`git push`), na Vercel "Add New > Project", escolha o repositório. Não mexa em Root Directory nem nos comandos: o `vercel.json` já tem tudo. Em Settings > Environment Variables crie `VITE_SERVIDOR_PADRAO` = `wss://SEU-ENDERECO-DO-SERVIDOR/ws` e faça um novo deploy. **Aqui sim** o servidor precisa de `ORIGENS` = `https://SEU-SITE.vercel.app` (Render: painel > Environment > Add; Fly: `fly secrets set ORIGENS=https://SEU-SITE.vercel.app`), senão ele recusa o WebSocket do site da Vercel. Sem `VITE_SERVIDOR_PADRAO` o site da Vercel procuraria o servidor nele mesmo.

Quer testar o site da Vercel com o servidor do `npm run festa`? Rode `$env:SITE_URL="https://SEU-SITE.vercel.app"; npm run festa`: ele imprime também o link do telão por lá (já com o `?srv=` do túnel) e libera o site em ORIGENS.

F3 (1 humano com bots completando 5 contra 5; depois 2 celulares):
1. `npm run dev`, crie a sala e entre com 1 celular. No lobby o Dono escolhe **Campo** (linhas de verdade) ou Arena. Toque em "Começar": os outros 9 jogadores e os 2 goleiros (amarelo e laranja) são bots.
2. Jogue um pouco: os bots não podem ficar parados nem amontoados, e têm que passar, chutar e dar bote. Na dificuldade Fácil eles reagem mais devagar e erram mais; no Difícil o contrário.
3. Chute para fora pela lateral, pela linha de fundo (você é o atacante: tiro de meta; você é o defensor: escanteio). O jogador mais perto desliza até a bola em até 1 s; se for você, os botões mudam: lateral só tem PASSE, escanteio e falta têm CRUZAR. Se você não fizer nada, a cobrança sai sozinha em 5 s.
4. Carrinho (CHUTE sem a bola) e bote (PASSE sem a bola): se o carrinho pegar o adversário antes da bola é falta (ele cai, tiro livre; o Dono pode desligar as faltas no lobby).
5. Chute fraco no meio do gol o goleiro pega; chute forte ele espalma ou o gol sai; chute no canto de perto ele não alcança.
6. Com a bola no ar na altura do peito, CHUTE dispara na hora (voleio). PASSE segurado é lançamento por cima.
7. Entre com um segundo celular no meio do jogo: ele assume um bot. Desligue o Wi-Fi de um celular: um bot joga por ele até voltar.
8. No fim: placar, artilheiro, assistências e desarmes no telão; o Dono escolhe Revanche ou Lobby.

F2 (1 contra 1 com 2 celulares, PC como telão):
1. `npm run dev`; no PC abra `http://localhost:5173/tela.html` e clique em "Criar sala"; entre com os 2 celulares pelo QR (de preferência deitados).
2. Um celular escolhe Casa e o outro Visitante. O primeiro (Dono) toca em "Começar". O telão mostra o campo 3D, o placar e o relógio; os celulares mostram joystick e 3 botões.
3. Joystick à esquerda move o jogador. Aperte CHUTE segurando: a barra laranja no topo enche em 0,8 s; solte para chutar (toque rápido dá chute fraco). PASSE sai rasteiro. (H3: não há mais o CORRER nem a barra de energia.)
4. Jogue 2 minutos: tem que sair gol, e depois do gol a bola volta ao centro e quem sofreu o gol sai jogando. Dá para trocar a câmera com a tecla C no PC ou no botão "Câmera".
5. No fim, o telão mostra o resultado e o Dono escolhe "Revanche" ou "Lobby" no celular.
6. **Sentimento do jogo** (é o que eu mais preciso de você): o jogador responde ao dedo sem atraso que incomode? A bola "gruda" demais no pé ou escapa demais? O chute está forte/fraco demais? Anote e me diga, que eu ajusto só as constantes.

F0 (já valia): `npm install`; `npm run dev`.
F1 (PC como telão + 2 celulares na mesma Wi-Fi):
1. No PC abra `http://localhost:5173/tela.html` e clique em "Criar sala". Aparecem o código de 4 letras e o QR.
2. No celular 1, aponte a câmera para o QR, digite o apelido e toque em "Entrar". O apelido aparece no telão. Esse celular é o Dono (tem o painel com clubes, modo, duração...).
3. No celular 2, faça o mesmo. Não é Dono e não vê o painel. Cada um escolhe Casa, Visitante ou Tanto faz e toca em "Pronto".
4. No celular do Dono, mude o clube da Casa, o modo e a duração: o telão muda na hora.
5. Desligue o Wi-Fi de um celular por 10 s e religue: aparece "Reconectando...", o telão mostra "sem sinal" nesse jogador, e ele volta como o mesmo jogador (e Dono, se era).
6. Recarregue a página do telão: volta para a mesma sala. Recarregue o celular: volta para o mesmo jogador.
7. O botão "Começar" ainda só avisa que o jogo chega na próxima fase.
8. Se o celular não abrir o link do QR: Firewall do Windows (permitir o Node em redes privadas) e confira que o PC e o celular estão na mesma Wi-Fi.

## Registro das sessões
| Data | Fase | O que foi feito | Commits |
|---|---|---|---|
| 04/11/2026 | preparação | Pasta e guias criados pelo Jarvis | (sem git ainda) |
| 04/11/2026 | R0 | Revisão do guia, 10 correções pequenas nos arquivos do guia, seção "Revisão R0" no DECISOES.md | (guia fora do git) |
| 04/11/2026 | F0 | Monorepo, constantes, rng, vetores, dados, servidor mínimo, 3 páginas, checagem do controle | 845d52d, a4c0ccd |
| 04/11/2026 | F1 | Protocolo do lobby, salas e reconexão com token, telas de lobby do telão e do controle, ferramenta de carga | e610a10, 860b1f1, d0b6073 |
| 05/11/2026 | F4 | ORIGENS e servidor que serve o site, telão lembra o ?srv=, aviso de conexão lenta, npm run festa, vercel.json, Dockerfile, fly.toml, render.yaml, testes de telão extra | ver git log |
| 05/11/2026 | F4 (correção) | Dockerfile em duas etapas (compila o site e serve com `SITE_DIR`), `.dockerignore` ajustado, `ORIGENS` sem valor no `render.yaml`/`fly.toml`, teste de produção sem ORIGENS, passo a passo do Render com um link só. Simulação do Dockerfile numa pasta limpa: `/saude`, `/tela.html`, `/controle.html`, todos os `/assets/` e o WebSocket em `/ws` responderam; site de fora e localhost levam 403 | ver git log |
| 05/11/2026 | F3 | Reinícios do modo Campo, passe com mira e lançamento, voleio, bote, carrinho, faltas, goleiro bot, bots de linha, vagas e substituição por bot, estatísticas, telão e controle da F3 | a3042d7, 7628599, 519dffc, e commits de interface (ver git log) |
| 05/11/2026 | F5 | Cores sem conflito (ΔE76), clube "Aleatório", distintivos com PNG opcional, uniforme por shader com 7 padrões, vitrine, placar de TV | 9db9ba9, 379e69a, b5a730f |
| 05/11/2026 | F6 | Estádio noturno e torcida, sombras e bloom, rede que balança, replay do gol, medidor de fps com modo leve e `?debug=1`, carregador do `jogador.glb` com animações e reserva em cápsula, script do Blender (não rodado), boneco de teste | 19e1942, 4d0dc36, ae08100, 8ec76d1, 1b968aa, 69da5c0 |
| 05/11/2026 | F7 | Sons (Web Audio), menus com identidade própria, manifest e ícones, Wake Lock, dica do iPhone, tela de fim, revisão de textos | 3b53bc1, ba3d769, 0385705, 1d3ae63, b520fa7 |
| 05/11/2026 | F8a | Campeonato da sala: núcleo (campeonato.ts), mensagem `campeonato`, `zerar`, painel do telão, linha no lobby do celular | 4ba83b8 |
| 05/11/2026 | F8b | Gol de ouro (config, regra, lobby, aviso) e câmera que segue um jogador | e1b5c41, 718288c |
| 06/11/2026 | H2 | Chão menos escorregadio (frenagem e mudança de direção, `npm run medir`), efeito na bola (`BOLA.giro`), chute automático com 4 tipos (`chute-tipos.ts`, `TIPO_CHUTE`), nome do chute no telão, simulador `npm run chutes`, testes | ver git log (tag `h2-ok`) |
| 10/11/2026 | H5 | Boneco novo (rig-v1): `boneco.ts` (carregador sem texturas embutidas, clone por jogador com esqueleto compartilhado, skin por time, rosto de atlas com `channel = 1`, cabelo sob demanda), `animacoes-boneco.ts` (estado do jogo para clipe, pé do chute pelo lado da bola, mergulho trocado de lado, corrida calibrada), `skin-gerada.ts` (camisa, bermuda e padrões do `times.json` sobre a skin modelo), `boneco-dados.ts`, vitrine `?boneco=1`, Pé de Sapo como 13º clube, regra 7 atualizada, 61 testes novos | ver git log (tag `h5-ok`) |
| 08/11/2026 | H4 | Nome do chute fora do telão; goleiro (segurar no mergulho, proteger, lançar de mão com domínio garantido, jogar de pé, bola recuada só de pé, saída no 1 contra 1, mergulho no tempo certo); chute de muito longe (`CHUTE.longe`); ajuda de mira do humano (`CHUTE.ajudaGol`); simulador com posse do goleiro e gols contra; `npm run chutes -- --distancia`; testes novos (`goleiro.h4.test.ts` e outros) | ver git log (tag `h4-ok`) |
| 06/11/2026 | H3 | Sem stamina, barra e botão CORRER (núcleo, servidor, protocolo, celular, telão, testes); velocidade 7,6 m/s pela inclinação do joystick (`fracaoDaInclinacao`); passe único para as três dificuldades, mais rápido, com amortecimento, seguindo o receptor no último terço (`seguirPasse`), recepção reforçada (`RECEPCAO_PASSE`), bot receptor corre ao encontro; `npm run tabela-passe`; testes novos (`passe.h3.test.ts`); simulador G2 antes e depois | ver git log (tag `h3-ok`) |
| 06/11/2026 | H1 | Recepção de bola (`receberBola`, `RECEPCAO`, animação 14), ajuda de mira do passe (`PASSE.ajuda`, tempo de voo com a física real, joystick solto = mais à frente e livre), mensagem `mira`, anel e linha no telão, aviso no celular, testes | ver git log (tag `h1-ok`) |
| 05/11/2026 | G3 | Jogador 3D por código: `pose.ts` (poses, cadência sem patinar), `corpos.ts` (peças articuladas em InstancedMesh, uniforme por shader), integração com o modo leve e `?capsula=1`, vitrine de poses, testes, Mixamo e Blender marcados obsoletos | ver git log (tag `g3-ok`) |
| 05/11/2026 | G2 | Simulador de bots (`npm run simular`, laço no núcleo em `simulacao.ts`), dificuldade por time para medir, bote mais esperto (alcance, mira, antecipação), bots lentos no Fácil, defensores oportunistas, testes de dificuldade | ver git log (tag `g2-ok`) |
| 05/11/2026 | G1 | Controle estilo FIFA: gestor de controle no núcleo (`controle.ts`), 3 humanos por time e 6 por sala, troca por passe/sozinha/à mão, carrinho no PASSE segurado, mensagem `donos`, créditos por humano, seta/anel/apelido no telão, faixa que pisca no celular, SPEC/PROTOCOLO atualizados | ver git log (tag `g1-ok`) |
| 04/11/2026 | F2 | Física (bola, jogador, campo), partida (saída, domínio, chute, passe, gol, assistência, relógio, fim), protocolo binário, laço do servidor, telão 3D, controle de jogo, Playwright | 65153a3, 87c2afc, 557daff, 702e32f |
