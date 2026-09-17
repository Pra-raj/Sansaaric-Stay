"""Convert unstructured `text_as_html` tables into readable text.

Uses only the stdlib HTML parser — no extra dependencies.
"""

from html.parser import HTMLParser


class _HTMLTableToText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self._current_row = None
        self._cell_parts = None

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag == "tr":
            self._current_row = []
            self.rows.append(self._current_row)
        elif tag in ("td", "th"):
            self._cell_parts = []

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in ("td", "th") and self._current_row is not None and self._cell_parts is not None:
            self._current_row.append("".join(self._cell_parts))
            self._cell_parts = None

    def handle_data(self, data):
        if self._cell_parts is not None:
            self._cell_parts.append(data)


def html_table_to_text(table_html):
    """Parse a single `<table>` HTML fragment into pipe-markdown table text."""
    parser = _HTMLTableToText()
    parser.feed(table_html or "")

    rows = [[clean_cell(c) for c in row] for row in parser.rows]
    rows = [row for row in rows if any(row)]
    if not rows:
        return ""

    def fmt(row):
        return " | ".join(row)

    body = [" ".join(fmt(rows[0]).split()), "---"]  # normalize header spacing
    body.extend(fmt(row) for row in rows[1:])
    return "\n".join(body)


def clean_cell(value):
    value = (value or "").replace("\xa0", " ")
    return " ".join(value.split()).strip()