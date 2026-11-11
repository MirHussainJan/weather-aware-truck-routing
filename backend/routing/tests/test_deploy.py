"""Deployment config stays consistent with the backend's pinned dependencies."""

from pathlib import Path

REPO = Path(__file__).resolve().parents[3]


def pins(path: Path) -> dict[str, str]:
    out = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if line and "==" in line:
            name, version = line.split("==", 1)
            out[name.split("[", 1)[0].lower()] = version
    return out


def test_vercel_requirements_match_backend_pins():
    vercel, backend = pins(REPO / "requirements.txt"), pins(REPO / "backend" / "requirements.txt")
    assert vercel, "requirements.txt for the Vercel function is empty"
    for name, version in vercel.items():
        assert backend.get(name) == version, f"{name}=={version} differs from backend/requirements.txt"
    assert {"django", "djangorestframework", "requests"} <= vercel.keys()
