"""Store map save errors; the views turn them into 400 / 409 responses."""


class Conflict(Exception):
    """The layout changed since the client read it (409, code version_conflict)."""


class Blocked(Exception):
    """A change the rules refuse while products depend on it (409, code blocked); the message is Persian."""


class Invalid(Exception):
    """A malformed or out-of-range document (400)."""
