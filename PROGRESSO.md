# PROGRESSO: Brasilero 3D

O Claude Code atualiza este arquivo no fim de toda sessão. Uma sessão nova começa lendo daqui.

## Estado das fases
| Fase | Estado | Último commit | Observação |
|---|---|---|---|
| R0 Revisão do guia | pronta (falta o Samuel conferir) | (fora do git: guia) | Correções em `guia-claude-code/`; resumo em DECISOES.md, seção "Revisão R0" |
| F0 Fundação | pronta (falta o Samuel conferir) | a4c0ccd | Monorepo, servidor /saude e /ws, 3 páginas, 39 testes, controle com 6,7 KB |
| F1 Sala e conexão | não começou | | |
| F2 Primeiro jogo | não começou | | |
| F3 Futebol de verdade | não começou | | |
| F4 No ar | não começou | | |
| F5 Times e uniformes | não começou | | |
| F6 Visual 3D realista | não começou | | |
| F7 Som e acabamento | não começou | | |

Estados possíveis: não começou, em andamento, pronta (falta o Samuel conferir), conferida.

## Onde parou
F0 pronta. Próximo passo: F1 (Sala e conexão), depois que o Samuel conferir a F0 e responder "sim". Nada pela metade.

## Dúvidas para o Samuel
Decisões provisórias (regra do jogo) que o guia não cobria. Sigo com a opção mais simples; diga se quer outra:
1. **Limite de 5 humanos por lado.** Quem tenta entrar num lado cheio recebe `LADO_CHEIO`. (SPEC 4.1)
2. **"Pronto" só informativo.** O Dono pode começar com qualquer número de prontos. (SPEC 3.2)
3. **Cores dos goleiros fixas:** Casa amarelo `#E6D800`, Visitante laranja `#FF7F11`. (SPEC 9.3)
4. **Números de física que mudei na R0:** domínio 9 → 14 m/s e passe máximo 20 → 16 m/s, porque com os valores antigos ninguém conseguia receber um passe. Confirmar no sentimento do jogo na F3.
5. **Aviso do npm:** o `npm install` avisa que o `esbuild` tem script de instalação ainda não aprovado (`npm approve-scripts`). Nada quebra sem ele (tsx, vitest e vite funcionam), então não mexi.
6. **F4:** o servidor poderia servir também o site (um túnel só, sem Vercel). Decido na F4; aviso antes de mudar a arquitetura.

## Testes que o Samuel precisa fazer
F0: `npm install`; `npm run dev`; abrir `http://localhost:5173/tela.html` no PC (tem que dizer "conectado"); no celular na mesma Wi-Fi abrir `http://IP-DO-PC:5173/controle.html` (também "conectado"). Se não abrir no celular, é o Firewall do Windows: permitir o Node em redes privadas.

## Registro das sessões
| Data | Fase | O que foi feito | Commits |
|---|---|---|---|
| 04/11/2026 | preparação | Pasta e guias criados pelo Jarvis | (sem git ainda) |
| 04/11/2026 | R0 | Revisão do guia, 10 correções pequenas nos arquivos do guia, seção "Revisão R0" no DECISOES.md | (guia fora do git) |
| 04/11/2026 | F0 | Monorepo, constantes, rng, vetores, dados, servidor mínimo, 3 páginas, checagem do controle | 845d52d, a4c0ccd |
