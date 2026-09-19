"""PHASE 8 — Seed initial specialties and hospitals for catalog display."""

from django.db import migrations


def add_specialties_and_hospitals(apps, schema_editor):
    """PHASE 8 — Seed initial specialties and hospitals for catalog display."""
    Specialty = apps.get_model("specialties", "Specialty")
    Hospital = apps.get_model("hospitals", "Hospital")

    # Create specialties if they don't exist
    specialties_data = [
        ("Cardiology", "Heart and cardiovascular system disorders.", "https://example.com/icons/cardiology.png"),
        ("Dermatology", "Skin, hair, and nail conditions.", "https://example.com/icons/dermatology.png"),
        ("Endocrinology", "Hormonal and metabolic disorders including diabetes.", "https://example.com/icons/endocrinology.png"),
        ("Gastroenterology", "Digestive system and liver diseases.", "https://example.com/icons/gastroenterology.png"),
        ("Neurology", "Brain, spinal cord, and nervous system disorders.", "https://example.com/icons/neurology.png"),
        ("Oncology", "Cancer diagnosis and treatment.", "https://example.com/icons/oncology.png"),
        ("Ophthalmology", "Eye diseases and vision care.", "https://example.com/icons/ophthalmology.png"),
        ("Orthopedics", "Bones, joints, muscles, and ligaments.", "https://example.com/icons/orthopedics.png"),
        ("Pediatrics", "Healthcare for infants, children, and adolescents.", "https://example.com/icons/pediatrics.png"),
        ("Psychiatry", "Mental health and behavioral disorders.", "https://example.com/icons/psychiatry.png"),
        ("Pulmonology", "Lung and respiratory system disorders.", "https://example.com/icons/pulmonology.png"),
        ("Rheumatology", "Autoimmune and joint inflammatory conditions.", "https://example.com/icons/rheumatology.png"),
    ]

    for name, description, icon_url in specialties_data:
        Specialty.objects.get_or_create(
            name=name,
            defaults={"description": description, "icon_url": icon_url}
        )

    # Create hospitals if they don't exist
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
        ("specialties", "0001_initial"),
        ("hospitals", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(add_specialties_and_hospitals, migrations.RunPython.noop),
    ]