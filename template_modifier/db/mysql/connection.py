

from sqlalchemy import create_engine, Column, String, Text, Integer, DateTime
from sqlalchemy.orm import sessionmaker, declarative_base
import os
import datetime

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

DB_HOST = os.getenv('DB_HOST', '127.0.0.1')
DB_PORT = os.getenv('DB_PORT', '3306')
DB_USER = os.getenv('DB_USER', 'root')
DB_PASSWORD = os.getenv('DB_PASSWORD', '')
DB_NAME = os.getenv('DATABASE_NAME') or os.getenv('DB_NAME', 'dev')

DATABASE_URL = os.getenv('DATABASE_URL')

if not DATABASE_URL:
    DATABASE_URL = f"mysql+mysqldb://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
else:
    if DATABASE_URL.startswith("mysql+pymysql://"):
        DATABASE_URL = DATABASE_URL.replace("mysql+pymysql://", "mysql+mysqldb://", 1)
    if "@localhost" in DATABASE_URL:
        DATABASE_URL = DATABASE_URL.replace("@localhost", "@127.0.0.1")


Base = declarative_base()
engine = create_engine(DATABASE_URL)

class ChatMessage(Base):
    __tablename__ = 'chat_message'
    id = Column(Integer, primary_key=True)
    role = Column(String(20))
    content = Column(Text)
    session_id = Column(String(100))
    created_at = Column(DateTime, default=datetime.datetime.now)
    updated_at = Column(DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now)

Base.metadata.create_all(bind=engine)

session = sessionmaker(bind=engine)