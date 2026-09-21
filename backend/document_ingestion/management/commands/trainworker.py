from django.core.management.base import BaseCommand

from document_ingestion.ingestion.automation import worker_loop


class Command(BaseCommand):
    help = "Run the document ingestion worker: claims and trains documents."

    def add_arguments(self, parser):
        parser.add_argument(
            "--once",
            action="store_true",
            help="Process the work queue once and exit.",
        )
        parser.add_argument(
            "--poll",
            type=float,
            default=2.0,
            help="Seconds to wait between polls when idle (default: 2).",
        )

    def handle(self, *args, **options):
        worker_loop(poll_seconds=options["poll"], once=options["once"])