import socketio

# Initialize Socket.IO AsyncServer
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')

@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    print(f"Client disconnected: {sid}")

# Method 1: Using @sio.event (function name becomes the event name)
@sio.event
async def custom_event(sid, data):
    print(f"Received 'custom_event' from {sid} with data: {data}")

# Method 2: Using @sio.on() (explicitly defining the event name)
@sio.on("my_specific_event")
async def handle_specific_event(sid, data):
    print(f"Received 'my_specific_event' from {sid} with data: {data}")