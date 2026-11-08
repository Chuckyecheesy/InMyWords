"""Generate messy phone-style seed photos and upload them (T4.2).

Source images are intentionally imperfect: tilted, warm-cast, busy
backgrounds. Delivery uses the frozen tile recipe in web/lib/cloudinary.ts,
so the resident grid shows matching tiles from the same public ids T2 seeds.
"""

from __future__ import annotations

import json
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SEED_DIR = ROOT / "db" / "seed"
PHOTO_DIR = SEED_DIR / "photos"
PRESET_NAME = "staff_photos"

# Colours that read as a supported-living kitchen / living room behind the subject.
ROOM = {
    "wall": (214, 198, 176),
    "floor": (120, 96, 74),
    "cabinet": (92, 68, 48),
    "window": (168, 196, 214),
    "clutter": (156, 122, 98),
}

SUBJECT = {
    "coffee": ((92, 52, 28), "cup"),
    "tea": ((196, 156, 92), "cup"),
    "bowling": ((30, 30, 34), "ball"),
    "raptors": ((206, 17, 65), "cap"),
    "park": ((46, 120, 64), "tree"),
    "music": ((40, 40, 48), "headphones"),
    "bus": ((214, 168, 32), "bus"),
    "quiet": ((120, 148, 168), "room"),
    "lisa": ((214, 176, 148), "person"),
    "help": ((196, 72, 72), "hand"),
    "yes": ((46, 140, 92), "check"),
    "no": ((168, 48, 48), "x"),
    "garden": ((58, 128, 64), "plant"),
    "sister": ((214, 176, 148), "person"),
    "groceries": ((214, 214, 214), "bag"),
    "walk": ((92, 140, 92), "path"),
    "money": ((46, 120, 72), "bills"),
    "tv": ((24, 24, 28), "screen"),
    "herbs": ((72, 140, 72), "plant"),
    "movie": ((32, 32, 40), "screen"),
    "later": ((168, 168, 176), "clock"),
    "portrait": ((214, 176, 148), "person"),
}


def seed_public_ids() -> list[str]:
    ids: list[str] = []
    for name in ("marcus.json", "dana.json"):
        data = json.loads((SEED_DIR / name).read_text(encoding="utf-8"))
        for tile in data["tiles"]:
            ids.append(tile["cloudinary_id"])
        for chapter in data["story_chapters"]:
            ids.extend(chapter["photo_ids"])
    # Choice mock extras that are not in the resident tile lists.
    ids.extend(["tiles/marcus_movie", "tiles/marcus_later", "tiles/dana_later"])
    # Preserve order, drop duplicates.
    seen: set[str] = set()
    ordered: list[str] = []
    for public_id in ids:
        if public_id not in seen:
            seen.add(public_id)
            ordered.append(public_id)
    return ordered


def demo_photo_files(root: Path | None = None) -> list[tuple[str, Path]]:
    """Saved demo JPEGs, as (public_id, path). These are what the Upload API sends."""
    base = (root or ROOT) / "web" / "public" / "demo"
    files: list[tuple[str, Path]] = []
    if not base.is_dir():
        return files
    for path in sorted(base.rglob("*.jpg")):
        public_id = path.relative_to(base).with_suffix("").as_posix()
        files.append((public_id, path))
    return files


def _subject_key(public_id: str) -> str:
    leaf = public_id.rsplit("/", 1)[-1]
    for prefix in ("marcus_", "dana_"):
        if leaf.startswith(prefix):
            leaf = leaf[len(prefix) :]
            break
    return leaf


def _draw_room(draw: ImageDraw.ImageDraw, size: int, rng: random.Random) -> None:
    draw.rectangle((0, 0, size, int(size * 0.62)), fill=ROOM["wall"])
    draw.rectangle((0, int(size * 0.62), size, size), fill=ROOM["floor"])
    draw.rectangle((0, int(size * 0.18), int(size * 0.34), int(size * 0.62)), fill=ROOM["cabinet"])
    draw.rectangle(
        (int(size * 0.62), int(size * 0.08), int(size * 0.94), int(size * 0.36)),
        fill=ROOM["window"],
    )
    for _ in range(7):
        x = rng.randint(0, size - 40)
        y = rng.randint(int(size * 0.55), size - 30)
        draw.ellipse((x, y, x + rng.randint(18, 48), y + rng.randint(12, 28)), fill=ROOM["clutter"])


def _draw_subject(draw: ImageDraw.ImageDraw, size: int, key: str, rng: random.Random) -> None:
    colour, kind = SUBJECT.get(key, ((80, 80, 90), "cup"))
    cx = int(size * (0.42 + rng.uniform(-0.05, 0.08)))
    cy = int(size * (0.48 + rng.uniform(-0.04, 0.06)))
    r = int(size * (0.18 + rng.uniform(-0.02, 0.03)))

    if kind in {"cup", "ball"}:
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=colour)
        if kind == "cup":
            draw.rectangle((cx + r - 8, cy - r // 3, cx + r + 22, cy + r // 3), outline=colour, width=10)
    elif kind == "person":
        draw.ellipse((cx - r // 2, cy - r, cx + r // 2, cy - r // 4), fill=colour)
        draw.ellipse((cx - r, cy - r // 5, cx + r, cy + r), fill=(72, 92, 128))
    elif kind == "plant":
        draw.rectangle((cx - r // 3, cy, cx + r // 3, cy + r), fill=(120, 84, 52))
        draw.ellipse((cx - r, cy - r, cx + r, cy + r // 3), fill=colour)
    elif kind == "bus":
        draw.rounded_rectangle((cx - r, cy - r // 2, cx + r, cy + r // 2), radius=18, fill=colour)
        draw.ellipse((cx - r // 2, cy + r // 3, cx - r // 6, cy + r // 2 + 10), fill=(30, 30, 30))
        draw.ellipse((cx + r // 6, cy + r // 3, cx + r // 2, cy + r // 2 + 10), fill=(30, 30, 30))
    elif kind == "screen":
        draw.rounded_rectangle((cx - r, cy - int(r * 0.7), cx + r, cy + int(r * 0.7)), radius=12, fill=colour)
        draw.rectangle((cx - r + 16, cy - int(r * 0.5), cx + r - 16, cy + int(r * 0.45)), fill=(90, 140, 180))
    elif kind == "check":
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=colour)
        draw.line((cx - r // 2, cy, cx - r // 8, cy + r // 2), fill=(255, 255, 255), width=16)
        draw.line((cx - r // 8, cy + r // 2, cx + r // 2, cy - r // 3), fill=(255, 255, 255), width=16)
    elif kind == "x":
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=colour)
        draw.line((cx - r // 2, cy - r // 2, cx + r // 2, cy + r // 2), fill=(255, 255, 255), width=16)
        draw.line((cx + r // 2, cy - r // 2, cx - r // 2, cy + r // 2), fill=(255, 255, 255), width=16)
    elif kind == "hand":
        draw.ellipse((cx - r, cy - r // 2, cx + r, cy + r), fill=colour)
    elif kind == "cap":
        draw.ellipse((cx - r, cy - r // 3, cx + r, cy + r // 2), fill=colour)
        draw.chord((cx - r, cy - r, cx + r, cy), start=200, end=340, fill=colour)
    elif kind == "headphones":
        draw.arc((cx - r, cy - r, cx + r, cy + r), start=200, end=340, fill=colour, width=18)
        draw.ellipse((cx - r - 8, cy - r // 4, cx - r + 28, cy + r // 2), fill=colour)
        draw.ellipse((cx + r - 28, cy - r // 4, cx + r + 8, cy + r // 2), fill=colour)
    elif kind == "tree":
        draw.rectangle((cx - 12, cy, cx + 12, cy + r), fill=(96, 68, 40))
        draw.ellipse((cx - r, cy - r, cx + r, cy + r // 4), fill=colour)
    elif kind == "path":
        draw.polygon(
            [(cx - r, cy + r // 2), (cx + r, cy + r // 2), (cx + r // 2, cy - r), (cx - r // 2, cy - r)],
            fill=colour,
        )
    elif kind == "bag":
        draw.rounded_rectangle((cx - r // 2, cy - r // 3, cx + r // 2, cy + r), radius=10, fill=colour)
        draw.arc((cx - r // 3, cy - r // 2, cx + r // 3, cy), start=200, end=340, fill=(80, 80, 80), width=8)
    elif kind == "bills":
        draw.rectangle((cx - r, cy - r // 2, cx + r, cy + r // 2), fill=colour)
        draw.rectangle((cx - r + 10, cy - r // 3, cx + r - 10, cy + r // 3), fill=(210, 230, 210))
    elif kind == "clock":
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=colour)
        draw.line((cx, cy, cx, cy - r // 2), fill=(40, 40, 40), width=8)
        draw.line((cx, cy, cx + r // 3, cy), fill=(40, 40, 40), width=8)
    else:
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=colour)


def make_messy_photo(public_id: str, dest: Path | None = None) -> Path:
    """Write a tilted, warm, cluttered JPEG for one seed public id."""
    PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    path = dest or (PHOTO_DIR / f"{public_id.replace('/', '__')}.jpg")
    rng = random.Random(public_id)
    size = 960
    image = Image.new("RGB", (size, size), ROOM["wall"])
    draw = ImageDraw.Draw(image)
    _draw_room(draw, size, rng)
    _draw_subject(draw, size, _subject_key(public_id), rng)

    # Phone-photo mess: warm cast, soft blur, slight rotate, uneven crop.
    image = ImageEnhance.Color(image).enhance(1.15)
    image = ImageEnhance.Contrast(image).enhance(0.92)
    image = image.filter(ImageFilter.GaussianBlur(radius=0.8))
    angle = rng.uniform(-7.5, 7.5)
    image = image.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True, fillcolor=ROOM["wall"])
    # Re-crop to a messy phone frame that still keeps the subject.
    w, h = image.size
    left = int(w * 0.06)
    top = int(h * 0.08)
    image = image.crop((left, top, left + int(w * 0.82), top + int(h * 0.78)))
    image = image.resize((1100, 820), Image.Resampling.LANCZOS)
    image.save(path, format="JPEG", quality=78, optimize=True)
    return path


def generate_all_messy_photos() -> list[Path]:
    return [make_messy_photo(public_id) for public_id in seed_public_ids()]


def cloud_name_candidates(env: dict[str, str]) -> list[str]:
    """Names worth trying. The saved value may be a display name, not the cloud id."""
    raw = env.get("CLOUDINARY_CLOUD_NAME", "").strip()
    names: list[str] = []
    for name in (raw, raw.lower(), "inmywords"):
        if name and name not in names:
            names.append(name)
    return names


def cloud_accepts_key(cloud: str, key: str, secret: str) -> bool:
    """True when this cloud name accepts the API key. Does not print either secret."""
    import base64
    import urllib.error
    import urllib.request

    token = base64.b64encode(f"{key}:{secret}".encode()).decode()
    request = urllib.request.Request(
        f"https://api.cloudinary.com/v1_1/{cloud}/usage",
        headers={"Authorization": f"Basic {token}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            response.read(32)
            return response.status == 200
    except urllib.error.HTTPError:
        return False
    except Exception:
        return False


def resolve_cloud_name(env: dict[str, str]) -> str:
    key = env.get("CLOUDINARY_API_KEY", "").strip()
    secret = env.get("CLOUDINARY_API_SECRET", "").strip()
    names = cloud_name_candidates(env)
    if not key or not secret or not names:
        raise RuntimeError(
            "Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET."
        )
    for name in names:
        if cloud_accepts_key(name, key, secret):
            return name
    raise RuntimeError("Cloudinary did not accept cloud name: " + ", ".join(names))


def configure_cloudinary(env: dict[str, str]) -> dict[str, str]:
    import cloudinary

    cloud = resolve_cloud_name(env)
    key = env.get("CLOUDINARY_API_KEY", "").strip()
    secret = env.get("CLOUDINARY_API_SECRET", "").strip()
    cloudinary.config(cloud_name=cloud, api_key=key, api_secret=secret, secure=True)
    return {"cloud_name": cloud, "api_key": key}


def ensure_staff_upload_preset() -> str:
    import cloudinary.api
    from cloudinary.exceptions import AlreadyExists, NotFound

    try:
        cloudinary.api.upload_preset(PRESET_NAME)
        return PRESET_NAME
    except NotFound:
        pass
    try:
        cloudinary.api.create_upload_preset(
            name=PRESET_NAME,
            unsigned=True,
            folder="staff",
            allowed_formats="jpg,png,webp,heic",
            disallow_public_id=True,
        )
    except AlreadyExists:
        pass
    return PRESET_NAME


def upload_seed_photo(public_id: str, path: Path) -> str:
    import cloudinary.uploader

    result = cloudinary.uploader.upload(
        str(path),
        public_id=public_id,
        overwrite=True,
        invalidate=True,
        resource_type="image",
    )
    uploaded = result.get("public_id")
    if uploaded != public_id:
        raise RuntimeError(f"Expected public_id {public_id!r}, got {uploaded!r}")
    return uploaded


# Same chain as web/lib/cloudinary.ts, keep in lockstep.
TILE_RECIPES = {
    "calm": (
        "c_fill,g_auto,w_640,h_640/e_background_removal/"
        "c_pad,w_720,h_720,b_rgb:F7FBFA/r_48"
    ),
    "contrast": (
        "c_fill,g_auto,w_640,h_640/e_background_removal/"
        "e_contrast:50,e_sharpen:80/c_pad,w_720,h_720,b_rgb:FFFFFF/r_48"
    ),
}


def warm_tile_urls(cloud_name: str, public_ids: list[str], *, rounds: int = 8) -> int:
    """Hit every calm/contrast delivery URL until background removal finishes.

    First requests often return 423; later hits are cached. Warming here means
    the Speak For Me grid shows matching tiles on the first demo refresh.
    """
    import time
    import urllib.error
    import urllib.request

    pending = [(mode, public_id) for public_id in public_ids for mode in TILE_RECIPES]
    for _ in range(rounds):
        still: list[tuple[str, str]] = []
        for mode, public_id in pending:
            url = (
                f"https://res.cloudinary.com/{cloud_name}/image/upload/"
                f"{TILE_RECIPES[mode]}/f_auto/q_auto/{public_id}"
            )
            try:
                with urllib.request.urlopen(url, timeout=60) as response:
                    response.read(32)
                    if response.status != 200:
                        still.append((mode, public_id))
            except urllib.error.HTTPError:
                still.append((mode, public_id))
            except Exception:
                still.append((mode, public_id))
        pending = still
        if not pending:
            return 0
        time.sleep(3)
    return len(pending)


def process_seed_photos(env: dict[str, str], *, upload: bool = True) -> dict:
    """Generate messy photos, optionally upload them, ensure the unsigned preset."""
    photos = generate_all_messy_photos()
    result = {
        "photos": [str(path.relative_to(ROOT)) for path in photos],
        "public_ids": seed_public_ids(),
        "uploaded": [],
        "upload_preset": None,
        "cloud_name": None,
        "still_warming": 0,
    }
    if not upload:
        return result
    cfg = configure_cloudinary(env)
    result["cloud_name"] = cfg["cloud_name"]
    result["upload_preset"] = ensure_staff_upload_preset()
    for public_id, path in zip(result["public_ids"], photos, strict=True):
        result["uploaded"].append(upload_seed_photo(public_id, path))
    result["still_warming"] = warm_tile_urls(cfg["cloud_name"], result["uploaded"])
    return result
