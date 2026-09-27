from django.contrib import admin

from .models import Hotel, Location


@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = ("name", "country", "region")
    search_fields = ("name", "country")


@admin.register(Hotel)
class HotelAdmin(admin.ModelAdmin):
    list_display = ("name", "property_type", "status", "owner", "avg_rating", "created_at")
    list_filter = ("status", "property_type")
    search_fields = ("name",)
