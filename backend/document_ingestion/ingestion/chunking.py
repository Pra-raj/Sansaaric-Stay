"""Turn loaded sources into chunk dicts.

Chunk dict shape:
    {"content": str, "page": int | None, "tables_html": list[str]}
"""

from langchain_text_splitters import RecursiveCharacterTextSplitter
from unstructured.chunking.title import chunk_by_title

from .tables import html_table_to_text

CHUNK_MAX_CHARACTERS = 1500
CHUNK_NEW_AFTER_N_CHARS = 1200
CHUNK_OVERLAP = 200


def chunk_elements(elements):
    if isinstance(elements, list):
        chunks = chunk_by_title(
            elements,
            max_characters=CHUNK_MAX_CHARACTERS,
            new_after_n_chars=CHUNK_NEW_AFTER_N_CHARS,
        )
        return [_from_unstructured_chunk(c) for c in chunks]

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_MAX_CHARACTERS,
        chunk_overlap=CHUNK_OVERLAP,
    )
    return [
        {"content": text.strip(), "page": None, "tables_html": []}
        for text in splitter.split_text(elements.text)
        if text.strip()
    ]


def _from_unstructured_chunk(chunk):
    parts = []
    tables_html = []
    orig_elements = getattr(getattr(chunk, "metadata", None), "orig_elements", None) or []

    for element in orig_elements:
        element_meta = getattr(element, "metadata", None)
        table_html = getattr(element_meta, "text_as_html", None) if element_meta else None
        if table_html:
            tables_html.append(table_html)
            converted = html_table_to_text(table_html)
            if converted:
                parts.append(converted)
            continue
        element_text = getattr(element, "text", "") or ""
        if element_text.strip():
            parts.append(element_text)

    content = "\n\n".join(p for p in parts if p)
    if not content.strip():
        content = getattr(chunk, "text", "") or ""

    return {
        "content": content,
        "page": _page_number(chunk),
        "tables_html": tables_html,
    }


def _page_number(chunk):
    orig_elements = getattr(getattr(chunk, "metadata", None), "orig_elements", None) or []
    for element in orig_elements:
        page = getattr(getattr(element, "metadata", None), "page_number", None)
        if page is not None:
            try:
                return int(page)
            except (TypeError, ValueError):
                pass
    return None