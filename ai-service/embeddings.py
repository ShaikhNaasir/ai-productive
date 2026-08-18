"""Embeddings for semantic search (Phase 10). Uses Voyage AI (recommended for the
Anthropic stack). Kept optional: raises EmbeddingsUnavailable when unconfigured."""
from config import get_settings
from schemas import EmbedResponse


class EmbeddingsUnavailable(RuntimeError):
    pass


_client = None


def _get_client():
    global _client
    settings = get_settings()
    if not settings.embeddings_enabled:
        raise EmbeddingsUnavailable("VOYAGE_API_KEY is not configured")
    if _client is None:
        import voyageai

        _client = voyageai.Client(api_key=settings.voyage_api_key)
    return _client


def embed(texts: list[str], input_type: str = "document") -> EmbedResponse:
    settings = get_settings()
    client = _get_client()
    # "query" vs "document" changes Voyage's asymmetric encoding; a search query
    # embedded as a document retrieves worse. Guard unknown values to "document".
    if input_type not in ("query", "document"):
        input_type = "document"
    result = client.embed(texts, model=settings.embedding_model, input_type=input_type)
    vectors = result.embeddings
    dims = len(vectors[0]) if vectors else 0
    return EmbedResponse(embeddings=vectors, model=settings.embedding_model, dimensions=dims)
