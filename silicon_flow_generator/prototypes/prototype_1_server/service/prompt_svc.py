import logging
from langfuse import Langfuse
from typing import Any, Optional
from config.env_settings import AppSettings

class PromptService:
    def __init__(self):
        """
        Initializes the Langfuse client using AppSettings.
        """
        # Initialize your settings
        settings = AppSettings()
        
        # Initialize Langfuse with your specific config keys
        self.langfuse = Langfuse(
            public_key=settings.LANGFUSE_PUBLIC_KEY,
            secret_key=settings.LANGFUSE_SECRET_KEY,
            host=settings.LANGFUSE_BASE_URL
        )
        
        self.logger = logging.getLogger("prompt_service")

    def get_prompt(self, prompt_name: str, variables: dict[str, Any] = {}, fallback: Optional[str] = None) -> str:
        """
        Fetches a prompt from Langfuse, injects variables, and returns the string.
        """
        try:
            # cache_ttl=600 (10 minutes) ensures your microservice is fast 
            # and doesn't hit Langfuse API limits on every request.
            prompt_client = self.langfuse.get_prompt(prompt_name)
            
            # compile() swaps out {{variable_name}} with values from your dict
            return prompt_client.compile(**variables)
            
        except Exception as e:
            self.logger.error(f"Langfuse Error for '{prompt_name}': {e}")
            
            # If Langfuse is down, we use the fallback string and manual replacement
            if fallback:
                self.logger.warning(f"Using fallback for prompt: {prompt_name}")
                return self._manual_compile(fallback, variables)
            
            raise e

    def _manual_compile(self, template: str, variables: dict[str, Any]) -> str:
        """
        Simple fallback logic to replace {{key}} if the external service fails.
        """
        for key, value in variables.items():
            template = template.replace(f"{{{{{key}}}}}", str(value))
        return template
