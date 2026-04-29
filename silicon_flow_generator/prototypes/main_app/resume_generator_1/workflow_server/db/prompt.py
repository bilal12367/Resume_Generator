from db.connection import Base
from sqlalchemy import Column, String,Integer, Boolean, Text, DateTime
from uuid import uuid4 as u4
import datetime
from config.jpa_repository import JpaRepository

class Prompt(Base):
    __tablename__ = 'prompts'
    id: str = Column(String, primary_key=True, default=str(u4()))
    name: str = Column(String)
    name_space: str = Column(String)
    version: int = Column(Integer, autoincrement=True)
    is_active: bool = Column(Boolean)
    prompt: str = Column(Text)
    updated_at: DateTime = Column(DateTime, default=datetime.now())


class PromptRepository(JpaRepository(Prompt)):
    pass

