import re
from dataclasses import dataclass
from typing import Literal


CodeNamespace = Literal["reaction", "drug", "structure"]


@dataclass(frozen=True)
class StableCode:
    namespace: CodeNamespace
    number: int
    special: bool = False


_CODE_PATTERN = re.compile(r"^(rxn|drug|str)\s*(\*)?\s*(\d+)$", re.IGNORECASE)


def parse_stable_code(value: str, expected: CodeNamespace | None = None) -> StableCode:
    match = _CODE_PATTERN.fullmatch(value.strip())
    if not match:
        raise ValueError(f"Invalid stable code: {value!r}")
    prefix, star, number_text = match.groups()
    namespace: CodeNamespace = {
        "rxn": "reaction", "drug": "drug", "str": "structure"
    }[prefix.casefold()]
    if star and namespace != "reaction":
        raise ValueError(f"Only Rxn codes may contain '*': {value!r}")
    if expected and namespace != expected:
        raise ValueError(f"Expected a {expected} code, got {value!r}")
    number = int(number_text)
    if number <= 0:
        raise ValueError(f"Stable code numbers must be positive: {value!r}")
    return StableCode(namespace=namespace, number=number, special=bool(star))
