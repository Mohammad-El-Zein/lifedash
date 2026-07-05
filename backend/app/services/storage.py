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
        service = BlobServiceClient.from_connection_string(connection_string)
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
def get_storage() -> BlobStorage:
    settings = get_settings()
    return AzureBlobStorage(settings.azure_storage_connection_string, settings.storage_container)


StorageDep = Annotated[BlobStorage, Depends(get_storage)]
