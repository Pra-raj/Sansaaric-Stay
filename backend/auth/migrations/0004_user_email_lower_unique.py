"""Enforce that no two accounts share the same email (case-insensitively).

Django's default auth_user.email has no uniqueness constraint, so the API's
pre-check + get_or_create can be raced into duplicate accounts sharing an
email. This uses a Postgres functional unique index on LOWER(email) so the
database is the source of truth (NULLs stay allowed).
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("sansaar_auth", "0003_alter_profile_id"),
        ("auth", "0012_alter_user_first_name_max_length"),
    ]

    operations = [
        migrations.RunSQL(
            sql="CREATE UNIQUE INDEX auth_user_email_lower_uniq ON auth_user (LOWER(email))",
            reverse_sql="DROP INDEX IF EXISTS auth_user_email_lower_uniq",
        ),
    ]