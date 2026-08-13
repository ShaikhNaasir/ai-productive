"""Configuration for the AI service, loaded from environment / .env."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-opus-4-8"
    anthropic_fast_model: str = "claude-haiku-4-5-20251001"
    # Alternative LLM providers — bring any one key and generation features work.
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    # auto = pick the first configured provider (anthropic > openai > gemini).
    llm_provider: str = "auto"
    embedding_model: str = "voyage-3"
    voyage_api_key: str = ""
    internal_api_key: str = "dev-internal-key"
    port: int = 8000

    @property
    def anthropic_enabled(self) -> bool:
        return bool(self.anthropic_api_key)

    @property
    def openai_enabled(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def gemini_enabled(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def any_llm_enabled(self) -> bool:
        return self.active_provider is not None

    @property
    def active_provider(self) -> "str | None":
        """The LLM provider to use, or None if no key is configured.

        Honors an explicit LLM_PROVIDER when that provider has a key; otherwise
        falls back to the first configured provider in priority order.
        """
        enabled = {
            "anthropic": self.anthropic_enabled,
            "openai": self.openai_enabled,
            "gemini": self.gemini_enabled,
        }
        choice = (self.llm_provider or "auto").lower()
        if choice in enabled and enabled[choice]:
            return choice
        for provider in ("anthropic", "openai", "gemini"):
            if enabled[provider]:
                return provider
        return None

    @property
    def embeddings_enabled(self) -> bool:
        return bool(self.voyage_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
