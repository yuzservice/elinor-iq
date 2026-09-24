"""Coverage notice for incomplete live API windows. Historical SQL import is complete."""

PARTIAL_DATA = False
COVERAGE_MESSAGE = ""


def coverage_payload():
    if not PARTIAL_DATA:
        return {"partial": False, "message": ""}
    return {"partial": True, "message": COVERAGE_MESSAGE}
