"""Share of a multi-product post per code. Temporary rule (2026-11-06): the first caption code is the
primary product. Computed on read and never stored, so changing the weights needs no data migration."""

PRIMARY_WEIGHT = 2
OTHER_WEIGHT = 1


def weight(position):
    return PRIMARY_WEIGHT if position == 0 else OTHER_WEIGHT


def shares(count):
    """[share per position], summing to 1. shares(2) == [2/3, 1/3]."""
    weights = [weight(position) for position in range(count)]
    total = sum(weights)
    return [value / total for value in weights] if total else []
