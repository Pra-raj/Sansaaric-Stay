# Hand-written to avoid the interactive not-null default prompt from the
# autodetector: the bookings table is empty (0 rows), so room_id can simply be
# replaced by the room FK with no one-off default.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('rooms', '0001_initial'),
        ('bookings', '0001_initial'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='booking',
            name='room_id',
        ),
        migrations.AddField(
            model_name='booking',
            name='room',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='bookings', to='rooms.room'),
        ),
    ]