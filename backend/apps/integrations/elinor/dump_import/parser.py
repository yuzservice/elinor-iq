"""Streaming mysqldump INSERT parser. Does not load the dump into RAM."""

from __future__ import annotations


def iter_insert_tuples(dump_path, table_names):
    """Yield (table, fields_list) for INSERT rows of the given tables."""
    wanted = set(table_names)
    current = None
    leftover = ""
    with open(dump_path, "r", encoding="utf-8", errors="replace", buffering=8 * 1024 * 1024) as handle:
        for line in handle:
            if current is None:
                if not line.startswith("INSERT INTO `"):
                    continue
                name = line.split("`", 2)[1]
                if name not in wanted:
                    continue
                current = name
                leftover = line
            else:
                leftover += line
            if not leftover.rstrip().endswith(";"):
                continue
            yield from _tuples_from_insert(current, leftover)
            current = None
            leftover = ""


def _tuples_from_insert(table, chunk):
    i = chunk.find("VALUES")
    if i < 0:
        return
    i += 6
    n = len(chunk)
    while i < n and chunk[i] in " \t\r\n":
        i += 1
    while i < n:
        if chunk[i] != "(":
            i += 1
            continue
        i += 1
        fields = []
        field = []
        in_str = False
        escape = False
        while i < n:
            c = chunk[i]
            if in_str:
                if escape:
                    field.append(c)
                    escape = False
                elif c == "\\":
                    field.append(c)
                    escape = True
                elif c == "'":
                    in_str = False
                    field.append(c)
                else:
                    field.append(c)
            else:
                if c == "'":
                    in_str = True
                    field.append(c)
                elif c == ",":
                    fields.append("".join(field).strip())
                    field = []
                elif c == ")":
                    fields.append("".join(field).strip())
                    yield table, fields
                    i += 1
                    break
                else:
                    field.append(c)
            i += 1
        while i < n and chunk[i] in " \t\r\n,":
            if chunk[i] == ",":
                i += 1
                break
            i += 1
        if i < n and chunk[i] == ";":
            return


def unquote(token):
    if token is None:
        return None
    value = token.strip()
    if value.upper() == "NULL" or value == "":
        return None
    if len(value) >= 2 and value[0] == "'" and value[-1] == "'":
        inner = value[1:-1]
        inner = inner.replace("\\'", "'").replace("\\\\", "\\")
        inner = inner.replace("\\n", "\n").replace("\\r", "\r").replace("\\t", "\t")
        return inner
    return value
