"""Standard pagination for all list endpoints (§28).

Wraps the DRF page into the MediBook response envelope so every list endpoint
returns the same shape:

    {
      "success": true,
      "message": "",
      "data": {
        "count": 42,
        "page": 1,
        "page_size": 20,
        "total_pages": 3,
        "next": "...",
        "previous": null,
        "results": [...]
      }
    }
"""

from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class StandardResultsSetPagination(PageNumberPagination):
    """Page-number pagination with a client-controlled, capped page size."""

    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data):
        return Response(
            {
                "success": True,
                "message": "",
                "data": {
                    "count": self.page.paginator.count,
                    "page": self.page.number,
                    "page_size": self.get_page_size(self.request),
                    "total_pages": self.page.paginator.num_pages,
                    "next": self.get_next_link(),
                    "previous": self.get_previous_link(),
                    "results": data,
                },
            }
        )
