"""Pytest configuration ensuring project and virtualenv paths are accessible."""

import sys
from pathlib import Path

# Add project root and backend dir to sys.path
backend_dir = Path(__file__).parent.resolve()
root_dir = backend_dir.parent.resolve()

if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Add .venv site-packages if present (handles `cd backend && pytest` using system pytest)
for base in [backend_dir, root_dir]:
    venv_dir = base / ".venv"
    if venv_dir.exists():
        for sp in venv_dir.glob("lib/python*/site-packages"):
            if str(sp) not in sys.path:
                sys.path.insert(0, str(sp))
