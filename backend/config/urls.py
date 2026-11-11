from django.urls import include, path, re_path

from routing.views import spa_index

urlpatterns = [
    path("api/", include("routing.urls")),
    # Everything that is not an API call or a static asset (served by WhiteNoise) is the SPA.
    re_path(r"^(?!api/|static/|assets/).*$", spa_index, name="spa"),
]
