from drf_spectacular.utils import inline_serializer
from rest_framework import serializers


def paginated_response_schema(name: str, serializer_class):
    return inline_serializer(
        name=name,
        fields={
            "count": serializers.IntegerField(),
            "next": serializers.CharField(allow_null=True, required=False),
            "previous": serializers.CharField(allow_null=True, required=False),
            "results": serializer_class(many=True),
        },
    )
