import logging
from sqlalchemy.orm import Session

from database.entities.prompt import Prompt

logger = logging.getLogger("app")


class PromptService:

    def __init__(self, db: Session):
        self.db = db

    def get_by_name(self, name: str) -> Prompt | None:
        prompt = self.db.query(Prompt).filter(Prompt.name == name).first()
        if not prompt:
            logger.warning(f"Prompt not found | name={name}")
            return None
        logger.info(f"Prompt fetched | name={name}")
        return prompt

    def get_input_variables(self, name: str) -> list[str]:
        """Returns input_variables as a list."""
        prompt = self.get_by_name(name)
        if not prompt or not prompt.input_variables:
            return []
        return [v.strip() for v in prompt.input_variables.split(",")]

    def create(self, name: str, prompt: str, input_variables: list[str] | None = None) -> Prompt:
        obj = Prompt(
            name=name,
            prompt=prompt,
            input_variables=",".join(input_variables) if input_variables else None,
        )
        self.db.add(obj)
        self.db.commit()
        self.db.refresh(obj)
        logger.info(f"Prompt created | name={name}")
        return obj

    def delete(self, name: str) -> bool:
        prompt = self.get_by_name(name)
        if not prompt:
            return False
        self.db.delete(prompt)
        self.db.commit()
        logger.info(f"Prompt deleted | name={name}")
        return True