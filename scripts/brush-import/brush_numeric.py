"""Shared numeric parsing for the Krita importer and its adapters.

`numeric` used to live inside krita_import.py. The Sketch adapter needs the
very same parse (and the legacy-radius diameter rule of issue #872), but
krita_import.py and krita_sketch.py reach each other through lazy
in-function imports, so a helper kept in either of them is a circular
dependency waiting to happen. This leaf module is the single source of
truth for the parse and imports nothing from the project.
"""
import math


def numeric(value, default=0):
    try:
        n = float(value)
        return n if math.isfinite(n) else default
    except (ValueError, TypeError):
        return default
