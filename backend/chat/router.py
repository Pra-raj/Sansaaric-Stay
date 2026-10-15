"""Deterministic intent routing that runs before the retrieval pipeline.

Greetings, thanks, farewells, identity questions and booking requests get warm
concierge replies without burning embedding + LLM budget. Anything else falls
through to the RAG path (`RAG`). Word-boundary regexes keep false positives
low; order matters — e.g. "thanks" wins over a later "booking" in the same
message.
"""

import re

RAG = "rag"
GREETING = "greeting"
THANKS = "thanks"
FAREWELL = "farewell"
IDENTITY = "identity"
BOOKING = "booking"
OUT_OF_SCOPE = "out_of_scope"

_FAREWELL_RE = re.compile(
    r"\b(bye|goodbye|see\s?you|take\s?care|farewell|gotta go|slh)\b", re.I
)

_THANKS_RE = re.compile(r"\b(thank\s?you|thanks|thnx|tnx|dhanyabad|shukriya)\b", re.I)

_IDENTITY_RE = re.compile(
    r"(who\s+are\s+you|what\s+are\s+you|what\s+can\s+you\s+do|what\s+do\s+you\s+do|"
    r"how\s+(do\s+you|can\s+you)\s+help|are\s+you\s+(a\s+)?(bot|human|real\s+person)|"
    r"how\s+do\s+you\s+work)|^\s*help\s*$",
    re.I,
)

_BOOKING_RE = re.compile(
    r"\b(book|reserve|booking|reservation)s?\b.{0,60}\b(stay|room|night|suite|homestay|"
    r"resort|hotel|lodge|cottage|cabin|villa)\b"
    r"|\b(stay|room|night|suite|homestay|resort|hotel|lodge|cottage|cabin|villa)\b.{0,60}"
    r"\b(book|reserve|booking|reservation)s?\b"
    r"|\bavailab\w+\b.{0,60}\b(on|for|from|between)\b"
    r"|\bcheck[- ]?in\b.{0,40}\b(on|from|for)\b\s+(?:\d{1,2}|[\w]+day|tomorrow|next)\b"
    r"|\bchecking[- ]?(in|out)\b"
    r"|\bi\s+(?:want|would\s+like|'?d\s+like|need)\s+to\s+(?:book|stay)\b"
    r"|\bmake\s+(?:a\s+)?(?:booking|reservation)\b",
    re.I,
)

_OUT_OF_SCOPE_RE = re.compile(
    r"\b(flights?|airfare|airline|visa|passport|currency\s+exchange|immigration|"
    r"international\s+travel|cab\s+service)\b|"
    r"\bbook\s+(a\s+|my\s+)?flight\b",
    re.I,
)

_SMALLTALK_RE = re.compile(
    r"\b(how\s+are\s+you|how('?s| is) it going|what('?s|\s+is) up|are\s+you\s+ok|"
    r"k\s*xa|k\s*cha|ke\s*cha|sancha)\b",
    re.I,
)


def _normalize(text):
    return re.sub(r"[^\w\s]", " ", text or "").lower()


def _greeting_match(text):
    text = _normalize(text)
    first = text.split()
    if not first:
        return None
    first_word = first[0]
    plain_greeting = (
        first_word in ("hi", "hello", "hey", "namaste", "namaskar", "yo")
        and len(first) <= 4
    )
    time_greeting = " ".join(first[:2]).startswith(
        ("good morning", "good afternoon", "good evening")
    ) and len(first) <= 4
    smalltalk = _SMALLTALK_RE.search(text) and len(first) <= 8
    return plain_greeting or time_greeting or smalltalk


_INTENT_CHECKS = (
    (GREETING, _greeting_match),
    (FAREWELL, lambda t: _FAREWELL_RE.search(t)),
    (THANKS, lambda t: _THANKS_RE.search(t)),
    (IDENTITY, lambda t: _IDENTITY_RE.search(t)),
    (BOOKING, lambda t: _BOOKING_RE.search(t)),
    (OUT_OF_SCOPE, lambda t: _OUT_OF_SCOPE_RE.search(t)),
)


def classify(text):
    """Return the intent with the highest priority for `text`."""
    normalized = _normalize(text)
    if not normalized:
        return RAG
    for intent, matcher in _INTENT_CHECKS:
        if matcher(normalized):
            return intent
    return RAG


def _first_name(conversation):
    title = getattr(conversation, "title", "") or ""
    if title in ("Guest", "New chat", ""):
        return ""
    first = title.split()[0]
    return re.sub(r"[^\w]", "", first)[:40]


def concierge_reply(intent, conversation=None):
    """Return the canned concierge reply for `intent`, or None when it needs RAG."""
    if intent == RAG:
        return None
    name = _first_name(conversation)
    greeted = f" {name}" if name else ""
    if intent == GREETING:
        return (
            f"Hi{greeted}! I'm the Sansaaric Stay assistant. Ask me about our stays, "
            "rates and meal plans, or destinations across Nepal — or roughly when "
            "you'd like to travel and I'll point you to the right stay."
        )
    if intent == THANKS:
        return (
            f"You're very welcome{greeted}! Anything else you'd like to know about "
            "your stay?"
        )
    if intent == FAREWELL:
        return (
            f"Thanks for chatting{greeted}! Safe travels, and feel free to reach "
            "out whenever you need us."
        )
    if intent == IDENTITY:
        return (
            "I'm the Sansaaric Stay reservations assistant. I can help with stays "
            "and rates, meal plans, deposits, cancellations and refunds, and "
            "destinations in Nepal. To lock in a booking, our team is at "
            "+977 1 456 7890 or reservations@sansaaric.com."
        )
    if intent == BOOKING:
        return (
            f"Of course{greeted}, I can help you arrange that. A few details and "
            "I'll point you to the right stay:\n- Which property are you interested "
            "in?\n- Your check-in and check-out dates\n- How many guests\n\nYou can "
            "also reach the team directly at +977 1 456 7890 or "
            "reservations@sansaaric.com to lock in the reservation."
        )
    if intent == OUT_OF_SCOPE:
        return (
            "I can only help with hotels, homestays, and resorts in Nepal that are "
            "bookable through Sansaaric Stay. For anything else, our team can help "
            "at +977 1 456 7890 or reservations@sansaaric.com."
        )
    return None