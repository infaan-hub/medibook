"""Patient profile API (§24 patients)."""

from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from accounts.permissions import IsPatient
from common.responses import success_response
from patients.models import Patient
from patients.serializers import PatientSerializer


class PatientProfileView(APIView):
    """GET/PATCH /api/patients/profile/ — own patient profile."""

    permission_classes = (IsAuthenticated, IsPatient)

    def _get_profile(self, user) -> Patient:
        profile, _ = Patient.objects.get_or_create(user=user)
        return profile

    def get(self, request):
        return success_response(
            data=PatientSerializer(self._get_profile(request.user)).data
        )

    def patch(self, request):
        serializer = PatientSerializer(
            self._get_profile(request.user), data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(
            data=serializer.data, message="Patient profile updated."
        )

    def put(self, request):
        return self.patch(request)

