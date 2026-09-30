import os

class Settings:
    PROJECT_NAME: str = "Finalized Auth API"
    API_V1_STR: str = "/api"
    ENV: str = os.getenv("ENV", os.getenv("ENVIRONMENT", "dev")).lower()
    
    DB_HOST: str = os.getenv("DB_HOST", "localhost")
    DB_PORT: str = os.getenv("DB_PORT", "3306")
    DB_USER: str = os.getenv("DB_USER", "admin")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "admin")
    DB_NAME: str = os.getenv("DB_NAME", "dev")

    SECRET_KEY: str = os.getenv("SECRET_KEY", "7c3aed_super_secret_jwt_key_2026_purple")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    @property
    def SQLALCHEMY_DATABASE_URL(self) -> str:
        return f"mysql+pymysql://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    @property
    def CENTRIFUGO_BASE_URL(self) -> str:
        env_url = os.getenv("CENTRIFUGO_BASE_URL")
        if env_url:
            return env_url.rstrip("/")
        if self.DB_HOST == "mysql" or self.ENV in ["docker", "prod", "production"]:
            return "http://centrifugo:8000"
        dev_port = os.getenv("CENTRIFUGO_PORT", "8002")
        return f"http://localhost:{dev_port}"

settings = Settings()
