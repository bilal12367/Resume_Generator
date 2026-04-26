import uvicorn
from fastapi import FastAPI
import socketio

from db.connection import Base, engine
from controller.workflow_controller import WorkflowController
from controller.socket_controller import sio

# 1. Initialize Database Tables
Base.metadata.create_all(bind=engine)

# 2. Initialize FastAPI Application
app = FastAPI(title="Resume Generator API", description="API and WebSocket server for Resume Generation")

# 3. Include Controllers/Routers
workflow_controller = WorkflowController()
app.include_router(workflow_controller.router)

# 4. Wrap FastAPI app with Socket.IO ASGIApp
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

if __name__ == "__main__":
    # Note: Running socket_app instead of app, allowing uvicorn to serve HTTP and WS traffic via ASGI
    uvicorn.run("main:socket_app", host="0.0.0.0", port=8000, reload=True)
