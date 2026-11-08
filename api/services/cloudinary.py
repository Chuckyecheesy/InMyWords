"""Unsigned Cloudinary upload (T4.2).

The browser may receive the cloud name and the upload preset. It must never
receive the API key or API secret. What we store is a public id.
"""

from collections.abc import Mapping
import re

class CloudinaryConfigError(Exception):
    pass


class PublicIdError(Exception):
    pass


_PUBLIC_ID = re.compile(r"^[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*$")


def unsigned_upload_params(env: Mapping[str, str]) -> dict[str, str]:
    cloud = env.get("CLOUDINARY_CLOUD_NAME", "").strip().lower()
    preset = env.get("CLOUDINARY_UPLOAD_PRESET", "").strip()
    missing = [
        name
        for name, value in (
            ("CLOUDINARY_CLOUD_NAME", cloud),
            ("CLOUDINARY_UPLOAD_PRESET", preset),
        )
        if not value
    ]
    if missing:
        raise CloudinaryConfigError(
            "Unsigned upload needs " + " and ".join(missing) + "."
        )
    return {"cloud_name": cloud, "upload_preset": preset}


def normalize_public_id(public_id: str) -> str:
    if not isinstance(public_id, str):
        raise PublicIdError("Public id must be text.")
    cleaned = public_id.strip().strip("/")
    if not cleaned or _PUBLIC_ID.fullmatch(cleaned) is None:
        raise PublicIdError("Public id must be a Cloudinary id, not a URL or a path.")
    return cleaned


def photo_record(*, resident_id: str, public_id: str, label: str | None = None) -> dict:
    resident = resident_id.strip()
    if not resident:
        raise PublicIdError("A photo needs a resident.")
    cleaned_label = label.strip() if isinstance(label, str) else ""
    return {
        "resident_id": resident,
        "cloudinary_id": normalize_public_id(public_id),
        "label": cleaned_label or None,
    }


def save_photo_record(record: dict, store: list) -> dict:
    store.append(record)
    return record
