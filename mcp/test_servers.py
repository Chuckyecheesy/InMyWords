"""Quick smoke test for the MCP servers (run them first).

    python mcp/profile_server.py &
    python mcp/emh_server.py &
    python mcp/test_servers.py
"""

import asyncio
import json

from fastmcp import Client


async def call(url, tool, args):
    async with Client(url) as client:
        result = await client.call_tool(tool, args)
        data = getattr(result, "data", None)
        if data is None:
            data = json.loads(result.content[0].text)
        return data


async def main():
    profile = "http://127.0.0.1:8101/mcp"
    emh = "http://127.0.0.1:8104/mcp"

    p = await call(profile, "get_profile", {"resident": "marcus"})
    print(f"get_profile: {p['name']}, tiles={len(p['tiles'])}, "
          f"prefs={len(p['preferences'])}, routines={len(p['routines'])}, "
          f"pending={len(p['pending_patterns'])}, mode={p['store_mode']}")
    assert p["pending_patterns"], "tea pattern should be pending"

    a = await call(profile, "ask_about", {"resident": "marcus", "question": "what upsets him loud rooms"})
    print(f"ask_about: {len(a['facts'])} facts; top: {a['facts'][0]['content'][:60]}... "
          f"[{a['facts'][0]['label']}]")

    u = await call(profile, "ask_about", {"resident": "marcus", "question": "zzzqqq"})
    assert u["unknown"], "nonsense question should be unknown"
    print("ask_about unknown: OK (Coach must say 'ask Marcus')")

    s = await call(profile, "log_sentence",
                   {"resident": "marcus", "sentence": "Can I get a double-double?", "approved": True,
                    "tiles": ["coffee", "now"]})
    print(f"log_sentence: id={s['id']} ({s['store_mode']})")

    c = await call(profile, "log_choice",
                   {"resident": "marcus", "options": [{"label": "bowling", "cost": 15}], "chosen": None})
    assert c["status"] == "not_yet_decided"
    print(f"log_choice with no decision: status={c['status']} (never 'staff decided')")

    n = await call(emh, "get_contact_notes", {"resident": "marcus"})
    k = await call(emh, "get_checklist", {"home": "maple_house"})
    missed = [i for i in k["items"] if not i["happened"]]
    print(f"emh: {len(n['notes'])} notes; checklist misses: {[m['reason'] for m in missed]}")

    # ---- memory server (T2.5): the full demo arc ----
    memory = "http://127.0.0.1:8102/mcp"

    r = await call(memory, "recall", {"resident": "marcus", "query": "drinks coffee tea"})
    contents = [m["content"][:40] for m in r["memories"]]
    assert any("coffee" in c for c in contents) and any("tea" in c.lower() for c in contents), contents
    print(f"recall('drinks'): {len(r['memories'])} memories incl. coffee AND tea — done-when met")

    q = await call(memory, "get_pending", {"resident": "marcus"})
    tea = next(m for m in q["memories"] if "tea" in m["content"].lower())
    assert tea["label"] == "Pattern noticed"
    print(f"confirm? queue: '{tea['content'][:45]}...' [{tea['label']}]")

    c1 = await call(memory, "confirm_memory", {"resident": "marcus", "memory": tea["id"], "confirmed": True})
    assert c1["memory"]["status"] == "confirmed" and c1["memory"]["source"] == "resident"
    assert c1["memory"]["label"] == "In Marcus's words"
    print(f"confirmed: now [{c1['memory']['label']}] — the demo beat works")

    m1 = await call(memory, "remember",
                    {"resident": "marcus", "event": "Asked to go bowling again", "source": "inferred"})
    m2 = await call(memory, "remember",
                    {"resident": "marcus", "event": "Asked to go bowling again today", "source": "inferred"})
    assert m2["merged"] and m2["times_seen"] == 2
    print(f"remember dedup: near-duplicate merged, times_seen={m2['times_seen']}")

    rt = await call(memory, "get_routines", {"resident": "marcus"})
    print(f"routines: {len(rt['confirmed'])} confirmed, {len(rt['suggested'])} suggested")

    p = await call(memory, "propose_update",
                   {"resident": "marcus", "memory": 1, "reason": "Recent pattern contradicts: tea 5x this week"})
    assert p["queued"]["status"] == "pending"
    print(f"propose_update: coffee fact back in the queue ({p['queued']['update_reason'][:30]}...)")

    print("\nALL MCP SMOKE TESTS PASSED")


asyncio.run(main())
