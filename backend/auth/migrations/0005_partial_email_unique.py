"""Scope the email-unique index to accounts that actually have an email.

0004 indexed LOWER(email) unconditionally, but Django's auth_user.email
defaults to '' (empty string), not NULL — so the "NULLs stay allowed" note was
wrong for this schema and any two email-less accounts (e.g. a second
``createsuperuser``) collided on the empty string. Uniqueness is only meant to
apply to real addresses.
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("sansaar_auth", "0004_user_email_lower_unique"),
    ]

    operations = [
        migrations.RunSQL(
            sql=[
                "DROP INDEX IF EXISTS auth_user_email_lower_uniq",
                "CREATE UNIQUE INDEX auth_user_email_lower_uniq "
                "ON auth_user (LOWER(email)) WHERE email <> ''",
            ],
            reverse_sql=[
                "DROP INDEX IF EXISTS auth_user_email_lower_uniq",
                "CREATE UNIQUE INDEX auth_user_email_lower_uniq "
                "ON auth_user (LOWER(email))",
            ],
        ),
    ]
