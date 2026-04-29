
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from config.env_settings import settings
load_dotenv()


# 1. Define the database URL
# DATABASE_URL = f"mysql+pymysql://{settings.DB_USER}:{settings.DB_PASSWORD}@{settings.DB_HOST}:{settings.DB_PORT}/{settings.DATABASE_NAME}"
DATABASE_URL = 'sqlite:///./test.db'

# 2. Create the Engine
# The engine is the starting point for any SQLAlchemy application.
engine = create_engine(DATABASE_URL)

# 3. Create a SessionLocal class
# Each instance of the SessionLocal class will be a database session.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 4. Create a Base class
# We will inherit from this class to create each of the database models.
Base = declarative_base()

def get_db():
    try:
        db = SessionLocal()
        yield db
    except:
        print("Failed to create connection to database")