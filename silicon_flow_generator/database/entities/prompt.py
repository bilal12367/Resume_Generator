from sqlalchemy import Column, Integer, String, Text
from database.connection import Base


class Prompt(Base):
    __tablename__ = "prompts"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    name            = Column(String(255), unique=True, nullable=False, index=True)
    prompt          = Column(Text, nullable=False)
    input_variables = Column(String(1000), nullable=True)  # comma-separated e.g. "name,topic,language"