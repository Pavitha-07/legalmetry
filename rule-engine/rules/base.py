from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class Status(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    NOT_APPLICABLE = "NOT_APPLICABLE"
    NEEDS_REVIEW = "NEEDS_REVIEW"


@dataclass
class RuleResult:
    rule_id: str
    requirement: str
    status: Status
    legal_reference: str
    detected_value: Optional[str] = None
    reason: str = ""
    recommendation: Optional[str] = None

    def to_dict(self):
        return {
            "rule_id": self.rule_id,
            "requirement": self.requirement,
            "status": self.status.value,
            "detected_value": self.detected_value,
            "reason": self.reason,
            "recommendation": self.recommendation,
            "legal_reference": self.legal_reference,
        }