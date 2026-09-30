from django.contrib import admin

from .models import Room


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ("hotel", "name", "base_price", "max_guests", "total_units")
    search_fields = ("name", "hotel__name")