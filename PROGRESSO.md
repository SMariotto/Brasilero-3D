# PROGRESSO: Brasilero 3D

O Claude Code atualiza este arquivo no fim de toda sessão. Uma sessão nova começa lendo daqui.

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

Estados possíveis: não começou, em andamento, pronta (falta o Samuel conferir), conferida.

## Onde parou
F3 a F7, F8a e F8b prontas (esperando o Samuel conferir). O Samuel pediu em 05/11: "ainda não dá pra testar, faz os próximos 3": fiz a F7 e dois extras da F8 (F8a e F8b, escolhidos por mim da lista da SPEC 10). Ele só vai testar tudo no fim. Próximo passo, se ele disser "sim": os extras que sobraram da SPEC 10 (goleiro humano, cabeceio com botão, chute com efeito, modo "celular único", número nas costas da camisa, chuva, pênalti) ou o que ele pedir; antes, ele precisa testar F3 a F8 e baixar o personagem do Mixamo para a F6. Nada pela metade.

Para jogar pelo site sem rodar no PC: o plano é UM link só pelo Render (grátis), passo a passo em "F4 (publicar de verdade)" mais abaixo. Nada foi publicado; falta o Samuel criar a conta e dar o `git push`.

Dois itens da F6 dependem do Samuel e **não foram feitos nem testados com o modelo de verdade**: (1) o `jogador.glb` do Mixamo (o carregador está pronto e testado com um boneco de caixas; sem o arquivo o jogo usa cápsulas); (2) o `ferramentas/blender/montar_jogador.py` foi escrito mas nunca rodado (Blender e Python não estão instalados nesta máquina). Passo a passo em `ferramentas/blender/LEIA-ME.md`.

## Dúvidas para o Samuel
Decisões provisórias (regra do jogo) que o guia não cobria. Sigo com a opção mais simples; diga se quer outra:
1. **Limite de 5 humanos por lado.** Quem tenta entrar num lado cheio recebe `LADO_CHEIO`. (SPEC 4.1)
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
3. Joystick à esquerda move o jogador. Aperte CHUTE segurando: a barra laranja no topo enche em 0,8 s; solte para chutar (toque rápido dá chute fraco). PASSE sai rasteiro. CORRER gasta a barra de energia verde.
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
| 04/11/2026 | F2 | Física (bola, jogador, campo), partida (saída, domínio, chute, passe, gol, assistência, relógio, fim), protocolo binário, laço do servidor, telão 3D, controle de jogo, Playwright | 65153a3, 87c2afc, 557daff, 702e32f |
