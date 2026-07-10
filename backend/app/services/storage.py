"""Blob storage for uploaded files.

One code path everywhere: the Azure SDK talks to Azurite locally (the default
connection string targets the compose/emulator well-known account) and to a
real storage account in production. Tests override `get_storage` with an
in-memory fake so no emulator is needed there.
"""

from functools import lru_cache
from typing import Annotated, Protocol

from azure.core.exceptions import ResourceExistsError, ResourceNotFoundError
from azure.storage.blob import BlobServiceClient, ContentSettings
from fastapi import Depends

from app.core.config import get_settings


class BlobStorage(Protocol):
    def upload(self, name: str, data: bytes, content_type: str) -> None: ...

    def download(self, name: str) -> bytes:
        """Raise FileNotFoundError if the blob does not exist."""
        ...

    def delete(self, name: str) -> None:
        """Idempotent: deleting a missing blob is not an error."""
        ...


class AzureBlobStorage:
    def __init__(self, connection_string: str, container: str) -> None:
        # Bounded retries/timeouts: with the SDK defaults a storage outage makes
        # upload/download requests hang for minutes instead of failing fast.
        service = BlobServiceClient.from_connection_string(
            connection_string,
            retry_total=3,
            connection_timeout=5,
            read_timeout=30,
        )
        self._container = service.get_container_client(container)
        try:
            self._container.create_container()
        except ResourceExistsError:
            pass

    def upload(self, name: str, data: bytes, content_type: str) -> None:
        self._container.upload_blob(
            name, data, content_settings=ContentSettings(content_type=content_type)
        )

    def download(self, name: str) -> bytes:
        try:
            return self._container.download_blob(name).readall()
        except ResourceNotFoundError as exc:
            raise FileNotFoundError(name) from exc

    def delete(self, name: str) -> None:
        try:
            self._container.delete_blob(name)
        except ResourceNotFoundError:
            pass


@lru_cache
def _storage_for(container: str) -> BlobStorage:
    settings = get_settings()
    return AzureBlobStorage(settings.azure_storage_connection_string, container)


def get_storage() -> BlobStorage:
    return _storage_for(get_settings().storage_container)


def get_avatar_storage() -> BlobStorage:
    return _storage_for(get_settings().avatar_container)


StorageDep = Annotated[BlobStorage, Depends(get_storage)]
AvatarStorageDep = Annotated[BlobStorage, Depends(get_avatar_storage)]
