"""Load source documents (pdf/docx/txt/md/csv) into a uniform representation."""

import io
import os
import tempfile

import pandas as pd

SUPPORTED_TYPES = {"pdf", "docx", "txt", "md", "csv", "xlsx", "xls"}


class TextDocument:
    """Plain-text source (txt/md/csv/xlsx/xls) treated as a single element stream."""

    def __init__(self, text):
        self.text = text
        self.category = "CompositeElement"
        self.metadata = None


def load_source(file_content, filename, file_type):
    """Return unstructured elements (pdf/docx) or a TextDocument (txt/md/csv/xlsx/xls).

    `file_content` is raw bytes; `file_type` may be "pdf", "docx", "csv",
    "txt", "md", "xlsx" or "xls" (with or without a leading dot).
    """
    ftype = (file_type or "").lower().lstrip(".")
    if ftype not in SUPPORTED_TYPES:
        raise ValueError(f"Unsupported file type: {ftype!r}")

    if ftype == "pdf":
        from unstructured.partition.pdf import partition_pdf
        return _partition_file(partition_pdf, file_content, filename, strategy="hi_res", infer_table_structure=True)
    if ftype == "docx":
        from unstructured.partition.docx import partition_docx
        return _partition_file(partition_docx, file_content, filename)
    if ftype in ("xlsx", "xls"):
        return TextDocument(_excel_to_text(file_content))
    if ftype == "csv":
        return TextDocument(_tabular_to_text(pd.read_csv(io.BytesIO(file_content))))
    return TextDocument(file_content.decode("utf-8", errors="replace"))


def _partition_file(partition_fn, file_content, filename, **kwargs):
    """Partition via a real temp file — most robust for hi_res PDF analysis."""
    suffix = os.path.splitext(filename or ".tmp")[1] or ".tmp"
    fd, tmp_path = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(file_content)
        return partition_fn(filename=tmp_path, **kwargs)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def _excel_to_text(file_content):
    import pandas as pd

    sheets = pd.read_excel(io.BytesIO(file_content), sheet_name=None)
    sections = []
    for name, df in sheets.items():
        if df.empty:
            continue
        sections.append(f"## Sheet: {name}\n{_tabular_to_text(df)}")
    if not sections:
        return "(empty workbook)"
    return "\n\n".join(sections)


def _tabular_to_text(df):
    if df.empty:
        return "(empty table)"

    def cell(value):
        try:
            if pd.isna(value):
                return ""
        except (ValueError, TypeError):
            pass
        return str(value)

    lines = [" | ".join(cell(c) for c in df.columns), "---"]
    for _, row in df.iterrows():
        lines.append(" | ".join(cell(v) for v in row.tolist()))
    return "\n".join(lines)