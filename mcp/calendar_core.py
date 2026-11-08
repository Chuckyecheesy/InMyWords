"""Planner calendar maths and .ics parsing. Plain code, never the LLM (rule 6).

Used by the profile server (routine -> visit blocks), the actions server
(Google event payloads, .zip imports, overlap checks) and the Planner agent.

- expand_routine: a resident's routine ("1:00pm, 2 hours, every day") into
  one block per chosen day of the week, in local wall time, so a visit stays
  at 1pm across a daylight-saving change.
- parse_calendar_zip: a Google Calendar export (.zip of .ics files) into
  plain events. The archive is read in memory and nothing is written to
  disk. Unsafe member paths are skipped, and oversized archives are refused.
- expand_recurrence: one event's RRULE into the occurrences the read-only
  fallback grid shows.
"""

from __future__ import annotations

import io
import re
import zipfile
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DEFAULT_TZ = "America/Toronto"
WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
_DAY_ALIASES = {name: i for i, name in enumerate(WEEKDAYS)}
_DAY_ALIASES.update({full: i for i, full in enumerate(
    ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"))})
_ICAL_DAYS = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}

MAX_ZIP_BYTES = 20 * 1024 * 1024      # uncompressed total; guards against zip bombs
MAX_ZIP_MEMBERS = 500
MAX_OCCURRENCES = 200                  # per recurring event on the grid
DEFAULT_RECURRENCE_WEEKS = 8           # an open-ended RRULE is shown this far ahead


def _zone(tz: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise ValueError(f"unknown time zone '{tz}'") from exc


def iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")


def parse_dt(value: str) -> datetime:
    """An ISO timestamp with an offset, as stored and as sent to Google."""
    dt = datetime.fromisoformat(str(value).strip())
    if dt.tzinfo is None:
        raise ValueError(f"timestamp '{value}' has no offset")
    return dt


# ---- routine -> visit blocks ----------------------------------------------------

def _parse_days(days) -> set[int]:
    if days is None:
        return set(range(7))  # spec default: 7 days a week
    picked = set()
    for d in days:
        key = str(d).strip().lower()
        if key not in _DAY_ALIASES:
            raise ValueError(f"unknown day '{d}'")
        picked.add(_DAY_ALIASES[key])
    if not picked:
        raise ValueError("pick at least one day")
    return picked


def _parse_clock(start_time: str) -> time:
    found = re.fullmatch(r"(\d{1,2}):(\d{2})", str(start_time).strip())
    if not found:
        raise ValueError(f"start time '{start_time}' must look like 13:00")
    hour, minute = int(found.group(1)), int(found.group(2))
    if hour > 23 or minute > 59:
        raise ValueError(f"start time '{start_time}' is not a real time")
    return time(hour, minute)


def expand_routine(start_date, start_time, length_min, days=None, tz=DEFAULT_TZ) -> list[dict]:
    """One week of visit blocks starting on start_date, one per chosen weekday."""
    zone = _zone(tz)
    try:
        first = date.fromisoformat(str(start_date))
    except ValueError as exc:
        raise ValueError(f"start date '{start_date}' must look like 2026-11-08") from exc
    clock = _parse_clock(start_time)
    try:
        minutes = int(length_min)
    except (TypeError, ValueError) as exc:
        raise ValueError("length must be a whole number of minutes") from exc
    if not 0 < minutes <= 24 * 60:
        raise ValueError("a visit must last between 1 minute and 24 hours")
    picked = _parse_days(days)

    blocks = []
    for offset in range(7):
        day = first + timedelta(days=offset)
        if day.weekday() not in picked:
            continue
        # Build the local wall time each day, so 1pm stays 1pm across DST.
        start = datetime.combine(day, clock, tzinfo=zone)
        # Exact duration: add in UTC, then come back to local.
        end = (start.astimezone(timezone.utc) + timedelta(minutes=minutes)).astimezone(zone)
        blocks.append({"starts_at": iso(start), "ends_at": iso(end)})
    return blocks


# ---- Google event payloads ----------------------------------------------------------

def google_event(summary, description, starts_at, ends_at, tz=DEFAULT_TZ, recurrence=None) -> dict:
    """Google Calendar's event shape. Only these fields are ever sent."""
    event = {
        "summary": summary,
        "description": description,
        "start": {"dateTime": iso(parse_dt(starts_at)), "timeZone": tz},
        "end": {"dateTime": iso(parse_dt(ends_at)), "timeZone": tz},
    }
    if recurrence:
        event["recurrence"] = list(recurrence)
    return event


def event_span(event: dict, tz=DEFAULT_TZ) -> tuple[datetime, datetime] | None:
    """(start, end) of a Google event, all-day events included. None if unreadable."""
    zone = _zone(tz)
    try:
        start, end = event.get("start") or {}, event.get("end") or {}
        if "dateTime" in start:
            return parse_dt(start["dateTime"]), parse_dt(end.get("dateTime") or start["dateTime"])
        if "date" in start:
            s = datetime.combine(date.fromisoformat(start["date"]), time(0), tzinfo=zone)
            e = datetime.combine(date.fromisoformat(end.get("date") or start["date"]), time(0), tzinfo=zone)
            return s, max(e, s + timedelta(days=1))
    except (ValueError, TypeError, AttributeError):
        return None
    return None


def overlaps(start_a, end_a, start_b, end_b) -> bool:
    return start_a < end_b and end_a > start_b


# ---- .ics parsing ---------------------------------------------------------------------

def _unfold(text: str) -> list[str]:
    lines: list[str] = []
    for raw in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if raw[:1] in (" ", "\t") and lines:
            lines[-1] += raw[1:]
        elif raw:
            lines.append(raw)
    return lines


def _split(line: str) -> tuple[str, dict, str]:
    head, _, value = line.partition(":")
    name, *params = head.split(";")
    parsed = {}
    for p in params:
        key, _, val = p.partition("=")
        parsed[key.upper()] = val.strip('"')
    return name.upper(), parsed, value


def _unescape(text: str) -> str:
    return (text.replace("\\n", " ").replace("\\N", " ").replace("\\,", ",")
            .replace("\\;", ";").replace("\\\\", "\\")).strip()


def _ical_dt(value: str, params: dict, zone: ZoneInfo) -> tuple[datetime, bool]:
    """(local datetime, is_all_day)."""
    value = value.strip()
    if params.get("VALUE") == "DATE" or re.fullmatch(r"\d{8}", value):
        d = datetime.strptime(value, "%Y%m%d").date()
        return datetime.combine(d, time(0), tzinfo=zone), True
    utc = value.endswith("Z")
    naive = datetime.strptime(value.rstrip("Z"), "%Y%m%dT%H%M%S")
    if utc:
        return naive.replace(tzinfo=timezone.utc).astimezone(zone), False
    tzid = params.get("TZID")
    if tzid:
        try:
            return naive.replace(tzinfo=ZoneInfo(tzid)).astimezone(zone), False
        except (ZoneInfoNotFoundError, ValueError):
            pass  # e.g. a Windows zone name: treat as local
    return naive.replace(tzinfo=zone), False  # floating time = local


def _duration(value: str) -> timedelta | None:
    found = re.fullmatch(r"P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?", value.strip())
    if not found:
        return None
    w, d, h, m, s = (int(x) if x else 0 for x in found.groups())
    return timedelta(weeks=w, days=d, hours=h, minutes=m, seconds=s)


def parse_ics(text: str, tz=DEFAULT_TZ, source_file="") -> list[dict]:
    """Events from one .ics file, timestamps normalized to `tz`."""
    zone = _zone(tz)
    events, current = [], None
    for line in _unfold(text.lstrip("﻿")):
        name, params, value = _split(line)
        if name == "BEGIN" and value.upper() == "VEVENT":
            current = {"recurrence": []}
        elif name == "END" and value.upper() == "VEVENT" and current is not None:
            event = _finish(current, zone, source_file)
            if event:
                events.append(event)
            current = None
        elif current is not None:
            if name == "SUMMARY":
                current["title"] = _unescape(value)
            elif name in ("DTSTART", "DTEND"):
                current[name] = (value, params)
            elif name == "DURATION":
                current["DURATION"] = value
            elif name in ("RRULE", "RDATE", "EXDATE"):
                current["recurrence"].append(line if name != "RRULE" else f"RRULE:{value}")
                if name == "EXDATE":
                    current.setdefault("EXDATE", []).extend((v, params) for v in value.split(",") if v)
            elif name == "STATUS":
                current["status"] = value.upper()
            elif name == "RECURRENCE-ID":
                current["RECURRENCE-ID"] = (value, params)
            elif name == "UID":
                current["uid"] = value
    return events


def _finish(raw: dict, zone: ZoneInfo, source_file: str) -> dict | None:
    if "DTSTART" not in raw:
        return None
    override_of = None
    if "RECURRENCE-ID" in raw:
        try:
            override_of = iso(_ical_dt(*raw["RECURRENCE-ID"], zone)[0])
        except ValueError:
            return None
    if raw.get("status") == "CANCELLED":
        # A cancelled instance of a series = that instance was deleted. Keep
        # a marker so the series can drop it; a cancelled one-off just goes.
        return {"cancelled": True, "uid": raw.get("uid", ""), "override_of": override_of} if override_of else None
    exdates = []
    for value, params in raw.get("EXDATE", []):
        try:
            exdates.append(iso(_ical_dt(value, params, zone)[0]))
        except ValueError:
            continue
    try:
        start, all_day = _ical_dt(*raw["DTSTART"], zone)
        if "DTEND" in raw:
            end, _ = _ical_dt(*raw["DTEND"], zone)
        else:
            span = _duration(raw.get("DURATION", "")) or (timedelta(days=1) if all_day else timedelta(hours=1))
            end = (start.astimezone(timezone.utc) + span).astimezone(zone)
    except ValueError:
        return None  # unreadable timestamp: skip the event, keep the rest
    if end <= start:
        return None
    return {
        "title": raw.get("title") or "Busy",
        "starts_at": iso(start),
        "ends_at": iso(end),
        "all_day": all_day,
        "recurrence": [] if override_of else raw["recurrence"],
        "exdates": exdates,
        "uid": raw.get("uid", ""),
        "override_of": override_of,
        "source_file": source_file,
    }


def _ical_utc(instant: str) -> str:
    return parse_dt(instant).astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def fold_overrides(events: list[dict]) -> list[dict]:
    """Moved and deleted instances of a series, folded into the series:
    each becomes an exdate on its parent, a moved one stays as a one-off,
    a deleted one disappears. Parents also get an EXDATE line, so a
    Google import never shows the original slot."""
    by_uid = {e["uid"]: e for e in events if e.get("recurrence") and e.get("uid") and not e.get("cancelled")}
    out = []
    for e in events:
        parent = by_uid.get(e.get("uid")) if e.get("override_of") else None
        if parent is not None:
            parent["exdates"].append(e["override_of"])
            parent["recurrence"].append(f"EXDATE:{_ical_utc(e['override_of'])}")
        if e.get("cancelled"):
            continue
        out.append({k: v for k, v in e.items() if k != "override_of"})
    return out


def _safe_member(info: zipfile.ZipInfo) -> bool:
    name = info.filename.replace("\\", "/")
    if name.startswith("/") or re.match(r"^[A-Za-z]:", name) or ".." in name.split("/"):
        return False
    is_symlink = (info.external_attr >> 16) & 0o170000 == 0o120000
    return not info.is_dir() and not is_symlink


def parse_calendar_zip(data: bytes, tz=DEFAULT_TZ) -> list[dict]:
    """Every event in every .ics file of a Google Calendar export.
    Raises ValueError for something that is not a usable zip."""
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except (zipfile.BadZipFile, TypeError) as exc:
        raise ValueError("that file is not a .zip calendar export") from exc
    with archive:
        members = archive.infolist()
        if len(members) > MAX_ZIP_MEMBERS:
            raise ValueError("the .zip has too many files")
        if sum(m.file_size for m in members) > MAX_ZIP_BYTES:
            raise ValueError("the .zip is too large")
        events = []
        for info in members:
            if not info.filename.lower().endswith(".ics") or not _safe_member(info):
                continue
            text = archive.read(info).decode("utf-8", errors="replace")
            events.extend(parse_ics(text, tz=tz, source_file=info.filename))
    return fold_overrides(events)


# ---- recurrence for the read-only grid ----------------------------------------------
# Walk each series from its first date, day by day in local wall time (so a
# 1pm meeting stays at 1pm across DST), and keep only what falls in the
# window shown. COUNT counts from the first date, as RFC 5545 says, and
# deleted/moved instances (exdates) are skipped after counting.

MAX_SERIES_DAYS = 366 * 30  # a series is walked at most this far


def _rrule_parts(recurrence: list[str]) -> dict | None:
    rule = next((r for r in recurrence if r.upper().startswith("RRULE:")), None)
    if not rule:
        return None
    parts = {}
    for piece in rule.split(":", 1)[1].split(";"):
        key, _, val = piece.partition("=")
        parts[key.upper()] = val.upper()
    return parts


def _ordinal_days(spec: str) -> list[tuple[int | None, int]]:
    """BYDAY "MO,2TU,-1FR" -> [(None, 0), (2, 1), (-1, 4)]."""
    out = []
    for item in spec.split(","):
        found = re.fullmatch(r"([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)", item.strip())
        if found:
            out.append((int(found.group(1)) if found.group(1) else None, _ICAL_DAYS[found.group(2)]))
    return out


def _nth_weekday_ok(day: date, n: int, weekday: int) -> bool:
    if day.weekday() != weekday:
        return False
    if n > 0:
        return (day.day - 1) // 7 + 1 == n
    following = day + timedelta(days=7 * (-n))
    return following.month != day.month and (day + timedelta(days=7 * (-n - 1))).month == day.month


def _month_day_ok(day: date, parts: dict, first: date) -> bool:
    if "BYMONTHDAY" in parts:
        last = (date(day.year + day.month // 12, day.month % 12 + 1, 1) - timedelta(days=1)).day
        wanted = {int(x) if int(x) > 0 else last + int(x) + 1 for x in parts["BYMONTHDAY"].split(",") if x}
        return day.day in wanted
    if "BYDAY" in parts:
        return any((n is None and day.weekday() == wd) or (n is not None and _nth_weekday_ok(day, n, wd))
                   for n, wd in _ordinal_days(parts["BYDAY"]))
    return day.day == first.day


def _matches(day: date, parts: dict, first: date, interval: int) -> bool:
    freq = parts["FREQ"]
    if freq == "DAILY":
        if "BYDAY" in parts and day.weekday() not in {wd for _, wd in _ordinal_days(parts["BYDAY"])}:
            return False
        return (day - first).days % interval == 0
    if freq == "WEEKLY":
        days = {wd for _, wd in _ordinal_days(parts["BYDAY"])} if "BYDAY" in parts else {first.weekday()}
        if day.weekday() not in days:
            return False
        wkst = _ICAL_DAYS.get(parts.get("WKST", "MO"), 0)
        week = lambda d: d - timedelta(days=(d.weekday() - wkst) % 7)  # noqa: E731
        return ((week(day) - week(first)).days // 7) % interval == 0
    if freq == "MONTHLY":
        months = (day.year - first.year) * 12 + day.month - first.month
        return months % interval == 0 and _month_day_ok(day, parts, first)
    if freq == "YEARLY":
        months = {int(m) for m in parts["BYMONTH"].split(",")} if "BYMONTH" in parts else {first.month}
        if (day.year - first.year) % interval or day.month not in months:
            return False
        if "BYMONTHDAY" in parts or "BYDAY" in parts:
            return _month_day_ok(day, parts, first)
        return day.day == first.day
    return False


def expand_recurrence(event: dict, window_start: datetime | None = None, window_end: datetime | None = None,
                      tz=DEFAULT_TZ) -> list[dict]:
    """Occurrences of one parsed event that overlap [window_start, window_end).
    No window: from the first date for DEFAULT_RECURRENCE_WEEKS. A rule we
    can't read gives just the first occurrence."""
    zone = _zone(tz)
    start, end = parse_dt(event["starts_at"]), parse_dt(event["ends_at"])
    lo = window_start or start
    hi = window_end or (start + timedelta(weeks=DEFAULT_RECURRENCE_WEEKS))
    duration = end.astimezone(timezone.utc) - start.astimezone(timezone.utc)

    def in_window(s: datetime) -> bool:
        return s < hi and s + duration > lo

    single = [{"starts_at": event["starts_at"], "ends_at": event["ends_at"]}]
    parts = _rrule_parts(event.get("recurrence") or [])
    if not parts or parts.get("FREQ") not in ("DAILY", "WEEKLY", "MONTHLY", "YEARLY"):
        return single if in_window(start) else []
    try:
        interval = max(1, int(parts.get("INTERVAL", "1")))
        count = int(parts["COUNT"]) if "COUNT" in parts else None
        until = _ical_dt(parts["UNTIL"], {}, zone)[0] if "UNTIL" in parts else None
    except (ValueError, KeyError):
        return single if in_window(start) else []
    skip = {parse_dt(x) for x in event.get("exdates") or []}

    local = start.astimezone(zone)
    wall = local.timetz().replace(tzinfo=None)
    first = local.date()
    out, seen = [], 0
    for offset in range(MAX_SERIES_DAYS):
        day = first + timedelta(days=offset)
        current = datetime.combine(day, wall, tzinfo=zone)
        if (until and current > until) or current >= hi:
            break
        if offset and not _matches(day, parts, first, interval):
            continue
        seen += 1  # COUNT includes deleted instances
        if current not in skip and in_window(current):
            stop = (current.astimezone(timezone.utc) + duration).astimezone(zone)
            out.append({"starts_at": iso(current), "ends_at": iso(stop)})
            if len(out) >= MAX_OCCURRENCES:
                break
        if count is not None and seen >= count:
            break
    return out


def occurrences(events: list[dict], window_start: datetime, window_end: datetime, tz=DEFAULT_TZ) -> list[dict]:
    """Every occurrence of every event in the window, earliest first, each
    carrying its event's title and all_day flag."""
    out = []
    for e in events:
        for occ in expand_recurrence(e, window_start, window_end, tz):
            out.append({"title": e["title"], "all_day": e.get("all_day", False), **occ})
    return sorted(out, key=lambda o: o["starts_at"])
