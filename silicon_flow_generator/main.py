from fastapi import FastAPI
from logger.config import setup_logging
import logging
from socket_app.events import sio
import socketio
from database.connection import Base, engine
from service.prompt_svc_test import PromptService
from database.connection import get_db

setup_logging()

Base.metadata.create_all(bind=engine)


logger = logging.getLogger('app')
obj_logger = logging.getLogger('app.objects')

app = FastAPI()
# app.include_router(router, prefix="/api")

socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

# ─── Run directly ───────────────────────────────
if __name__ == "__main__":
    import uvicorn
    # PromptService(next(get_db())).create(name="test-prompt", prompt="What is the capital of France?")
    # uvicorn.run(socket_app, host="0.0.0.0", port=8000)
    from llama_graph.resume_generator_graph import main
    import asyncio
    asyncio.run( main())
    