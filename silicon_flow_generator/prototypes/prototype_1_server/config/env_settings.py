from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class AppSettings(BaseSettings):
    # Siliconflow Config
    SILICONFLOW_API_KEY: str = ''
    SILICONFLOW_BASE_URL: str = ''

    # Database Config
    DATABASE_NAME: str =  ''
    DB_USER: str =  ''
    DB_PASSWORD: str = ''
    DB_HOST: str =  ''
    DB_PORT: str =  ''

    # Model
    MODEL_ID: str =  ''

    

    # Logging
    loki_url: str = ''

    # Prompt Langfuse
    LANGFUSE_SECRET_KEY: str = ''
    LANGFUSE_PUBLIC_KEY: str = ''
    LANGFUSE_BASE_URL: str = ''

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")



settings = AppSettings()
