import re
from dataclasses import dataclass
from typing import Literal


CodeNamespace = Literal["reaction", "drug", "structure"]
ReactionSeries = Literal["general", "special", "scaffold"]


@dataclass(frozen=True)
class StableCode:
    namespace: CodeNamespace
    number: int
    reaction_series: ReactionSeries | None = None


_CODE_PATTERN = re.compile(r"^(srxn|rxn|drug|str)\s*(\*)?\s*(\d+)$", re.IGNORECASE)


def parse_stable_code(value: str, expected: CodeNamespace | None = None) -> StableCode:
    match = _CODE_PATTERN.fullmatch(value.strip())
    if not match:
        raise ValueError(f"Invalid stable code: {value!r}")
    prefix, star, number_text = match.groups()
    normalized_prefix = prefix.casefold()
    namespace: CodeNamespace = {
        "rxn": "reaction", "srxn": "reaction", "drug": "drug", "str": "structure"
    }[normalized_prefix]
    if star and normalized_prefix != "rxn":
        raise ValueError(f"Only named-reaction Rxn codes may contain '*': {value!r}")
    if expected and namespace != expected:
        raise ValueError(f"Expected a {expected} code, got {value!r}")
    number = int(number_text)
    if number <= 0:
        raise ValueError(f"Stable code numbers must be positive: {value!r}")
    reaction_series: ReactionSeries | None = None
    if normalized_prefix == "rxn":
        reaction_series = "special" if star else "general"
    elif normalized_prefix == "srxn":
        reaction_series = "scaffold"
    return StableCode(
        namespace=namespace, number=number, reaction_series=reaction_series
    )
