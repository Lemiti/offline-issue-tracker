"""Offline Issue Tracker backend application package."""

import sys
from pathlib import Path

# Ensure .venv site-packages are accessible even when invoked with system python
backend_dir = Path(__file__).resolve().parent.parent
root_dir = backend_dir.parent

for base in [backend_dir, root_dir]:
    venv_dir = base / ".venv"
    if venv_dir.exists():
        for sp in venv_dir.glob("lib/python*/site-packages"):
            if str(sp) not in sys.path:
                sys.path.insert(0, str(sp))
