from functools import lru_cache
from pathlib import Path
from typing import Any, Dict
import yaml

from app.config.settings import settings


class ConfigLoader:
    def __init__(
        self,
        validation_path: Path = settings.VALIDATION_RULES_PATH,
        risk_path: Path = settings.RISK_RULES_PATH,
    ):
        self.validation_path = validation_path
        self.risk_path = risk_path

    def load_validation_rules(self) -> Dict[str, Any]:
        if not self.validation_path.exists():
            raise FileNotFoundError(f"Validation rules file not found at: {self.validation_path}")
        with open(self.validation_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}

    def load_risk_rules(self) -> Dict[str, Any]:
        if not self.risk_path.exists():
            raise FileNotFoundError(f"Risk rules file not found at: {self.risk_path}")
        with open(self.risk_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}


@lru_cache()
def get_validation_rules() -> Dict[str, Any]:
    return ConfigLoader().load_validation_rules()


@lru_cache()
def get_risk_rules() -> Dict[str, Any]:
    return ConfigLoader().load_risk_rules()
