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

    # Ensure default demo user exists for seamless app login
    from app.db.connection import SessionLocal
    from app.repositories.user_repository import user_repository
    from app.schemas.user_schema import UserRegisterRequest
    with SessionLocal() as db_session:
        try:
            candidate = user_repository.get_by_email(db_session, "candidate@example.com")
            if not candidate:
                user_repository.create(db_session, UserRegisterRequest(
                    name="Demo Candidate",
                    email="candidate@example.com",
                    password="password123"
                ))
            # Ensure default candidate profile exists for ATS workflows
            from app.controllers.ats_workflow_controller import get_or_create_default_profile
            get_or_create_default_profile(db_session)
        except Exception:
            pass
except Exception as e:
    print(f"Database initialization info: {e}")

# Environment mode check: Dev environment mode activates Tailscale Funnel lifespan
env_mode = os.getenv("ENV", "dev").strip().lower()
is_dev_env = env_mode in ["dev", "development"]
# is_dev_env = False
if is_dev_env:
    @asynccontextmanager
    async def tailscale_lifespan(app: FastAPI):
        # Extract Tailscale auth key and hostname
        ts_authkey = os.getenv("TS_AUTHKEY", "tskey-auth-kzCxGzhg3521CNTRL-Mzf8bpXJDcJ4FgUdmyAjcJJcdTQvh3B1")
        ts_hostname = os.getenv("TS_HOSTNAME", "bilal2-job-scraper")
        port = os.getenv("PORT", "8000")
        user = os.getenv("USER", "bilal")

        print(f"[{env_mode.upper()} MODE] Initializing Tailscale Funnel for '{ts_hostname}' on port {port}...")
        cmd = (
            f"tailscale up --authkey={ts_authkey} --hostname={ts_hostname} "
            f"--operator={user} --reset "
            f"&& tailscale funnel --bg --yes {port}"
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
            print("Shutting down Tailscale Funnel...")
            if process.poll() is None:
                try:
                    os.killpg(os.getpgid(process.pid), signal.SIGTERM)
                    process.wait(timeout=3)
                except Exception:
                    try:
                        os.killpg(os.getpgid(process.pid), signal.SIGKILL)
                    except Exception:
                        pass
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

    app_lifespan = tailscale_lifespan
    print(f"Tailscale Funnel lifespan registered for Dev environment mode (Hostname: {os.getenv('TS_HOSTNAME', 'bilal1-job-scraper')}).")
else:
    app_lifespan = None
    print(f"Non-dev environment mode detected ('{env_mode}'). Tailscale Funnel lifespan is turned off and not applied.")


app = FastAPI(
    title="Finalized Auth API",
    description="Enterprise Layered FastAPI Server (Controllers, Services, Repositories, Models) connected to MySQL",
    version="2.0.0",
    lifespan=app_lifespan
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
