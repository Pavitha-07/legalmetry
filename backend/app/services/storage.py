from io import BytesIO
from datetime import timedelta

from minio import Minio

from app.core.config import get_settings


def storage_client() -> Minio:
    settings = get_settings()
    return Minio(
        settings.minio_endpoint,
        access_key=settings.minio_root_user,
        secret_key=settings.minio_root_password,
        secure=settings.minio_secure,
    )


def ensure_bucket() -> None:
    settings = get_settings()
    client = storage_client()
    if not client.bucket_exists(settings.minio_bucket):
        client.make_bucket(settings.minio_bucket)


def put_bytes(object_key: str, payload: bytes, content_type: str) -> None:
    settings = get_settings()
    storage_client().put_object(
        settings.minio_bucket,
        object_key,
        BytesIO(payload),
        length=len(payload),
        content_type=content_type,
    )


def get_bytes(object_key: str) -> bytes:
    settings = get_settings()
    response = storage_client().get_object(settings.minio_bucket, object_key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def presigned_download_url(object_key: str, expires_minutes: int = 10) -> str:
    settings = get_settings()
    return storage_client().presigned_get_object(
        settings.minio_bucket, object_key, expires=timedelta(minutes=expires_minutes)
    )
