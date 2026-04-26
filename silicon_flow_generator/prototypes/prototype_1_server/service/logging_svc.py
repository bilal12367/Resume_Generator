import logging
import logging_loki
import json
import time
from typing import Literal, Any
from config.env_settings import AppSettings
from uuid import uuid4 as uid
class LoggerService:
    def __init__(
        self, 
        id: str = str(uid()),
        app_name: str = 'resume_service', 
        name: str = "", 
        mode: Literal['text', 'json'] = 'json', 
        **extra_tags
    ):
        # 1. Merge core tags with any extra tags you pass during initialization
        tags = {
            "workflow_id": id,
            "application": app_name,
            "mode": mode,
            "name": name,
            **extra_tags 
        }

        # 2. Get the logger instance (named by app_name to avoid cross-talk)
        self.logger = logging.getLogger(app_name)
        self.logger.setLevel(logging.INFO)

        # 3. Check for existing handlers to prevent duplicate log entries
        if not self.logger.handlers:
            # Pulling directly from your AppSettings
            handler = logging_loki.LokiHandler(
                url=AppSettings().loki_url, 
                tags=tags,
                version="1",
            )
            self.logger.addHandler(handler)
            
            # Also log to terminal for local dev visibility
            console_handler = logging.StreamHandler()
            self.logger.addHandler(console_handler)

    def log(self, message: str | dict[str, Any], level: int = logging.INFO):
        """
        Main logging method. 
        Strings are sent as-is; dicts are stringified for Loki's JSON parser.
        """
        if isinstance(message, dict):
            # Stringify so the | json parser in Grafana can unpack it
            log_content = json.dumps(message)
        else:
            log_content = str(message)
            
        # Changed from .debug to .log so messages aren't filtered out by default
        self.logger.log(level, log_content)