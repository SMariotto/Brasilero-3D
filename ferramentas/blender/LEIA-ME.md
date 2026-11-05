# Jogador 3D animado (Mixamo + Blender)

> **OBSOLETO desde a G3.** O jogador 3D agora é feito por código no Three.js (corpo de peças articuladas, animações por conta, sem arquivo de terceiros). Este caminho (Mixamo + Blender) não é mais necessário e eu não apaguei nada: **o Samuel decide se posso apagar** (pergunta no PROGRESSO.md, item 18). Se alguém ainda pôr um `jogador.glb` em `apps/web/public/modelos/`, o telão continua carregando ele no lugar do jogador feito por código.

O jogo funciona sem isto: enquanto não existe `apps/web/public/modelos/jogador.glb`, os jogadores aparecem como **cápsulas** na cor do time. Quando o arquivo existe, o telão carrega sozinho e passa a mostrar o modelo animado, com o uniforme do clube pintado na camisa.

> Estado: o carregador do telão está testado (com um boneco de caixas). O script `montar_jogador.py` foi escrito mas **ainda não foi rodado**, porque o Blender não estava instalado na máquina onde a F6 foi feita. Se der erro, copie a mensagem e peça para o Claude Code corrigir.

## 1. Instalar o Blender (uma vez)

```powershell
winget install -e --id BlenderFoundation.Blender
```

Depois feche e abra o PowerShell. Se `blender --version` não funcionar, o programa está em `C:\Program Files\Blender Foundation\Blender 4.x\blender.exe`; use esse caminho completo (entre aspas) no lugar de `blender`.

## 2. Baixar do Mixamo (https://www.mixamo.com, grátis com Adobe ID)

Crie a pasta `projeto/assets-fonte/mixamo/` (ela fica fora do git).

1. **Personagem:** escolha um personagem (ou envie o seu), clique **Download**, formato **FBX Binary**, **With Skin**. Salve como `personagem.fbx`.
2. **Animações:** para cada uma abaixo, busque pelo nome em inglês, **Download**, formato **FBX Binary**, **Without Skin**, 30 fps, e **marque "In Place"** nas de movimento (Parado, Corrida, Arrancada). Salve **com o nome do jogo** (o nome do arquivo diz ao script qual é qual):

| Arquivo | O que buscar no Mixamo | Obrigatória? |
|---|---|---|
| `Parado.fbx` | Idle (qualquer "Idle" simples) | sim |
| `Corrida.fbx` | Running (tipo "Jog" ou "Run") | sim |
| `Arrancada.fbx` | Sprint / Fast Run | não (usa Corrida) |
| `Chute.fbx` | Soccer Kick / Soccer Penalty Kick | não (sem ele o jogador não chuta na animação) |
| `Passe.fbx` | Soccer Pass | não (usa Chute) |
| `Carrinho.fbx` | Slide Tackle / Soccer Tackle | não (usa Queda) |
| `Queda.fbx` | Knocked Down / Falling Back Death | não |
| `Comemoracao.fbx` | Victory / Celebration | não (usa Parado) |
| `GoleiroParado.fbx` | Goalkeeper Idle | não (usa Parado) |
| `GoleiroMergulhoEsq.fbx` / `GoleiroMergulhoDir.fbx` | Goalkeeper Dive / Save | não (usa GoleiroParado) |
| `Cabeceio.fbx` | Header / Heading | não (usa Chute) |
| `GoleiroComBola.fbx` | Goalkeeper catch/hold | não (usa GoleiroParado) |
| `Cobranca.fbx` | Throw In / Free Kick | não (usa Parado) |

Só `Parado` e `Corrida` são realmente necessárias para começar. O resto você pode ir adicionando depois e rodar o passo 3 de novo.

## 3. Montar o GLB (na pasta `projeto/`)

```powershell
blender --background --python ferramentas/blender/montar_jogador.py -- "assets-fonte/mixamo" "assets-fonte/jogador-bruto.glb"
```

No final ele imprime um resumo: quais animações achou (`ok`), quais faltam e **quais materiais não reconheceu**. Se ele não reconhecer um material, ele **não chuta**: você diz qual parte do uniforme é, por exemplo:

```powershell
blender --background --python ferramentas/blender/montar_jogador.py -- "assets-fonte/mixamo" "assets-fonte/jogador-bruto.glb" --mapa "Material.001=Camisa,Material.002=Calcao"
```

Partes: `Camisa`, `Calcao`, `Meiao`, `Pele`, `Cabelo`, `Chuteira`. Só a **Camisa** e o **Calcao**/**Meiao** mudam de cor por time; o resto fica como veio.

## 4. Comprimir e instalar no jogo

```powershell
npx --yes @gltf-transform/cli optimize "assets-fonte/jogador-bruto.glb" "apps/web/public/modelos/jogador.glb" --compress meshopt --texture-compress webp --texture-size 1024
```

Isso deixa o arquivo pequeno (o telão tem que baixar menos de 15 MB no total). Depois é só abrir o telão: ele usa `jogador.glb` sozinho. Para voltar às cápsulas sem apagar nada, acrescente `?capsula=1` no endereço do telão.

## Testar o carregador sem o Mixamo

```powershell
npm run boneco-teste
```

Gera `apps/web/public/modelos/boneco-teste.glb` (um boneco de caixas com 5 animações, fora do git). Abra o telão com `tela.html?modelo=boneco-teste`.

## Direitos de uso

Personagens e animações do Mixamo podem ser usados em projetos pessoais e comerciais, incluindo jogos, sem royalties, mas **não podem ser redistribuídos como arquivos soltos**. Por isso `assets-fonte/` não vai para o git. O `jogador.glb` final vai para o site do jogo, que é o uso permitido. Alternativa sem conta, com licença CC0: pacotes da Quaternius (GLB já pronto; basta nomear os materiais e as animações como na tabela e salvar como `jogador.glb`).
