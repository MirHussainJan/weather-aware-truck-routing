from routing.services.recommend import RouteStats, explain, rank
from routing.services.risk import Level


def make(rid, hours, **miles):
    st = RouteStats(route_id=rid, duration_s=hours * 3600)
    for name, mi in miles.items():
        st.add(Level[name.upper()], mi)
    return st


def ids(stats):
    return [s.route_id for s in rank(stats)]


def test_fewest_severe_miles_wins_over_speed():
    a = make("A", 10, low=500, severe=40)
    b = make("B", 13, low=540)
    assert ids([a, b]) == ["B", "A"]


def test_no_travel_is_worse_than_any_severe():
    a = make("A", 10, low=400, no_travel=5)
    b = make("B", 11, low=300, severe=100)
    assert ids([a, b]) == ["B", "A"]


def test_high_miles_break_severe_tie():
    a = make("A", 10, low=480, high=20)
    b = make("B", 12, low=495, high=5)
    assert ids([a, b]) == ["B", "A"]


def test_average_risk_breaks_high_tie():
    a = make("A", 10, low=300, moderate=200)
    b = make("B", 12, low=480, moderate=20)
    assert ids([a, b]) == ["B", "A"]


def test_travel_time_decides_equal_risk():
    a = make("A", 12, low=500)
    b = make("B", 10, low=520)
    assert ids([a, b]) == ["B", "A"]


def test_negligible_risk_difference_does_not_beat_time():
    a = make("A", 10, low=499.5, severe=0.5)  # half a severe mile: within tolerance
    b = make("B", 14, low=500)
    assert ids([a, b]) == ["A", "B"]


def test_unknown_miles_excluded_from_average():
    st = make("A", 1, low=50, high=50)
    st.add(None, 100)
    assert st.avg_risk == 1.0
    assert st.unknown_mi == 100
    assert st.max_level == Level.HIGH


def test_explain_mentions_deciding_criterion():
    best = make("B", 12, low=500)
    other = make("A", 10, low=460, severe=40)
    text = explain(best, other)
    assert "0 vs 40 Severe miles" in text
    assert "2h 00m slower" in text
