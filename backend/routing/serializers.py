from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from routing.services.geo import haversine_mi
from routing.services.planner import TripRequest

MAX_DEPARTURE_AHEAD = timedelta(days=5)  # keeps departure + 48 h heatmap inside the 7-day forecast
DEPARTURE_GRACE = timedelta(hours=1)
MAX_TRIP_STRAIGHT_MI = 3000


class PointSerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)


class PlanSerializer(serializers.Serializer):
    origin = PointSerializer()
    destination = PointSerializer()
    departure = serializers.DateTimeField()
    load_lb = serializers.IntegerField(min_value=0, max_value=100_000)
    interval_mi = serializers.ChoiceField(choices=[10, 25, 50], default=25)

    def validate_departure(self, value):
        now = timezone.now()
        if value < now - DEPARTURE_GRACE:
            raise serializers.ValidationError("Departure cannot be in the past.")
        if value > now + MAX_DEPARTURE_AHEAD:
            raise serializers.ValidationError("Departure must be within the next 5 days (forecast range).")
        return value

    def validate(self, attrs):
        o, d = attrs["origin"], attrs["destination"]
        dist = haversine_mi(o["lat"], o["lon"], d["lat"], d["lon"])
        if dist < 1:
            raise serializers.ValidationError({"destination": "Destination must differ from origin."})
        if dist > MAX_TRIP_STRAIGHT_MI:
            raise serializers.ValidationError({"destination": "Trip is too long for a single plan."})
        return attrs

    def to_trip(self) -> TripRequest:
        v = self.validated_data
        return TripRequest(
            origin=(v["origin"]["lat"], v["origin"]["lon"]),
            destination=(v["destination"]["lat"], v["destination"]["lon"]),
            departure=v["departure"],
            load_lb=v["load_lb"],
            interval_mi=int(v["interval_mi"]),
        )


class GeocodeQuerySerializer(serializers.Serializer):
    q = serializers.CharField(min_length=2, max_length=120, trim_whitespace=True)
    lat = serializers.FloatField(min_value=-90, max_value=90, required=False)
    lon = serializers.FloatField(min_value=-180, max_value=180, required=False)

    def near(self) -> tuple[float, float] | None:
        v = self.validated_data
        return (v["lat"], v["lon"]) if "lat" in v and "lon" in v else None


class ReverseQuerySerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)
