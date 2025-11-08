# MTrixBoar 🐗
Dashboard for visualizing data from MT-517 devices stored in PostgreSQL (replacement for DataPortal).

## Getting Started

- Requirements
  - Node.js 18+
  - Python 3.11+ (Windows: with `py` launcher)
  - PostgreSQL available per your `.env` (see `.env.example`)

- Configure
  - Copy `.env.example` to `.env` and adjust database settings.
  - Optional: set backend port, e.g. `BACKEND_PORT=5000`.

- Install
  - `npm install`
  - `npm --prefix frontend install`

- Run (development)
  - `npm run dev:all`
  - Notes: The backend launcher auto-creates `.venv` and installs Python deps on first run.

- Run (production backend only)
  - Windows (Waitress): `npm run start:back` (requires `waitress` inside venv)
  - Linux/macOS (Gunicorn): `npm run start:back` (requires `gunicorn` inside venv)

- Health check
  - `http://localhost:<BACKEND_PORT or 5000>/health`

- Troubleshooting
  - If you see `No Python at '"/usr/bin\python.exe'` recreate the venv in PowerShell (not WSL): remove `.venv/` and run `npm run dev:all`.
  - If pip complains about wheels, ensure Python 3.11 and recent pip are installed.


