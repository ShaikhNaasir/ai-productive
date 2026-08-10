"""Configuration for the AI service, loaded from environment / .env."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-opus-4-8"
    anthropic_fast_model: str = "claude-haiku-4-5-20251001"
    embedding_model: str = "voyage-3"
    voyage_api_key: str = ""
    internal_api_key: str = "dev-internal-key"
    port: int = 8000

    @property
    def anthropic_enabled(self) -> bool:
        return bool(self.anthropic_api_key)

    @property
    def embeddings_enabled(self) -> bool:
        return bool(self.voyage_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
