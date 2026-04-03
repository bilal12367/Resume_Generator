import socketio
import logging

logger = logging.getLogger('app')

sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')


@sio.event
async def connect(sid, env):
    logger.info(f"Connected Socket: {sid}")