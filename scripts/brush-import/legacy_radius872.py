"""Issue #872: the Krita 2.2 legacy "radius" auto-brush generator attribute.

Krita 2.2 serialized the mask generator size as "radius". The pinned
KisAutoBrushFactory::loadBrush reads that attribute AS the generator
diameter and gives it priority over "diameter" ("backward compatibility --
it was mistakenly named radius for 2.2"):

    generatorEl.hasAttribute("radius")
        ? KisDomUtils::toDouble(generatorEl.attribute("radius", "1.0"))
        : KisDomUtils::toDouble(generatorEl.attribute("diameter", "1.0"));

Leaf module on purpose: krita_import.py and krita_sketch.py both import it,
so it must not import either of them (import cycle).
"""
from brush_numeric import numeric


def auto_generator_diameter(generator, default=1):
    """Resolve the auto-brush mask generator diameter the way Krita does.

    A present "radius" wins over "diameter"; without "radius" the
    "diameter" attribute is used, otherwise `default`. A present but
    unparsable "radius" is read as 0.0 here: the pinned snapshot does not
    contain kis_dom_utils.cpp, so the KisDomUtils::toDouble fallback could
    not be compared against it and is deliberately not claimed.
    """
    if generator is None:
        return numeric(None, default)
    radius = generator.get('radius')
    if radius is not None:
        return numeric(radius, 0)
    return numeric(generator.get('diameter'), default)


def legacy_radius_generator(generator):
    """True when the generator carries the legacy 2.2 "radius" attribute."""
    return generator is not None and generator.get('radius') is not None
