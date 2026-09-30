from rest_framework import serializers


class DetailErrorSerializer(serializers.Serializer):
    detail = serializers.CharField()
