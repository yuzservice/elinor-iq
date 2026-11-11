"""Category tree shared by the whole app: website titles, parents and status; filters by id including descendants.

The Elinor API has no category list in our client, so the tree is the dump's `categories` table kept current from the
`categories` embedded in product payloads (each one carries id, title, parent_id, status). Read-only towards Elinor.
Rules: docs/business-rules/products.md."""

from collections import defaultdict

from django.db import transaction

from .models import Category, Product


def _nodes():
    return list(Category.objects.values("id", "source_id", "title", "parent_id", "status"))


def tree(include_inactive=False):
    """Flat list of nodes in display order with path, depth and a short label that adds the parent where a title
    repeats («مانتو (پوشاک)»). Inactive categories are left out of selectors but keep their history."""
    nodes = {row["id"]: row for row in _nodes()}
    children = defaultdict(list)
    for row in nodes.values():
        children[row["parent_id"]].append(row["id"])
    titles = defaultdict(int)
    for row in nodes.values():
        titles[row["title"].strip()] += 1

    def path(node_id):
        parts, seen = [], set()
        while node_id and node_id in nodes and node_id not in seen:
            seen.add(node_id)
            parts.append(nodes[node_id]["title"].strip())
            node_id = nodes[node_id]["parent_id"]
        return list(reversed(parts))

    out = []

    def walk(node_id, depth):
        row = nodes[node_id]
        if not row["status"] and not include_inactive:
            return
        full = path(node_id)
        label = full[-1]
        if titles[label] > 1 and len(full) > 1:
            label = f"{label} ({full[-2]})"
        kids = sorted(children[node_id], key=lambda i: nodes[i]["title"])
        out.append({"id": node_id, "title": full[-1], "label": label, "path": " › ".join(full), "parent_id": row["parent_id"],
                    "depth": depth, "active": bool(row["status"]), "has_children": bool(kids)})
        for kid in kids:
            walk(kid, depth + 1)

    for root in sorted((i for i in children[None]), key=lambda i: nodes[i]["title"]):
        walk(root, 0)
    # Orphans (parent missing) are shown as roots.
    seen = {row["id"] for row in out}
    for node_id, row in nodes.items():
        if node_id not in seen and row["parent_id"] not in nodes:
            walk(node_id, 0)
    return out


def descendant_ids(category_ids):
    """The given ids plus every descendant (any depth)."""
    children = defaultdict(list)
    for node_id, parent_id in Category.objects.values_list("id", "parent_id"):
        children[parent_id].append(node_id)
    result, stack = set(), [int(i) for i in category_ids]
    while stack:
        node_id = stack.pop()
        if node_id in result:
            continue
        result.add(node_id)
        stack.extend(children[node_id])
    return result


def product_ids_in(category_ids, with_descendants=True):
    ids = descendant_ids(category_ids) if with_descendants else {int(i) for i in category_ids}
    return list(Product.objects.filter(categories__in=ids).values_list("id", flat=True).distinct())


def ids_for_titles(titles):
    """Old title filters → exact category ids (no descendants), so old saved views return the same customers.
    Returns (ids, unmatched titles)."""
    wanted = {title.strip() for title in titles if title and title.strip()}
    found = dict(Category.objects.filter(title__in=wanted).values_list("title", "id"))
    return list(found.values()), sorted(wanted - set(found))


def sync_from_payloads():
    """Upsert categories and product links from product payloads (the website's own data). Idempotent.

    A product whose payload lists categories gets exactly those links; products without a payload keep the dump's."""
    seen = {}
    product_links = {}
    for product_id, cats in Product.objects.exclude(source_payload=None).values_list("id", "source_payload__categories"):
        if not isinstance(cats, list):
            continue
        ids = []
        for cat in cats:
            if not isinstance(cat, dict) or cat.get("id") is None:
                continue
            seen[int(cat["id"])] = cat
            ids.append(int(cat["id"]))
        product_links[product_id] = ids
    created = updated = 0
    with transaction.atomic():
        by_source = {c.source_id: c for c in Category.objects.all()}
        for source_id, cat in seen.items():
            values = {"title": str(cat.get("title") or "").strip()[:255], "slug": str(cat.get("slug") or "")[:255],
                      "status": str(cat.get("status")) in {"1", "True", "true", "active"}}
            row = by_source.get(source_id)
            if row is None:
                by_source[source_id] = Category.objects.create(source_id=source_id, **values)
                created += 1
            elif any(getattr(row, key) != value for key, value in values.items()):
                Category.objects.filter(pk=row.pk).update(**values)
                updated += 1
        for source_id, cat in seen.items():
            parent = by_source.get(int(cat["parent_id"])) if cat.get("parent_id") else None
            Category.objects.filter(source_id=source_id).exclude(parent=parent).update(parent=parent)
        through = Product.categories.through
        changed = 0
        for product_id, source_ids in product_links.items():
            wanted = {by_source[s].pk for s in source_ids if s in by_source}
            current = set(through.objects.filter(product_id=product_id).values_list("category_id", flat=True))
            if wanted and wanted != current:
                through.objects.filter(product_id=product_id).exclude(category_id__in=wanted).delete()
                through.objects.bulk_create([through(product_id=product_id, category_id=c) for c in wanted - current])
                changed += 1
    return {"categories_seen": len(seen), "created": created, "updated": updated, "products_relinked": changed}
