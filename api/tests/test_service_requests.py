import sys
import tempfile
import unittest
from contextlib import nullcontext
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'mcp'))

from fastapi.testclient import TestClient
import main
import service_requests as requests
from store import SeedStore


class ServiceRequestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = SeedStore()
        self.store._runtime_path = Path(self.temp.name) / 'runtime.json'

    def create(self, key='request-1', categories=None):
        return requests.create(self.store, 'marcus', categories or ['refreshments', 'family'], key, True)

    def test_persistence_retries_and_resident_filter(self):
        row = self.create()
        self.assertEqual(self.create()['id'], row['id'])
        fresh = SeedStore()
        fresh._runtime_path = self.store._runtime_path
        self.assertEqual(requests.list_requests(fresh, 'marcus')[0]['categories'], ['refreshments', 'family'])
        self.assertEqual(requests.list_requests(fresh, 'dana'), [])
        with self.assertRaises(ValueError):
            self.create(categories=['entertainment'])

    def test_concurrent_retries_only_create_one_request(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            rows = list(pool.map(lambda _: self.create(), range(8)))
        self.assertEqual(len({row['id'] for row in rows}), 1)
        self.assertEqual(len(requests.list_requests(self.store)), 1)

    def test_status_transitions_and_cancellation(self):
        row = self.create()
        with self.assertRaises(ValueError):
            requests.update(self.store, row['id'], 'completed')
        self.assertEqual(requests.update(self.store, row['id'], 'acknowledged')['status'], 'acknowledged')
        self.assertEqual(requests.update(self.store, row['id'], 'completed')['status'], 'completed')
        with self.assertRaises(ValueError):
            requests.update(self.store, row['id'], 'cancelled')
        second = self.create('second')
        self.assertEqual(requests.update(self.store, second['id'], 'cancelled')['status'], 'cancelled')

    def test_validation_and_confirmation(self):
        for categories, approved in [([], True), (['unknown'], True), (['family', 'family'], True), (['family'], False)]:
            with self.subTest(categories=categories, approved=approved), self.assertRaises(ValueError):
                requests.create(self.store, 'marcus', categories, 'key', approved)
        with self.assertRaises(ValueError):
            requests.create(self.store, 'missing', ['family'], 'key', True)

    def test_api_requires_approval_and_returns_storage_failures(self):
        client = TestClient(main.app)
        body = dict(resident_id='marcus', categories=['family'], submission_key='key', approved=True)
        self.assertEqual(client.post('/service-requests', json={**body, 'approved': False}).status_code, 422)
        for name, method, url, payload in [
            ('submit_service_request', 'post', '/service-requests', body),
            ('list_service_requests', 'get', '/service-requests', None),
            ('update_service_request', 'patch', '/service-requests/123', {'status': 'cancelled'}),
        ]:
            listing = patch.object(main.mcp_client, 'list_service_requests', AsyncMock(return_value={
                'requests': [{'id': '123', 'resident_id': 'marcus'}]
            })) if name == 'update_service_request' else nullcontext()
            with listing, patch.object(main.mcp_client, name, AsyncMock(side_effect=RuntimeError('offline'))):
                response = getattr(client, method)(url, **({'json': payload} if payload else {}))
            self.assertEqual(response.status_code, 503)

    def test_gesture_save_does_not_pretend_success(self):
        with patch.object(main.mcp_client, 'save_custom_gesture', AsyncMock(side_effect=RuntimeError('offline'))):
            response = TestClient(main.app).post('/custom-gestures', json={
                'resident_id': 'marcus', 'tile': 'Coffee', 'samples': [[0.] * 63] * 5})
        self.assertEqual(response.status_code, 503)

    def test_request_scope_and_staff_only_status_updates(self):
        row = self.create()
        scope = {'session': {'role': 'resident', 'rid': 'dana'}, 'assignments': []}
        main.app.dependency_overrides[main.current_scope] = lambda: scope
        self.addCleanup(main.app.dependency_overrides.clear)
        client = TestClient(main.app)
        self.assertEqual(client.post('/service-requests', json=dict(
            resident_id='marcus', categories=['family'], submission_key='key', approved=True)).status_code, 403)
        with patch.object(main.mcp_client, 'list_service_requests', AsyncMock(return_value={'requests': [row]})):
            self.assertEqual(client.get('/service-requests?resident_id=marcus').status_code, 403)
            self.assertEqual(client.get('/service-requests').json(), {'requests': []})
            self.assertEqual(client.patch('/service-requests/' + row['id'], json={'status': 'cancelled'}).status_code, 403)
            self.assertEqual(client.patch('/service-requests/' + row['id'], json={'status': 'acknowledged'}).status_code, 403)


if __name__ == '__main__':
    unittest.main()
