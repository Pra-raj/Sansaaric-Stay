from django.contrib.auth import get_user_model
from django.db import IntegrityError

from .models import Profile


def sync_user(supabase_user):
    User = get_user_model()
    uid = str(supabase_user.id)
    email = getattr(supabase_user, "email", "") or ""
    first_name = _full_name(supabase_user)
    try:
        user, created = User.objects.get_or_create(
            username=uid,
            defaults={"email": email, "first_name": first_name},
        )
    except IntegrityError:
        # Email already belongs to a different Supabase account: adopt the
        # existing user instead of failing the request (fixes the split-brain
        # where two uids produced two accounts for one email).
        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            raise
        created = False
    if not created:
        fields = []
        if email and user.email != email:
            user.email = email
            fields.append("email")
        if first_name and user.first_name != first_name:
            user.first_name = first_name
            fields.append("first_name")
        if fields:
            user.save(update_fields=fields)
    profile, _ = Profile.objects.get_or_create(user=user, supabase_uid=uid)
    return user, profile, created


def _full_name(supabase_user):
    metadata = getattr(supabase_user, "user_metadata", None)
    if isinstance(metadata, dict):
        name = metadata.get("full_name")
        if name:
            return str(name)
    return ""