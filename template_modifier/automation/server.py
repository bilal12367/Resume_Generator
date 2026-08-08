import asyncio
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import uvicorn

# Load .env from project root
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

from .llm import LLM, save_output

USER_DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'user_data')

app = FastAPI(title="Resume LLM Processor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

llm_instance = LLM()


# ── Request / Response models ──────────────────────────────────────

class ProcessRequest(BaseModel):
    job_description: str
    user_data_file: str


# ── Endpoints ──────────────────────────────────────────────────────

@app.get("/")
async def serve_index():
    """Serve the LLM processor HTML page."""
    html_path = os.path.join(os.path.dirname(__file__), '..', 'index_llm.html')
    return FileResponse(html_path, media_type="text/html")


@app.get("/api/user-data")
async def list_user_data():
    """Return list of JSON files in user_data/ directory."""
    try:
        files = [
            f for f in os.listdir(USER_DATA_DIR)
            if f.endswith('.json')
        ]
        files.sort()
        return JSONResponse(content={"files": files})
    except FileNotFoundError:
        return JSONResponse(content={"files": []})


@app.get("/api/user-data/{filename}")
async def get_user_data(filename: str):
    """Return contents of a specific user data JSON file."""
    if not filename.endswith('.json'):
        raise HTTPException(status_code=400, detail="Only .json files allowed")

    file_path = os.path.join(USER_DATA_DIR, filename)

    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    return JSONResponse(content=data)


@app.post("/api/process")
async def process_resume(req: ProcessRequest):
    """Process user data through LLM with the given job description."""
    file_path = os.path.join(USER_DATA_DIR, req.user_data_file)

    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail=f"User data file not found: {req.user_data_file}")

    with open(file_path, 'r', encoding='utf-8') as f:
        user_data = f.read()

    try:
        result_json = await llm_instance.chat_structured(
            user_data=user_data,
            job_description=req.job_description
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM processing failed: {str(e)}")

    # Save output back to user_data/ using the user's name from personal_details
    try:
        saved_path = save_output(result_json)
        saved_filename = os.path.basename(saved_path)
    except Exception:
        saved_filename = req.user_data_file

    return JSONResponse(content={
        "result": json.loads(result_json),
        "saved_as": saved_filename
    })


if __name__ == '__main__':
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8080,
    )
