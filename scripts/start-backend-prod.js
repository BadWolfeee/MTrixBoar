const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

function resolvePython() {
  const isWin = process.platform === "win32";
  const posixPython = path.join(".venv", "bin", "python");
  const winPython = path.join(".venv", "Scripts", "python.exe");
  if (isWin && fs.existsSync(winPython)) return winPython;
  if (!isWin && fs.existsSync(posixPython)) return posixPython;
  return isWin ? "py" : "python3";
}

const python = resolvePython();
const isWin = process.platform === "win32";
const port = process.env.BACKEND_PORT || process.env.PORT || "5000";

// Prefer Waitress on Windows, Gunicorn on POSIX
const args = isWin
  ? ["-m", "waitress", "--host=0.0.0.0", `--port=${port}`, "main:app"]
  : ["-m", "gunicorn", "-b", `0.0.0.0:${port}`, "main:app"];

const child = spawn(python, args, { stdio: "inherit", env: process.env });
child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error("Failed to start production server:", err?.message || err);
  console.error(
    isWin
      ? "Install with: .\\.venv\\Scripts\\pip install waitress"
      : "Install with: ./.venv/bin/pip install gunicorn"
  );
  process.exit(1);
});

