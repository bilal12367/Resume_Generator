import time
import requests
import json
import asyncio
import jwt

import os

try:
    import websockets
except ImportError:
    websockets = None

class CentrifugoClient:
    def __init__(
        self,
        hmac_secret: str | None = None,
        api_url: str | None = None,
        api_key: str | None = None,
        ws_url: str | None = None,
    ):
        base_url = os.getenv("CENTRIFUGE_BASE_URL", "http://localhost:8002")
        self.hmac_secret = hmac_secret or os.getenv("CENTRIFUGO_SECRET_HMAC_KEY", "a45131f8882de49f3e")
        self.api_url = api_url or f"{base_url}/api"
        self.api_key = api_key or os.getenv("CENTRIFUGO_API_KEY", "bcb3a1a3ad19f36fd95f49")
        ws_base = base_url.replace("http://", "ws://").replace("https://", "wss://")
        self.ws_url = ws_url or f"{ws_base}/connection/websocket"

    def generate_token(self, user_id: str, exp_seconds: int = 3600) -> str:
        """Generate JWT token for Centrifugo client connection."""
        payload = {
            "sub": user_id,
            "exp": int(time.time()) + exp_seconds
        }
        return jwt.encode(payload, self.hmac_secret, algorithm="HS256")

    def publish(self, channel: str, data: dict) -> dict:
        """Publish a message to a channel using Centrifugo HTTP API."""
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"apikey {self.api_key}"
        }
        payload = {
            "method": "publish",
            "params": {
                "channel": channel,
                "data": data
            }
        }
        response = requests.post(self.api_url, headers=headers, data=json.dumps(payload))
        return response.json()

    async def subscribe_and_listen(self, channel: str, user_id: str = "user_demo", delay_before_publish: float = 3.0):
        """
        Subscribes to Centrifugo channel via WebSocket, publishes an event after a delay,
        and logs/returns the incoming event.
        """
        if websockets is None:
            print("Please install websockets (`pip install websockets`) to run the listener demo.")
            return

        token = self.generate_token(user_id)
        print(f"Connecting to Centrifugo WebSocket at {self.ws_url}...")

        async with websockets.connect(self.ws_url) as ws:
            # Step 1: Send Connect command
            connect_cmd = {
                "id": 1,
                "connect": {
                    "token": token
                }
            }
            await ws.send(json.dumps(connect_cmd))
            connect_res = await ws.recv()
            print(f"[Connected] Server response: {connect_res}")

            # Step 2: Send Subscribe command to channel
            sub_cmd = {
                "id": 2,
                "subscribe": {
                    "channel": channel
                }
            }
            await ws.send(json.dumps(sub_cmd))
            sub_res = await ws.recv()
            print(f"[Subscribed] Channel '{channel}' response: {sub_res}")

            # Step 3: Publish an event via HTTP API to test real-time delivery
            test_payload = {
                "message": "Hello from Centrifugo Class Pub/Sub!",
                "timestamp": time.time()
            }
            print(f"\n[Publishing] Sending message to channel '{channel}'...")
            if delay_before_publish > 0:
                print(f"WAITING FOR {delay_before_publish} Sec")
                await asyncio.sleep(delay_before_publish)
                print("WAIT FINISHED")

            pub_res = self.publish(channel, test_payload)
            print(f"Publish API response: {pub_res}")

            # Step 4: Listen for the pushed publication event
            print("\n[Listening] Waiting for incoming event...")
            while True:
                msg = await ws.recv()
                data = json.loads(msg)
                print(f"[Event Received] Raw message: {msg}")
                
                # Check if this message is a publication push frame
                if "push" in data and data["push"].get("channel") == channel:
                    pub_data = data["push"]["pub"]["data"]
                    print(f"\n✅ SUCCESSFULLY RECEIVED EVENT DATA: {pub_data}")
                    return pub_data


# if __name__ == "__main__":
#     client = CentrifugoClient()
#     asyncio.run(client.subscribe_and_listen(channel="chat"))


