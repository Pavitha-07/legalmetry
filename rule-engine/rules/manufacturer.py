from .base import RuleResult, Status

RULE_ID = "LM-PC-002"
REQUIREMENT = "Manufacturer/packer/importer details"
LEGAL_REF = "Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 6"


def check(data: dict) -> RuleResult:
    manufacturer = data.get("manufacturer") or {}
    packer = data.get("packer") or {}
    importer = data.get("importer") or {}

    # Use whichever of manufacturer/packer/importer has a name
    entity = None
    for candidate in (manufacturer, packer, importer):
        if isinstance(candidate, dict) and candidate.get("name"):
            entity = candidate
            break

    if entity is None:
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.FAIL,
            legal_reference=LEGAL_REF, detected_value=None,
            reason="No manufacturer, packer, or importer name detected.",
            recommendation="Add 'Manufactured by' / 'Packed by' / 'Imported by' details with name and address.",
        )

    name = entity.get("name")
    address = entity.get("address")

    if not address or not str(address).strip():
        return RuleResult(
            rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.FAIL,
            legal_reference=LEGAL_REF, detected_value=name,
            reason="Entity name detected but required address was not detected.",
            recommendation="Add the complete applicable manufacturer/packer/importer address.",
        )

    return RuleResult(
        rule_id=RULE_ID, requirement=REQUIREMENT, status=Status.PASS,
        legal_reference=LEGAL_REF, detected_value=f"{name}, {address}",
        reason="Entity name and address detected.",
    )