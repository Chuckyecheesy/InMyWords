"""Persistent, category-level resident requests. Used only by the actions MCP."""
import json
from functools import wraps
from threading import RLock
from datetime import datetime, timezone
from uuid import uuid4

CATEGORIES = {'refreshments', 'entertainment', 'family'}
TRANSITIONS = {'sent': {'acknowledged', 'cancelled'},
               'acknowledged': {'completed', 'cancelled'},
               'completed': set(), 'cancelled': set()}
_lock = RLock()


def serialized(operation):
    @wraps(operation)
    def run(*args, **kwargs):
        with _lock:
            return operation(*args, **kwargs)
    return run


def _read_seed(store):
    # Separate from the shared runtime: memory-server writes cannot overwrite requests.
    path = store._runtime_path.with_suffix('.service-requests.json')
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else []


def _write_seed(store, rows):
    path = store._runtime_path.with_suffix('.service-requests.json')
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(rows, indent=2), encoding='utf-8')
    temporary.replace(path)


@serialized
def create(store, resident_id, categories, submission_key, approved):
    if not approved:
        raise ValueError('Resident confirmation is required.')
    if not categories or not set(categories) <= CATEGORIES or len(categories) != len(set(categories)):
        raise ValueError('Choose one or more valid categories without duplicates.')
    if not submission_key or len(submission_key) > 100:
        raise ValueError('A submission key is required.')
    if not store.get_resident(resident_id):
        raise ValueError('Resident not found.')
    now = datetime.now(timezone.utc).isoformat()
    row = dict(id=str(uuid4()), resident_id=resident_id, categories=categories,
               submission_key=submission_key, status='sent', created_at=now, updated_at=now)
    if store.mode == 'postgres':
        result = store._one(
            'INSERT INTO service_requests (id, resident_id, categories, submission_key) '
            'VALUES (%s,%s,%s,%s) ON CONFLICT (resident_id, submission_key) '
            'DO UPDATE SET submission_key = service_requests.submission_key RETURNING *',
            (row['id'], resident_id, json.dumps(categories), submission_key))
    else:
        rows = _read_seed(store)
        result = next((r for r in rows if r['resident_id'] == resident_id
                       and r['submission_key'] == submission_key), None)
        if result is None:
            rows.append(row)
            _write_seed(store, rows)
            result = row
    if set(result['categories']) != set(categories):
        raise ValueError('This submission key already belongs to another request.')
    return result


@serialized
def list_requests(store, resident_id='', status=''):
    if status and status not in TRANSITIONS:
        raise ValueError('Unknown request status.')
    if store.mode == 'postgres':
        return store._all(
            "SELECT * FROM service_requests WHERE (%s = '' OR resident_id = %s) "
            "AND (%s = '' OR status = %s) ORDER BY created_at DESC",
            (resident_id, resident_id, status, status))
    return sorted([r for r in _read_seed(store)
                   if (not resident_id or r['resident_id'] == resident_id)
                   and (not status or r['status'] == status)],
                  key=lambda r: r['created_at'], reverse=True)


@serialized
def update(store, request_id, status):
    if status not in TRANSITIONS:
        raise ValueError('Unknown request status.')
    if store.mode == 'postgres':
        # A row lock keeps acknowledgement and cancellation from racing.
        with store._conn() as conn:
            row = conn.execute('SELECT * FROM service_requests WHERE id = %s FOR UPDATE',
                               (request_id,)).fetchone()
            if not row:
                raise LookupError('Request not found.')
            if status != row['status'] and status not in TRANSITIONS[row['status']]:
                raise ValueError('This request can no longer be changed that way.')
            return dict(conn.execute(
                'UPDATE service_requests SET status = %s, updated_at = now() WHERE id = %s RETURNING *',
                (status, request_id)).fetchone())
    rows = _read_seed(store)
    row = next((r for r in rows if r['id'] == request_id), None)
    if not row:
        raise LookupError('Request not found.')
    if status != row['status'] and status not in TRANSITIONS[row['status']]:
        raise ValueError('This request can no longer be changed that way.')
    row.update(status=status, updated_at=datetime.now(timezone.utc).isoformat())
    _write_seed(store, rows)
    return row
