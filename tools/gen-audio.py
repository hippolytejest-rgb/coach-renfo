#!/usr/bin/env python3
"""Génère les clips audio des annonces (edge-tts), une série par voix, et leurs manifestes.

    audio/femme/*.mp3 + audio/femme/manifest.json   (fr-FR-DeniseNeural)
    audio/homme/*.mp3 + audio/homme/manifest.json   (fr-FR-HenriNeural)

Textes : noms, répétitions et consignes de exercises.json, phrases de phrases.json, nombres (durées annoncées),
plus, avec --gist, les exercices personnels (lib.json) et les séances (coach-renfo.json) du Gist de synchro
(lu avec la CLI gh), ou les mêmes fichiers passés en argument.
Seuls les clips absents sont générés (relancer après ajout ou renommage d'un exercice ou d'une séance) ;
pour refaire un clip (voix, débit ou SAY modifiés), supprimer son fichier. --prune supprime les clips orphelins.
Le manifeste associe la clé normalize(texte) au fichier : normalize() doit rester identique à celle de index.html.

    pip install edge-tts
    python3 tools/gen-audio.py [--gist] [--prune] [lib.json coach-renfo.json …]
"""
import asyncio
import hashlib
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

import edge_tts

VOICES = {"femme": "fr-FR-DeniseNeural", "homme": "fr-FR-HenriNeural"}
RATE = "-5%"
PITCH = "+0Hz"
VOLUME = "+0%"
NUMBERS = [*range(1, 121), *range(125, 301, 5)]  # durées de récupération annoncées (« Récupération 90 secondes »)
EXTRA = ["3, 2, 1"]
PARALLEL = 4  # requêtes simultanées
RETRIES = 3
GIST_FILE, LIB_FILE = "coach-renfo.json", "lib.json"

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "audio"


def normalize(text):
    """Clé du manifeste. Doit rester identique à normalize() dans index.html (mêmes règles, même ordre).
    Minuscules, accents conservés ; les symboles qui se prononcent deviennent des mots (« 10 / côté » = « 10 par côté »),
    le reste de la ponctuation devient une espace."""
    t = unicodedata.normalize("NFC", str(text)).lower()
    t = re.sub(r"[’‘ʼ´`]", "'", t)
    t = re.sub(SP + "×" + SP, " fois ", t)
    t = re.sub("([0-9])" + SP + "[–-]" + SP + "([0-9])", r"\1 à \2", t)
    t = re.sub(SP + "/" + SP, " par ", t)
    t = re.sub(SP + r"\+" + SP, " plus ", t)
    return re.sub(r"(?:[^\w']|_)+", " ", t).strip()


SP = "[ \t\n\r   ]*"  # espaces explicites : \s n'a pas la même définition en Python et en JS


# Réécriture orale des répétitions (« 10 / côté » → « 10 par côté »). Le manifeste garde la clé du texte d'origine.
SAY = [(r"(\d)\s*s\b", r"\1 secondes"), (r"\s*/\s*", " par "), (r"\s*×\s*", " fois "), (r"(\d)\s*[–-]\s*(\d)", r"\1 à \2"), (r"\s*·\s*", ", "), (r"\s*\+\s*", " plus ")]


def spoken(text):
    for pat, rep in SAY:
        text = re.sub(pat, rep, text)
    return text


def slug(key):
    a = unicodedata.normalize("NFKD", key).encode("ascii", "ignore").decode()
    a = re.sub(r"[^a-z0-9]+", "-", a.lower()).strip("-")[:48] or "clip"
    return f"{a}-{hashlib.sha1(key.encode()).hexdigest()[:6]}.mp3"


def gist_files():
    """lib.json et coach-renfo.json du Gist de synchro (CLI gh connectée au compte GitHub)."""
    try:
        ids = subprocess.run(["gh", "api", "gists", "--paginate", "-q", f'.[] | select(.files["{GIST_FILE}"]) | .id'],
                             check=True, capture_output=True, text=True).stdout.split()
        if not ids:
            sys.exit(f"Aucun Gist ne contient {GIST_FILE}.")
        files = json.loads(subprocess.run(["gh", "api", f"gists/{ids[0]}"], check=True, capture_output=True, text=True).stdout)["files"]
    except (OSError, subprocess.CalledProcessError) as e:
        sys.exit(f"Lecture du Gist impossible (gh installé et connecté ?) : {e}")
    return [json.loads(files[n]["content"]) for n in (LIB_FILE, GIST_FILE) if n in files]


def ex_texts(ex):
    """Nom, répétitions et consigne d'un exercice (bibliothèque) ou d'un item de séance (valeurs en ligne)."""
    out = []
    if ex.get("name"):
        out.append((ex["name"], ex["name"]))
    reps = (ex.get("defaults") or {}).get("reps") or ex.get("reps")
    if reps:
        out.append((reps, spoken(reps)))
    if ex.get("desc"):
        out.append((ex["desc"], ex["desc"]))
    return out


def data_texts(d):
    """Textes d'une bibliothèque (exercises.json, lib.json) ou d'un fichier de synchro (coach-renfo.json)."""
    out = []
    exs = d.get("exercises", d) if "data" not in d else {}
    for ex in exs.values():
        if isinstance(ex, dict):
            out += ex_texts(ex)
    for p in (d.get("data") or {}).values():
        for s in p.get("sessions") or []:
            out.append((s["name"], s["name"]))
            for b in s.get("blocks") or []:
                for it in b.get("items") or []:
                    out += ex_texts(it)
                    out += [(n, str(n)) for n in (b.get("roundRest"), b.get("transition")) if isinstance(n, int) and n > 0]
    return out


def collect(extra):
    texts = data_texts(json.loads((ROOT / "exercises.json").read_text("utf-8")))
    for d in extra:
        texts += data_texts(d)
    phrases = json.loads((ROOT / "phrases.json").read_text("utf-8"))["phrases"]
    code = "".join((ROOT / f).read_text("utf-8") for f in ("index.html", "generator.js"))
    for p in phrases:
        if p not in code:
            print(f"  ! phrase absente de index.html et generator.js (écart avec le code ?) : {p}")
    texts += [(t, t) for t in phrases + [str(n) for n in NUMBERS] + EXTRA]
    clips = {}
    for t, say in texts:
        k = normalize(t)
        if k and k not in clips:
            clips[k] = say  # premier texte rencontré
    return clips


async def synth(text, voice, path, sem):
    async with sem:
        for i in range(RETRIES):
            try:
                tmp = path.with_suffix(".part")
                await edge_tts.Communicate(text, voice, rate=RATE, pitch=PITCH, volume=VOLUME).save(str(tmp))
                if tmp.stat().st_size == 0:
                    raise RuntimeError("fichier vide")
                tmp.rename(path)
                return True
            except Exception as e:  # réseau, quota : on réessaie
                if i == RETRIES - 1:
                    print(f"  ✗ {voice} {text!r} : {e}")
                await asyncio.sleep(1 + i)
        return False


async def main(args):
    prune = "--prune" in args
    extra = gist_files() if "--gist" in args else []
    extra += [json.loads(Path(a).read_text("utf-8")) for a in args if not a.startswith("--")]
    clips = collect(extra)
    names = {k: slug(k) for k in clips}
    sem = asyncio.Semaphore(PARALLEL)
    failed = 0
    for key, voice in VOICES.items():
        out = OUT / key
        out.mkdir(parents=True, exist_ok=True)
        todo = [(clips[k], out / f) for k, f in names.items() if not (out / f).is_file() or (out / f).stat().st_size == 0]
        print(f"{key} ({voice}, {RATE}) : {len(clips)} clips, {len(todo)} à générer")
        ok = await asyncio.gather(*(synth(t, voice, p, sem) for t, p in todo))
        failed += len(ok) - sum(ok)
        # Le manifeste ne liste que les fichiers présents : un clip raté retombe sur la voix de secours (ou le silence)
        manifest = {k: f for k, f in sorted(names.items()) if (out / f).is_file()}
        (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", "utf-8")
        orphans = sorted(p for p in out.glob("*.mp3") if p.name not in manifest.values())
        if orphans and prune:
            for p in orphans:
                p.unlink()
            print(f"  {len(orphans)} clip(s) orphelin(s) supprimé(s)")
        elif orphans:
            print(f"  {len(orphans)} clip(s) orphelin(s), supprimables avec --prune : {', '.join(p.name for p in orphans)}")
        size = sum(p.stat().st_size for p in out.glob("*.mp3"))
        print(f"  manifest.json : {len(manifest)} entrées, {size / 1e6:.1f} Mo")
    if failed:
        print(f"{failed} échec(s)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1:])))
