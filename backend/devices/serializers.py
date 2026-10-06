from rest_framework import serializers

from devices.models import Device, DeviceAssignment


class DeviceSerializer(serializers.ModelSerializer):
    current_user_name = serializers.CharField(source="current_user.name", read_only=True, default=None)
    current_user_email = serializers.CharField(source="current_user.email", read_only=True, default=None)

    class Meta:
        model = Device
        fields = [
            "id",
            "device_code",
            "name",
            "category",
            "brand",
            "model",
            "serial_number",
            "status",
            "current_user",
            "current_user_name",
            "current_user_email",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "current_user", "created_at", "updated_at"]


class AssignmentSerializer(serializers.ModelSerializer):
    device_name = serializers.CharField(source="device.name", read_only=True)
    device_code = serializers.CharField(source="device.device_code", read_only=True)
    user_name = serializers.CharField(source="user.name", read_only=True)
    user_email = serializers.CharField(source="user.email", read_only=True)
    assigned_by_name = serializers.CharField(source="assigned_by.name", read_only=True, default=None)

    class Meta:
        model = DeviceAssignment
        fields = [
            "id",
            "device",
            "device_name",
            "device_code",
            "user",
            "user_name",
            "user_email",
            "started_at",
            "ended_at",
            "assigned_by",
            "assigned_by_name",
            "notes",
        ]
        read_only_fields = ["id", "started_at", "ended_at", "assigned_by"]
