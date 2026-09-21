"""Text cleaning and chunk deduplication."""

from hashlib import sha1


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