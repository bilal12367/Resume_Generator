
from sqlalchemy import create_engine

from sqlalchemy.orm import sessionmaker as create_session

from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

engine = create_engine("sqlite:///job_scraper_db.db")

session = create_session(engine, autoflush=True, autocommit=True)

class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True)
    session_id = Column(String)
    
