"""
Junta o personagem e as animações do Mixamo num único jogador.glb para o Brasilero 3D (F6, ARQUITETURA 6.2).

Uso (PowerShell, na pasta projeto/):

    blender --background --python ferramentas/blender/montar_jogador.py -- "assets-fonte/mixamo" "assets-fonte/jogador-bruto.glb"

O primeiro caminho é uma PASTA com os FBX do Mixamo:
  - o personagem (o arquivo que tem "personagem", "character" ou "modelo" no nome; se não tiver nenhum, o MAIOR arquivo);
  - uma animação por arquivo, com o nome dizendo qual é (ver DICAS abaixo). Exemplos: Parado.fbx, Corrida.fbx, Chute.fbx,
    "Soccer Pass.fbx", "Goalkeeper Idle.fbx". Maiúscula, acento e espaço não importam.

O que o script faz:
  1. Importa o personagem e cada animação, e renomeia cada ação para um dos 14 nomes do jogo.
  2. Renomeia os materiais para Camisa, Calcao, Meiao, Pele, Cabelo e Chuteira (pelo nome do material; se não der para
     adivinhar, ele LISTA os materiais e pede para você escolher na linha de comando com --mapa).
  3. Escala o personagem para 1,80 m, com os pés em y = 0.
  4. Exporta um GLB (Y para cima, esqueleto, todas as animações).

Depois, comprima (texturas no máximo 1024 px, malha com meshopt):

    npx --yes @gltf-transform/cli optimize "assets-fonte/jogador-bruto.glb" "apps/web/public/modelos/jogador.glb" --compress meshopt --texture-compress webp --texture-size 1024

DICAS para baixar do Mixamo: formato FBX Binary, 30 fps, "Without Skin" nas animações (só o personagem vem com malha) e
MARQUE "In Place" nas animações de corrida/parado (o jogador anda pelo campo, não pela animação).

Se um material não for reconhecido, use --mapa "NomeNoModelo=Camisa,OutroNome=Calcao". Quem decide é você: o script nunca chuta.

Este script usa só a API do Blender (bpy); não roda fora dele. Testado para Blender 4.x (o exportador glTF mudou de nome em
alguns parâmetros entre versões; o script tenta o nome novo e cai no antigo).
"""

import os
import re
import sys
import unicodedata

import bpy  # noqa: F401  (só existe dentro do Blender)

NOMES_DOS_CLIPES = [
    "Parado", "Corrida", "Arrancada", "Chute", "Passe", "Carrinho", "Queda", "Comemoracao",
    "GoleiroParado", "GoleiroMergulhoEsq", "GoleiroMergulhoDir", "Cabeceio", "GoleiroComBola", "Cobranca",
]
# Quais clipes são opcionais (o telão usa uma reserva se faltar; ARQUITETURA 6.2)
OPCIONAIS = {"GoleiroComBola", "Cobranca", "Arrancada", "Cabeceio", "Passe", "Carrinho", "Comemoracao",
             "GoleiroMergulhoEsq", "GoleiroMergulhoDir", "GoleiroParado"}

# Palavras (sem acento, minúsculas, sem espaço) que identificam cada animação no nome do arquivo. A ordem importa: a mais
# específica primeiro ("goleiromergulhoesq" antes de "goleiro", "arrancada/sprint" antes de "corrida/run").
PALAVRAS = [
    ("GoleiroMergulhoEsq", ["goleiromergulhoesq", "divel", "diveleft", "keeperdiveleft", "goalkeeperdiveleft"]),
    ("GoleiroMergulhoDir", ["goleiromergulhodir", "diver", "diveright", "keeperdiveright", "goalkeeperdiveright"]),
    ("GoleiroComBola", ["goleirocombola", "goalkeeperball", "goalkeeperhold", "keeperball", "keeperhold", "goalkeepercatch"]),
    ("GoleiroParado", ["goleiroparado", "goalkeeperidle", "keeperidle", "goalkeeper", "goleiro"]),
    ("Cobranca", ["cobranca", "freekick", "throwin", "lateral", "throw"]),
    ("Cabeceio", ["cabeceio", "header", "heading"]),
    ("Comemoracao", ["comemoracao", "celebrat", "victory", "cheer", "dance", "goalcelebration"]),
    ("Carrinho", ["carrinho", "slide", "tackle"]),
    ("Queda", ["queda", "fall", "knockdown", "knockeddown", "dying", "death"]),
    ("Passe", ["passe", "pass"]),
    ("Chute", ["chute", "kick", "shoot", "shot"]),
    ("Arrancada", ["arrancada", "sprint", "fastrun"]),
    ("Corrida", ["corrida", "running", "run", "jog"]),
    ("Parado", ["parado", "idle", "stand", "breathing"]),
]

MATERIAIS = ["Camisa", "Calcao", "Meiao", "Pele", "Cabelo", "Chuteira"]
PALAVRAS_DE_MATERIAL = [
    ("Camisa", ["camisa", "jersey", "shirt", "top", "torso", "body_upper", "tshirt"]),
    ("Calcao", ["calcao", "short", "bottom", "pants", "trouser", "lower"]),
    ("Meiao", ["meiao", "sock", "leg"]),
    ("Chuteira", ["chuteira", "shoe", "boot", "foot", "cleat", "sneaker"]),
    ("Cabelo", ["cabelo", "hair", "brow", "beard"]),
    ("Pele", ["pele", "skin", "head", "face", "body", "hand", "eye", "teeth", "mouth"]),
]


def simples(texto):
    """Minúsculas, sem acento, só letras e números."""
    s = unicodedata.normalize("NFD", texto)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", s.lower())


def argumentos():
    resto = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    mapa = {}
    posicionais = []
    i = 0
    while i < len(resto):
        if resto[i] == "--mapa" and i + 1 < len(resto):
            for par in resto[i + 1].split(","):
                if "=" in par:
                    de, para = par.split("=", 1)
                    mapa[de.strip()] = para.strip()
            i += 2
        else:
            posicionais.append(resto[i])
            i += 1
    if len(posicionais) != 2:
        print(__doc__)
        sys.exit("Uso: blender --background --python montar_jogador.py -- <pasta-com-os-fbx> <saida.glb> [--mapa A=Camisa,B=Calcao]")
    return posicionais[0], posicionais[1], mapa


def achar_personagem(arquivos):
    for f in arquivos:
        if any(p in simples(os.path.splitext(f[0])[0]) for p in ("personagem", "character", "modelo", "player")):
            return f
    return max(arquivos, key=lambda f: f[2])  # o maior arquivo é quem tem a malha e a textura


def nome_do_clipe(arquivo):
    base = simples(os.path.splitext(arquivo)[0])
    for clipe in NOMES_DOS_CLIPES:
        if base == simples(clipe):
            return clipe
    for clipe, palavras in PALAVRAS:
        if any(p in base for p in palavras):
            return clipe
    return None


def importar_fbx(caminho):
    """Importa um FBX e devolve os objetos novos."""
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=caminho)
    return [o for o in bpy.data.objects if o not in antes]


def papel_do_material(nome):
    s = simples(nome)
    for papel, palavras in PALAVRAS_DE_MATERIAL:
        if any(p in s for p in palavras):
            return papel
    return None


def renomear_materiais(malhas, mapa_do_usuario):
    """Renomeia os materiais. Devolve a lista dos que não foi possível reconhecer."""
    vistos = {}
    for obj in malhas:
        for slot in obj.material_slots:
            if slot.material:
                vistos[slot.material.name] = slot.material
    nao_reconhecidos = []
    usados = set()
    for nome, mat in list(vistos.items()):
        if nome in mapa_do_usuario:
            papel = mapa_do_usuario[nome]
        else:
            papel = papel_do_material(nome)
        if papel not in MATERIAIS:
            nao_reconhecidos.append(nome)
            continue
        if papel in usados:
            # Dois materiais para o mesmo papel (ex.: duas partes da pele): o segundo ganha sufixo, o jogo reconhece o prefixo
            papel = papel + "." + str(len([u for u in usados if u.startswith(papel)]) + 1)
        usados.add(papel)
        mat.name = papel
    return nao_reconhecidos


def escalar_para_1_80(armadura, malhas):
    """Escala a armadura (e quem está nela) para o corpo ter 1,80 m, e coloca os pés em z = 0 (y = 0 no glTF)."""
    from mathutils import Vector
    baixo, alto = 1e9, -1e9
    for obj in malhas:
        for canto in obj.bound_box:
            z = (obj.matrix_world @ Vector(canto)).z
            baixo, alto = min(baixo, z), max(alto, z)
    altura = alto - baixo
    if altura <= 0:
        sys.exit("Não consegui medir a altura do personagem (malha vazia?).")
    fator = 1.8 / altura
    armadura.scale = tuple(v * fator for v in armadura.scale)
    bpy.context.view_layer.update()
    baixo2 = min((obj.matrix_world @ Vector(c)).z for obj in malhas for c in obj.bound_box)
    armadura.location.z -= baixo2
    bpy.context.view_layer.update()
    print("Altura original: %.3f (unidades do Blender); escala aplicada: %.4f" % (altura, fator))


def exportar(saida, usar_nla):
    pasta = os.path.dirname(os.path.abspath(saida))
    os.makedirs(pasta, exist_ok=True)
    comuns = dict(filepath=saida, export_format="GLB", export_yup=True, export_skins=True, export_apply=False)
    tentativas = []
    if not usar_nla:
        tentativas.append(dict(comuns, export_animation_mode="ACTIONS"))  # Blender 4.2 ou mais novo
    tentativas.append(dict(comuns, export_animations=True, export_nla_strips=True, export_force_sampling=True))  # mais antigo
    ultimo = None
    for params in tentativas:
        try:
            bpy.ops.export_scene.gltf(**params)
            return
        except TypeError as e:  # parâmetro que esta versão não conhece
            ultimo = e
    raise ultimo


def main():
    pasta, saida, mapa = argumentos()
    if not os.path.isdir(pasta):
        sys.exit("A pasta não existe: " + pasta)

    bpy.ops.wm.read_factory_settings(use_empty=True)

    arquivos = []
    for nome in sorted(os.listdir(pasta)):
        if nome.lower().endswith(".fbx"):
            caminho = os.path.join(pasta, nome)
            arquivos.append((nome, caminho, os.path.getsize(caminho)))
    if not arquivos:
        sys.exit("Não achei nenhum .fbx em " + pasta)

    personagem = achar_personagem(arquivos)
    print("Personagem:", personagem[0])
    novos = importar_fbx(personagem[1])
    armaduras = [o for o in novos if o.type == "ARMATURE"]
    malhas = [o for o in novos if o.type == "MESH"]
    if not armaduras or not malhas:
        sys.exit("O personagem precisa ter esqueleto e malha (baixe do Mixamo com skin).")
    armadura = armaduras[0]
    for a in bpy.data.actions:  # a pose de importação do personagem não é uma animação do jogo
        bpy.data.actions.remove(a)

    # --- animações -----------------------------------------------------------------------
    achadas = {}
    ignoradas = []
    for nome, caminho, _ in arquivos:
        if caminho == personagem[1]:
            continue
        clipe = nome_do_clipe(nome)
        if clipe is None or clipe in achadas:
            ignoradas.append(nome)
            continue
        extras = importar_fbx(caminho)
        acao = None
        for o in extras:
            if o.type == "ARMATURE" and o.animation_data and o.animation_data.action:
                acao = o.animation_data.action
        if acao is None:
            ignoradas.append(nome + " (sem animação dentro)")
        else:
            acao.name = clipe
            acao.use_fake_user = True
            achadas[clipe] = acao
        for o in extras:  # o esqueleto e a malha das animações não servem; só a ação
            bpy.data.objects.remove(o, do_unlink=True)

    if not armadura.animation_data:
        armadura.animation_data_create()
    # Faixas de NLA: usadas só pelo exportador antigo; o novo exporta as ações direto.
    for clipe, acao in achadas.items():
        faixa = armadura.animation_data.nla_tracks.new()
        faixa.name = clipe
        faixa.strips.new(clipe, int(acao.frame_range[0]), acao)
    armadura.animation_data.action = None

    # --- materiais, escala, exportação ---------------------------------------------------
    nao_reconhecidos = renomear_materiais(malhas, mapa)
    escalar_para_1_80(armadura, malhas)

    print("\n=== RESUMO ===")
    for clipe in NOMES_DOS_CLIPES:
        marca = "ok     " if clipe in achadas else ("falta  " if clipe in OPCIONAIS else "FALTA! ")
        print(marca, clipe)
    if ignoradas:
        print("Arquivos que não consegui ligar a nenhuma animação (renomeie o arquivo):", ignoradas)
    if nao_reconhecidos:
        print("\nMATERIAIS NÃO RECONHECIDOS:", nao_reconhecidos)
        print("Diga para qual parte do uniforme cada um serve, com  --mapa \"%s=Camisa,...\"" % nao_reconhecidos[0])
        print("Partes válidas:", ", ".join(MATERIAIS))
        print("(Sem a Camisa o jogo funciona, mas o uniforme do time não aparece no modelo.)")
    if "Parado" not in achadas or "Corrida" not in achadas:
        sys.exit("Faltam Parado e/ou Corrida: sem elas o jogador não anima. Baixe-as do Mixamo e rode de novo.")

    exportar(saida, usar_nla=False)
    print("\nGravei", saida)


main()
