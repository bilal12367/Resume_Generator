import uvicorn
from dotenv import load_dotenv, find_dotenv

# Load environment variables from .env file
load_dotenv(find_dotenv(usecwd=True))

from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.controllers.router import api_router
from app.db.connection import engine, Base
from app.models import user_model

# Automatically create database tables on startup
try:
    Base.metadata.create_all(bind=engine)
except Exception as e:
    print(f"Database initialization info: {e}")

app = FastAPI(
    title="Finalized Auth API",
    description="Enterprise Layered FastAPI Server (Controllers, Services, Repositories, Models) connected to MySQL",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")

from app.services.pdf_generator import get_project_root

# Mount output directory as static files for direct browser access/downloads
PROJECT_ROOT_DIR = get_project_root()
OUTPUT_STATIC_DIR = PROJECT_ROOT_DIR / "output"
OUTPUT_STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/output", StaticFiles(directory=str(OUTPUT_STATIC_DIR)), name="output")

@app.get("/", tags=["Root"])
def root():
    return {
        "app": "Finalized Auth API",
        "architecture": "Layered (Controllers -> Services -> Repositories -> Models)",
        "status": "online",
        "docs": "/docs"
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
