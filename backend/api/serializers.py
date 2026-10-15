from rest_framework import serializers


class DetailErrorSerializer(serializers.Serializer):
    detail = serializers.CharField()


class ActivityEntrySerializer(serializers.Serializer):
    id = serializers.CharField()
    at = serializers.CharField()
    actor = serializers.CharField()
    actorEmail = serializers.CharField()
    category = serializers.CharField()
    action = serializers.CharField()
    target = serializers.CharField()
    level = serializers.CharField()
