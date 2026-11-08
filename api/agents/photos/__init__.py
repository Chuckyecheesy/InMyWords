"""Photo subagents (T4.2): a staff phone photo becomes one of the resident's
picture tiles.

    checker.py  Gemini looks at the photo: what it shows, does it match the
                staff label, which tile category, any privacy concern.
    tiler.py    Plain code: clean label, pick category, decide save / review.
    wiring.py   Cloudinary fetch + Gemini + MCP save_tile. The route calls it.

Nothing is saved when the photo looks wrong until staff confirm (product rule
1: nothing acted on without approval). The model only describes; code decides.
"""
