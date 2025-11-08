import os
from backend.app import create_app

app = create_app()

if __name__ == "__main__":
    # Configurable port via env; defaults to 5000
    port = int(os.getenv("BACKEND_PORT") or os.getenv("PORT") or 5000)
    app.run(debug=True, host="0.0.0.0", port=port)
