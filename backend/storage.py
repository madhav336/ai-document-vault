"""S3-compatible object storage for uploaded document originals.

Works with Cloudflare R2, AWS S3, MinIO, or any S3-compatible service via the
STORAGE_* environment variables. Files are stored so users can re-open the
original document later; only the extracted text is ever sent to Gemini.
"""
import logging
import os
import uuid

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

logger = logging.getLogger("storage")

STORAGE_ENDPOINT = os.getenv("STORAGE_ENDPOINT")
STORAGE_BUCKET = os.getenv("STORAGE_BUCKET")
STORAGE_ACCESS_KEY = os.getenv("STORAGE_ACCESS_KEY")
STORAGE_SECRET_KEY = os.getenv("STORAGE_SECRET_KEY")
STORAGE_REGION = os.getenv("STORAGE_REGION", "auto")

_PRESIGN_TTL = 300  # seconds — download links are short-lived


class StorageError(Exception):
    """Raised when object storage is unavailable or an operation fails."""


def is_configured() -> bool:
    return all([STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY])


_client = None


def _get_client():
    global _client
    if not is_configured():
        raise StorageError(
            "Object storage is not configured. Set STORAGE_ENDPOINT, STORAGE_BUCKET, "
            "STORAGE_ACCESS_KEY, and STORAGE_SECRET_KEY to enable document uploads."
        )
    if _client is None:
        _client = boto3.client(
            "s3",
            endpoint_url=STORAGE_ENDPOINT,
            aws_access_key_id=STORAGE_ACCESS_KEY,
            aws_secret_access_key=STORAGE_SECRET_KEY,
            region_name=STORAGE_REGION,
            config=Config(signature_version="s3v4"),
        )
    return _client


def build_key(user_id: str, file_name: str) -> str:
    """Namespaced, collision-proof object key. Keeps a per-user prefix and a
    random component so two uploads with the same name never clash."""
    safe_name = os.path.basename(file_name or "file").replace("/", "_")
    return f"{user_id}/{uuid.uuid4().hex}/{safe_name}"


def put_object(key: str, data: bytes, content_type: str | None = None) -> None:
    try:
        client = _get_client()
        client.put_object(
            Bucket=STORAGE_BUCKET,
            Key=key,
            Body=data,
            ContentType=content_type or "application/octet-stream",
        )
    except (BotoCoreError, ClientError) as e:
        logger.error(f"Failed to upload object {key}: {e}", exc_info=True)
        raise StorageError("Failed to store the uploaded file.") from e


def get_object(key: str) -> bytes:
    try:
        client = _get_client()
        resp = client.get_object(Bucket=STORAGE_BUCKET, Key=key)
        return resp["Body"].read()
    except (BotoCoreError, ClientError) as e:
        logger.error(f"Failed to read object {key}: {e}", exc_info=True)
        raise StorageError("Failed to read the stored file.") from e


def presigned_get_url(key: str, download_name: str | None = None) -> str:
    try:
        client = _get_client()
        params = {"Bucket": STORAGE_BUCKET, "Key": key}
        if download_name:
            params["ResponseContentDisposition"] = f'inline; filename="{download_name}"'
        return client.generate_presigned_url("get_object", Params=params, ExpiresIn=_PRESIGN_TTL)
    except (BotoCoreError, ClientError) as e:
        logger.error(f"Failed to presign object {key}: {e}", exc_info=True)
        raise StorageError("Failed to generate a download link.") from e


def delete_object(key: str) -> None:
    """Best-effort delete — logs and swallows errors so a storage hiccup never
    blocks the user's DB delete."""
    try:
        client = _get_client()
        client.delete_object(Bucket=STORAGE_BUCKET, Key=key)
    except (BotoCoreError, ClientError, StorageError) as e:
        logger.warning(f"Best-effort delete failed for object {key}: {e}")
