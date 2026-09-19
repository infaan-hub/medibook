"""PHASE 8 — Seed initial hospitals for catalog display."""

from django.db import migrations


def add_hospitals(apps, schema_editor):
    """PHASE 8 — Seed initial hospitals for catalog display."""
    Hospital = apps.get_model("hospitals", "Hospital")

    hospitals_data = [
        ("MediBook General Hospital", "Colombo", "123 Hospital Road, Colombo 05", "+94 11 234 5678", "info@medibook.lk", {"latitude": 6.9271, "longitude": 79.8652, "operating_hours": "08:00-20:00"}),
        ("Colombo National Hospital", "Colombo", "45 National Hospital Avenue, Colombo 01", "+94 11 269 1111", "contact@nationalhospital.gov.lk", {"latitude": 6.9285, "longitude": 79.8642, "operating_hours": "24/7"}),
        ("Kandy Teaching Hospital", "Kandy", "1 Hospital Road, Kandy 02", "+94 81 222 3333", "info@kandyhosp.lk", {"latitude": 7.2986, "longitude": 80.6354, "operating_hours": "07:00-19:00"}),
        ("Galle Regional Hospital", "Galle", "8 Hospital Street, Galle 01", "+94 91 234 5678", "admin@gallehospital.lk", {"latitude": 6.0288, "longitude": 80.2188, "operating_hours": "08:00-20:00"}),
        ("Jaffna Medical Center", "Jaffna", "22 Main Road, Jaffna 02", "+94 21 222 4444", "reception@jaffnaclinic.lk", {"latitude": 9.6613, "longitude": 80.0266, "operating_hours": "09:00-18:00"}),
    ]

    for name, city, address, phone, email, location_details in hospitals_data:
        Hospital.objects.get_or_create(
            name=name,
            city=city,
            defaults={
                "address": address,
                "phone": phone,
                "email": email,
                "location_details": location_details,
            }
        )


class Migration(migrations.Migration):

    dependencies = [
        ("hospitals", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(add_hospitals, migrations.RunPython.noop),
    ]