"""Central app settings with flexible DB configuration.

Rules:
- If `DATABASE_URL` is set, use it.
- Otherwise, build a URL from `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
  Password and username are safely percent-encoded.
"""

from typing import Optional

# Prefer pydantic BaseSettings if available; otherwise fall back to env vars
try:
    from pydantic import BaseSettings
    from urllib.parse import quote

    class Settings(BaseSettings):
        # Direct URL (takes precedence if provided)
        DATABASE_URL: Optional[str] = None

        # Components to build URL if DATABASE_URL is not set
        DB_HOST: str = "localhost"
        DB_PORT: int = 5432
        DB_NAME: str = "telemetria"
        DB_USER: str = "postgres"
        DB_PASSWORD: str = "admin"

        # Other app settings
        SECRET_KEY: str = "change-me"
        SENSOR_TABLE_PATTERN: str = r"^sens\d+$"
        DB_SCHEMA: str = "public"

        class Config:
            env_file = ".env"

        @property
        def effective_database_url(self) -> str:
            if self.DATABASE_URL:
                return self.DATABASE_URL
            user = quote(self.DB_USER, safe="")
            pwd = quote(self.DB_PASSWORD, safe="")
            return f"postgresql://{user}:{pwd}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    _settings = Settings()

    class _Proxy:
        # Preserve old attribute name expected by app (__init__.py)
        DATABASE_URL = _settings.effective_database_url
        SECRET_KEY = _settings.SECRET_KEY
        SENSOR_TABLE_PATTERN = _settings.SENSOR_TABLE_PATTERN
        DB_SCHEMA = _settings.DB_SCHEMA

    settings = _Proxy()

except Exception:
    import os
    from pathlib import Path
    from urllib.parse import quote

    def _load_env_file(path: str = ".env") -> None:
        p = Path(path)
        if not p.exists():
            return
        try:
            # Simple .env reader (UTF-8 with BOM tolerant)
            for raw in p.read_text(encoding="utf-8-sig").splitlines():
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" not in line:
                    continue
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                os.environ.setdefault(key, val)
        except Exception:
            # Best-effort: ignore parse errors
            pass

    # Load .env into process environment (best-effort)
    _load_env_file()

    def _effective_database_url() -> str:
        url = os.getenv("DATABASE_URL")
        if url:
            return url
        host = os.getenv("DB_HOST", "localhost")
        port = int(os.getenv("DB_PORT", "5432"))
        name = os.getenv("DB_NAME", "telemetria")
        user = os.getenv("DB_USER", "postgres")
        pwd = os.getenv("DB_PASSWORD", "admin")
        return f"postgresql://{quote(user, safe='')}:{quote(pwd, safe='')}@{host}:{port}/{name}"

    class _Fallback:
        DATABASE_URL = _effective_database_url()
        SECRET_KEY = os.getenv("SECRET_KEY", "change-me")
        SENSOR_TABLE_PATTERN = os.getenv("SENSOR_TABLE_PATTERN", r"^sens\d+$")
        DB_SCHEMA = os.getenv("DB_SCHEMA", "public")

    settings = _Fallback()
