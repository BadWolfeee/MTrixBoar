const { spawn, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

function resolvePython() {
  const win = process.platform === "win32";
  const posixPython = path.join(".venv", "bin", "python");
  const windowsPython = path.join(".venv", "Scripts", "python.exe");

  if (win) {
    if (fs.existsSync(windowsPython)) return windowsPython;
    // Use the py launcher if available
    return "py";
  }
  if (fs.existsSync(posixPython)) return posixPython;
  return "python3"; // fallback for POSIX
}

function checkFlask(python) {
  const r = spawnSync(python, ["-c", "import flask"], { stdio: "ignore" });
  return r.status === 0;
}

function ensureVenv() {
  const isWin = process.platform === "win32";
  const venvDir = path.join(process.cwd(), ".venv");
  // Prefer Python 3.11 explicitly, then fall back
  const pyCandidates = isWin
    ? ["py", "python"]
    : ["python3.11", "python3", "python"];
  const exists = fs.existsSync(venvDir);
  if (exists) return true;
  console.log("No .venv found; creating a new virtual environment...");
  let created = false;
  for (const py of pyCandidates) {
    const args = isWin ? ["-3.11", "-m", "venv", ".venv"] : ["-m", "venv", ".venv"];
    const r = spawnSync(py, args, { stdio: "inherit" });
    if (r.status === 0) { created = true; break; }
    if (isWin && args[0] === "-3.11") {
      // Retry with generic -3 if -3.11 failed
      const r2 = spawnSync(py, ["-3", "-m", "venv", ".venv"], { stdio: "inherit" });
      if (r2.status === 0) { created = true; break; }
    }
  }
  if (!created) {
    console.error("Failed to create virtual environment. Ensure Python 3.11+ is installed.");
    return false;
  }
  return true;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(Object.assign(new Error(`${cmd} exited with ${code}`), { code }));
    });
    child.on("error", reject);
  });
}

(async () => {
  // Ensure we have a venv to work with
  ensureVenv();
  const python = resolvePython();

  if (!checkFlask(python)) {
    console.log("Flask not found in venv; installing backend requirements...");
    try {
      // Ensure pip exists and is recent enough
      await run(python, ["-m", "pip", "install", "-U", "pip", "setuptools", "wheel"]);
    } catch (e) {
      console.warn("pip upgrade failed (continuing):", e.message || e);
    }
    try {
      await run(python, ["-m", "pip", "install", "-r", path.join("backend", "requirements.txt")]);
    } catch (e) {
      console.error("Failed to install backend requirements.");
      console.error(e.message || e);
      if (process.platform === "win32") {
        console.error(
          "If this persists, recreate venv: py -3 -m venv .venv && .\\.venv\\Scripts\\pip install -r backend\\requirements.txt"
        );
      } else {
        console.error(
          "If this persists, recreate venv: python3 -m venv .venv && ./.venv/bin/pip install -r backend/requirements.txt"
        );
      }
      process.exit(1);
    }
  }

  const child = spawn(python, ["main.py"], {
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code) => process.exit(code ?? 0));
  child.on("error", (err) => {
    console.error("Failed to start backend using:", python);
    console.error(err?.message || err);
    process.exit(1);
  });
})();
