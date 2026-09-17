"""Text cleaning and chunk deduplication."""

import re
import unicodedata
from hashlib import sha1

_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_MULTI_WS_RE = re.compile(r"[ \t\f\v]+")
_MULTI_BLANK_RE = re.compile(r"\n{3,}")


def clean_text(text):
    if not text:
        return ""
    text = unicodedata.normalize("NFKC", text)
    text = _CONTROL_RE.sub("", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _MULTI_WS_RE.sub(" ", text)
    text = text.replace("\n ", "\n").replace(" \n", "\n")
    text = _MULTI_BLANK_RE.sub("\n\n", text)
    return text.strip()


def content_hash(text):
    return sha1(text.encode("utf-8", errors="replace")).hexdigest()


def drop_empty(chunks):
    return [c for c in chunks if c["content"].strip()]


def dedupe(chunks):
    seen = set()
    out = []
    for chunk in chunks:
        digest = content_hash(chunk["content"])
        if digest in seen:
            continue
        seen.add(digest)
        out.append(chunk)
    return out