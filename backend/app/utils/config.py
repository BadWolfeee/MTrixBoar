# app/utils/config.py
from pydantic import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str = "change-me"
    class Config:
        env_file = ".env"

settings = Settings()
