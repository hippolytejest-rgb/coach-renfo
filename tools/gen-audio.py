#!/usr/bin/env python3
"""Génère les clips audio des annonces (edge-tts) et audio/manifest.json.

Textes : noms et répétitions de exercises.json, phrases de phrases.json, nombres 1–60, « 3, 2, 1 ».
Seuls les clips absents sont générés (relancer après ajout ou renommage d'un exercice) ;
pour refaire un clip (voix, débit ou SAY modifiés), supprimer son fichier dans audio/.
Le manifeste associe le texte normalisé (même règle que normTxt() dans index.html) au fichier.

    pip install edge-tts
    python3 tools/gen-audio.py
"""
import asyncio
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

import edge_tts

VOICE = "fr-FR-DeniseNeural"
RATE = "-5%"
PITCH = "+0Hz"
VOLUME = "+0%"
NUMBERS = range(1, 61)
EXTRA = ["3, 2, 1"]
PARALLEL = 4  # requêtes simultanées
RETRIES = 3

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "audio"


def norm(text):
    """Clé du manifeste. Doit rester identique à normTxt() dans index.html."""
    t = unicodedata.normalize("NFC", str(text)).lower().replace("’", "'")
    return re.sub(r"(?:[^\w']|_)+", " ", t).strip()


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


def collect():
    texts = []  # (texte d'origine = clé, texte prononcé)
    lib = json.loads((ROOT / "exercises.json").read_text("utf-8"))
    for ex in lib.values():
        texts.append((ex["name"], ex["name"]))
        reps = (ex.get("defaults") or {}).get("reps")
        if reps:
            texts.append((reps, spoken(reps)))
    phrases = json.loads((ROOT / "phrases.json").read_text("utf-8"))["phrases"]
    html = (ROOT / "index.html").read_text("utf-8")
    for p in phrases:
        if p not in html:
            print(f"  ! phrase absente de index.html (écart avec le code ?) : {p}")
    texts += [(t, t) for t in phrases + [str(n) for n in NUMBERS] + EXTRA]
    clips = {}
    for t, say in texts:
        k = norm(t)
        if k and k not in clips:
            clips[k] = say  # premier texte rencontré
    return clips


async def synth(text, path, sem):
    async with sem:
        for i in range(RETRIES):
            try:
                tmp = path.with_suffix(".part")
                await edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH, volume=VOLUME).save(str(tmp))
                if tmp.stat().st_size == 0:
                    raise RuntimeError("fichier vide")
                tmp.rename(path)
                return True
            except Exception as e:  # réseau, quota : on réessaie
                if i == RETRIES - 1:
                    print(f"  ✗ {text!r} : {e}")
                await asyncio.sleep(1 + i)
        return False


async def main():
    OUT.mkdir(exist_ok=True)
    clips = collect()
    manifest = {k: slug(k) for k in clips}
    todo = [(clips[k], OUT / f) for k, f in manifest.items() if not (OUT / f).is_file() or (OUT / f).stat().st_size == 0]
    print(f"{len(clips)} clips, {len(todo)} à générer ({VOICE}, {RATE})")
    sem = asyncio.Semaphore(PARALLEL)
    ok = await asyncio.gather(*(synth(t, p, sem) for t, p in todo))
    failed = len(ok) - sum(ok)
    # Le manifeste ne liste que les fichiers présents : un clip raté retombe sur la voix du navigateur
    manifest = {k: f for k, f in sorted(manifest.items()) if (OUT / f).is_file()}
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", "utf-8")
    orphans = sorted(p.name for p in OUT.glob("*.mp3") if p.name not in manifest.values())
    if orphans:
        print(f"  {len(orphans)} clip(s) orphelin(s), supprimables : {', '.join(orphans)}")
    print(f"manifest.json : {len(manifest)} entrées" + (f", {failed} échec(s)" if failed else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
