"""Transactional email for account confirmation and password resets.

Delivery uses whatever ``EMAIL_BACKEND`` is configured (SMTP in production,
console in local development). Every message has a plain-text part so it still
works in clients that refuse HTML.
"""

import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)


def _send(subject, text_body, html_template, context, recipient):
    message = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[recipient],
    )
    message.attach_alternative(render_to_string(html_template, context), "text/html")
    message.send(fail_silently=False)


def send_verification_code(user, code):
    minutes = settings.EMAIL_VERIFICATION_TIMEOUT_MINUTES
    name = user.first_name or ""
    text_body = (
        f"Hi{(' ' + name) if name else ''},\n\n"
        "Your Sansaaric Stay confirmation code is:\n\n"
        f"    {code}\n\n"
        f"Enter it on the signup screen to activate your account. The code "
        f"expires in {minutes} minutes and can only be used once.\n\n"
        "If you didn't create this account, you can ignore this email.\n\n"
        "— Sansaaric Stay"
    )
    _send(
        subject="Your Sansaaric Stay confirmation code",
        text_body=text_body,
        html_template="emails/verification_code.html",
        context={
            "code": code,
            "minutes": minutes,
            "name": name,
            "email": user.email,
        },
        recipient=user.email,
    )


def send_password_reset_link(user, reset_url):
    minutes = settings.PASSWORD_RESET_TIMEOUT // 60
    name = user.first_name or ""
    text_body = (
        f"Hi{(' ' + name) if name else ''},\n\n"
        "We received a request to reset the password for this account.\n\n"
        f"Choose a new password here: {reset_url}\n\n"
        f"The link expires in {minutes} minutes and can only be used once. "
        "If you didn't ask for this, you can ignore this email.\n\n"
        "— Sansaaric Stay"
    )
    _send(
        subject="Reset your Sansaaric Stay password",
        text_body=text_body,
        html_template="emails/password_reset.html",
        context={
            "reset_url": reset_url,
            "minutes": minutes,
            "name": name,
            "email": user.email,
        },
        recipient=user.email,
    )
