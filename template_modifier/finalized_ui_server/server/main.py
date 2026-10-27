from app.services.centrifugo_service import CentrifugoService
import uvicorn
from dotenv import load_dotenv, find_dotenv

# Load environment variables from .env file
load_dotenv(find_dotenv(usecwd=True))

from pathlib import Path
import os
import signal
import subprocess
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.controllers.router import api_router
from app.db.connection import engine, Base
from app.models import user_model

# Automatically create database tables on startup
try:
    Base.metadata.create_all(bind=engine)
    from sqlalchemy import text
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE job_descriptions ADD COLUMN job_source VARCHAR(50) NOT NULL DEFAULT 'linkedin'"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE ats_workflow_sessions ADD COLUMN batch_id VARCHAR(255)"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE ats_workflow_sessions ADD COLUMN batch_title VARCHAR(255)"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE ats_workflow_sessions ADD COLUMN total_tokens INT DEFAULT 0"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE ats_workflow_sessions ADD COLUMN processing_time_seconds FLOAT DEFAULT 0.0"))
            conn.commit()
        except Exception:
            pass
except Exception as e:
    print(f"Database initialization info: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start tailscale and expose port 8000 via background funnel
    print("Initializing the tailscale")
    cmd = (
        "tailscale up --auth-key=tskey-client-kY64CTJxq821CNTRL-cZ5E12PT59dHYbQ9kX4U9dKsddXAvTHN "
        "--hostname=bilal1-job-scraper --advertise-tags=tag:admin-test --operator=bilal "
        "&& tailscale funnel --bg --yes 8000"
    )
    process = subprocess.Popen(
        cmd,
        shell=True,
        executable="/bin/bash",
        preexec_fn=os.setsid,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    
    try:
        yield
    finally:
        # Terminate background startup if still running
        if process.poll() is None:
            try:
                os.killpg(os.getpgid(process.pid), signal.SIGTERM)
                process.wait(timeout=3)
            except Exception:
                try:
                    os.killpg(os.getpgid(process.pid), signal.SIGKILL)
                except Exception:
                    pass
        # Down the funnel and tailscale when uvicorn server stops
        subprocess.run(
            ["tailscale", "funnel", "reset"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        subprocess.run(
            ["tailscale", "down"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )


app = FastAPI(
    title="Finalized Auth API",
    description="Enterprise Layered FastAPI Server (Controllers, Services, Repositories, Models) connected to MySQL",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.controllers.health_controller import router as health_router

app.include_router(api_router, prefix="/api")
app.include_router(health_router, tags=["Health Check"])

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
