#!/usr/bin/env python3
"""Run the portable Node.js regression suites on macOS, Windows or Linux."""
from pathlib import Path
import os
import subprocess
import sys

source = Path(__file__).resolve().parent
subprocess.run([sys.executable, str(source / "Tests/RepositoryTests.py")], check=True)
subprocess.run([sys.executable, str(source / "build-web.py")], check=True)
for name in ("DocumentValues", "Refinement", "AuthFlow", "MemoryFlow", "RecordFlow", "RecordPreview",
             "Layout", "Experience", "Shortcut", "Web"):
    command = ["node", str(source / "Tests" / (name + "Tests.cjs"))]
    if name == "Web" and len(sys.argv) > 1:
        fixture = Path(sys.argv[1]).resolve()
        fixture.parent.mkdir(parents=True, exist_ok=True)
        command.append(str(fixture))
    subprocess.run(command, check=True, env={**os.environ, "NODE_DISABLE_COLORS": "1"})
subprocess.run(["node", "--check", str(source / "Web/app.js")], check=True)
