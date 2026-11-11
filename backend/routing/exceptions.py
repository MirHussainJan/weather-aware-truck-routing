import logging

from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from routing.services.http import UpstreamError

logger = logging.getLogger(__name__)


def exception_handler(exc, context):
    """Uniform error envelope: {"detail": str, "errors"?: {...}}. Upstream failures map to 502/503."""
    if isinstance(exc, UpstreamError):
        logger.warning("Upstream failure: %s", exc)
        return Response({"detail": str(exc)}, status=exc.status)

    response = drf_exception_handler(exc, context)
    if response is None:
        return None
    if (isinstance(response.data, dict) and "detail" not in response.data) or isinstance(response.data, list):
        response.data = {"detail": "Invalid request.", "errors": response.data}
    return response
