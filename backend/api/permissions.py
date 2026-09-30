from rest_framework import permissions

from auth.models import Profile


class IsStaff(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_staff)


class IsStaffOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        user = request.user
        return bool(user and user.is_authenticated and user.is_staff)


def is_hotel_owner(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.is_staff:
        return True
    profile = getattr(user, "profile", None)
    return bool(profile and profile.role == Profile.ROLE_HOTEL_OWNER)


def hotel_owner_or_staff(user, hotel) -> bool:
    if not user or not user.is_authenticated:
        return False
    return bool(user.is_staff or hotel.owner_id == user.id)


def owner_or_staff(user, obj, field="user") -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.is_staff:
        return True
    return getattr(obj, f"{field}_id") == user.id
