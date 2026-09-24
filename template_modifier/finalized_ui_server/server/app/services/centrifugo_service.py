"""
Centrifugo Service Module (`centrifugo_service.py`)

Provides a clean, class-based interface for Centrifugo real-time event broadcasting
and JWT client connection token generation for FastAPI backend services.
"""
import os
import time
import json
import logging
import requests
import jwt
from typing import Dict, Any, Optional

logger = logging.getLogger("CentrifugoService")


class CentrifugoService:
    """
    Class-based Centrifugo Client managing authentication, channel publication,
    and agent event broadcasting via Centrifugo HTTP API.
    """

    def __init__(
        self,
        hmac_secret: Optional[str] = None,
        api_url: Optional[str] = None,
        api_key: Optional[str] = None
    ):
        base_url = os.getenv("CENTRIFUGO_BASE_URL", "http://localhost:8008").rstrip("/")
        self.hmac_secret = hmac_secret or os.getenv("CENTRIFUGO_HMAC_SECRET", "a45131f8882de49f3e")
        self.api_url = api_url or os.getenv("CENTRIFUGO_API_URL", f"{base_url}/api")
        self.api_key = api_key or os.getenv("CENTRIFUGO_API_KEY", "bcb3a1a3ad19f36fd95f49")

    def generate_token(self, user_id: str = "demo_user", exp_seconds: int = 3600) -> str:
        """
        Generates a signed JWT authentication token for a client WebSocket connection.

        Args:
            user_id: Unique user identifier for token subject claim.
            exp_seconds: Token expiration time in seconds (default 1 hour).
        """
        payload = {
            "sub": user_id,
            "exp": int(time.time()) + exp_seconds
        }
        token = jwt.encode(payload, self.hmac_secret, algorithm="HS256")
        logger.info(f"[CentrifugoService] Generated connection JWT for user '{user_id}' (Expires in {exp_seconds}s)")
        return token

    def publish(self, channel: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Publishes event payload data to a specific Centrifugo channel via HTTP API.

        Args:
            channel: Target channel name (e.g. 'agent:session_123', 'chat:general').
            data: Arbitrary JSON-serializable event payload dictionary.
        """
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
        try:
            response = requests.post(self.api_url, headers=headers, json=payload, timeout=5.0)
            res_data = response.json()
            if response.status_code == 200 and not res_data.get("error"):
                logger.info(f"[CentrifugoService] Successfully published event to channel '{channel}'")
            else:
                logger.warning(f"[CentrifugoService] Failed to publish event to channel '{channel}': {res_data}")
            return res_data
        except Exception as e:
            logger.error(f"[CentrifugoService] Network/Publish exception for channel '{channel}': {e}")
            return {"error": str(e)}

    def broadcast_agent_event(self, session_id: str, event_type: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convenience wrapper method for publishing agent updates directly to session channel.

        Args:
            session_id: Active session identifier.
            event_type: Type of update ('thinking', 'answering', 'tool_calling', 'token_utilization', 'hitl_prompt', 'status_update').
            data: Payload containing delta records or status data.
        """
        channel = f"agent:{session_id}"
        event_record = {
            "timestamp": time.time(),
            "session_id": session_id,
            "event_type": event_type,
            "data": data
        }
        return self.publish(channel=channel, data=event_record)
