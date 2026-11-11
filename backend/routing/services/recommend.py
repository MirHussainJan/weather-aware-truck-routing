"""Route ranking.

Order of preference (lexicographic, with small tolerances so that negligible differences — e.g.
0.3 Severe miles — do not outweigh hours of extra driving):

  0. Fewest No-Travel miles (a route through No-Travel conditions is never preferred)
  1. Fewest Severe miles
  2. Fewest High miles
  3. Lowest distance-weighted average risk
  4. Shortest travel time
"""

from dataclasses import dataclass, field
from functools import cmp_to_key

from .risk import Level


@dataclass(slots=True)
class RouteStats:
    route_id: str
    duration_s: float
    miles_by_level: list[float] = field(default_factory=lambda: [0.0] * len(Level))
    unknown_mi: float = 0.0
    _weighted: float = 0.0

    def add(self, level: Level | None, miles: float) -> None:
        if level is None:
            self.unknown_mi += miles
            return
        self.miles_by_level[level] += miles
        self._weighted += int(level) * miles

    @property
    def known_mi(self) -> float:
        return sum(self.miles_by_level)

    @property
    def avg_risk(self) -> float:
        return self._weighted / self.known_mi if self.known_mi else 0.0

    @property
    def no_travel_mi(self) -> float:
        return self.miles_by_level[Level.NO_TRAVEL]

    @property
    def severe_mi(self) -> float:
        return self.miles_by_level[Level.SEVERE]

    @property
    def high_mi(self) -> float:
        return self.miles_by_level[Level.HIGH]

    @property
    def max_level(self) -> Level | None:
        for lvl in reversed(Level):
            if self.miles_by_level[lvl] > 0:
                return lvl
        return None


# (attribute, tolerance, human label, unit)
CRITERIA: tuple[tuple[str, float, str, str], ...] = (
    ("no_travel_mi", 1.0, "No-Travel", "mi"),
    ("severe_mi", 1.0, "Severe", "mi"),
    ("high_mi", 1.0, "High", "mi"),
    ("avg_risk", 0.05, "average risk", ""),
)


def deciding_criterion(a: RouteStats, b: RouteStats) -> tuple[str, float, str, str] | None:
    for crit in CRITERIA:
        attr, tol = crit[0], crit[1]
        if abs(getattr(a, attr) - getattr(b, attr)) > tol:
            return crit
    return None


def compare(a: RouteStats, b: RouteStats) -> int:
    crit = deciding_criterion(a, b)
    if crit:
        return -1 if getattr(a, crit[0]) < getattr(b, crit[0]) else 1
    return (a.duration_s > b.duration_s) - (a.duration_s < b.duration_s)


def rank(stats: list[RouteStats]) -> list[RouteStats]:
    return sorted(stats, key=cmp_to_key(compare))


def _fmt_duration(seconds: float) -> str:
    minutes = round(abs(seconds) / 60)
    return f"{minutes // 60}h {minutes % 60:02d}m" if minutes >= 60 else f"{minutes} min"


def explain(best: RouteStats, other: RouteStats) -> str:
    """One sentence on why `best` beats `other`."""
    dt = other.duration_s - best.duration_s
    time_note = (
        f"{_fmt_duration(dt)} faster"
        if dt > 60
        else f"{_fmt_duration(-dt)} slower"
        if dt < -60
        else "same time"
    )
    crit = deciding_criterion(best, other)
    if crit is None:
        return f"vs Route {other.route_id}: equivalent weather risk, {time_note}."
    attr, _, label, unit = crit
    mine, theirs = getattr(best, attr), getattr(other, attr)
    if unit == "mi":
        return f"vs Route {other.route_id}: {mine:.0f} vs {theirs:.0f} {label} miles ({time_note})."
    return f"vs Route {other.route_id}: {label} {mine:.2f} vs {theirs:.2f} ({time_note})."
