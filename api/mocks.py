"""Hard-coded mock responses for every endpoint (BUILD_PLAN T2.1).

Everyone builds against these from hour 1. Real logic replaces each one
inside main.py without changing shapes — shapes are the frozen contract
(docs/CONTRACTS.md). If a shape here looks wrong, flag it in team chat
BEFORE hour 1, not after.
"""

RESIDENTS = {
    "marcus": {
        "id": "marcus",
        "name": "Marcus",
        "voice_id": "kH3DRVrsOPrpd0ciIeWk",
        "communication_style": "Single words and gestures. Picture tiles. Needs quiet to focus.",
        "tiles": [
            {"id": 1, "label": "coffee", "category": "food & drink", "cloudinary_id": "tiles/marcus_coffee", "times_used": 48},
            {"id": 2, "label": "tea", "category": "food & drink", "cloudinary_id": "tiles/marcus_tea", "times_used": 9},
            {"id": 3, "label": "bowling", "category": "activities", "cloudinary_id": "tiles/marcus_bowling", "times_used": 22},
            {"id": 4, "label": "Raptors", "category": "activities", "cloudinary_id": "tiles/marcus_raptors", "times_used": 17},
            {"id": 5, "label": "park", "category": "places", "cloudinary_id": "tiles/marcus_park", "times_used": 11},
            {"id": 6, "label": "music", "category": "activities", "cloudinary_id": "tiles/marcus_music", "times_used": 8},
            {"id": 7, "label": "bus", "category": "places", "cloudinary_id": "tiles/marcus_bus", "times_used": 13},
            {"id": 8, "label": "quiet", "category": "feelings", "cloudinary_id": "tiles/marcus_quiet", "times_used": 15},
            {"id": 9, "label": "Lisa", "category": "people", "cloudinary_id": "tiles/marcus_lisa", "times_used": 19},
            {"id": 10, "label": "help", "category": "feelings", "cloudinary_id": "tiles/marcus_help", "times_used": 7},
            {"id": 11, "label": "yes", "category": "answers", "cloudinary_id": "tiles/marcus_yes", "times_used": 120},
            {"id": 12, "label": "no", "category": "answers", "cloudinary_id": "tiles/marcus_no", "times_used": 95},
        ],
    },
    "dana": {
        "id": "dana",
        "name": "Dana",
        "voice_id": "HTTgQl5PH22smEaufnZl",
        "communication_style": "Picture tiles and some short phrases. Manages a weekly budget with support.",
        "tiles": [
            {"id": 21, "label": "garden", "category": "activities", "cloudinary_id": "tiles/dana_garden", "times_used": 35},
            {"id": 22, "label": "sister", "category": "people", "cloudinary_id": "tiles/dana_sister", "times_used": 28},
            {"id": 23, "label": "groceries", "category": "places", "cloudinary_id": "tiles/dana_groceries", "times_used": 16},
            {"id": 24, "label": "tea", "category": "food & drink", "cloudinary_id": "tiles/dana_tea", "times_used": 41},
            {"id": 25, "label": "walk", "category": "activities", "cloudinary_id": "tiles/dana_walk", "times_used": 23},
            {"id": 26, "label": "money", "category": "things", "cloudinary_id": "tiles/dana_money", "times_used": 12},
            {"id": 27, "label": "TV", "category": "activities", "cloudinary_id": "tiles/dana_tv", "times_used": 18},
            {"id": 28, "label": "herbs", "category": "things", "cloudinary_id": "tiles/dana_herbs", "times_used": 6},
            {"id": 29, "label": "bus", "category": "places", "cloudinary_id": "tiles/dana_bus", "times_used": 10},
            {"id": 30, "label": "help", "category": "feelings", "cloudinary_id": "tiles/dana_help", "times_used": 5},
            {"id": 31, "label": "yes", "category": "answers", "cloudinary_id": "tiles/dana_yes", "times_used": 98},
            {"id": 32, "label": "no", "category": "answers", "cloudinary_id": "tiles/dana_no", "times_used": 74},
        ],
    },
}

SUGGESTIONS = {
    "marcus": ["Can I get a double-double from Tim's?", "I want a coffee now, please.", "Coffee first, then the park?"],
    "dana": ["Can we water the herb garden now?", "I want to work in the garden.", "Garden first, tea after?"],
}

STORY = {
    "marcus": {
        "chapters": [
            {
                "id": 1,
                "chapter_key": "about_me",
                "text": "I'm Marcus. I'm 34. I love the Raptors and bowling on Saturdays. My coffee order is a double-double from Tim's. Loud rooms are hard for me — quiet helps.",
                "photo_ids": ["story/marcus_portrait", "story/marcus_bowling"],
                "audio_url": "https://example.com/audio/marcus_about_me.mp3",
                "status": "approved",
            },
            {
                "id": 2,
                "chapter_key": "people_who_matter",
                "text": "My sister Lisa calls me every week. She takes me to Raptors games when she can. I want her to come bowling with me.",
                "photo_ids": ["story/marcus_lisa"],
                "audio_url": None,
                "status": "draft",
            },
        ]
    },
    "dana": {
        "chapters": [
            {
                "id": 3,
                "chapter_key": "about_me",
                "text": "I'm Dana. I grow things — tomatoes last summer, and I want a balcony herb garden next. My sister visits every Sunday and we drink tea.",
                "photo_ids": ["story/dana_garden"],
                "audio_url": "https://example.com/audio/dana_about_me.mp3",
                "status": "approved",
            },
            {
                "id": 4,
                "chapter_key": "my_day",
                "text": "I do my budget on Mondays with staff. I shop for groceries on Thursdays. I like a walk after dinner when it's nice out.",
                "photo_ids": ["story/dana_walk"],
                "audio_url": None,
                "status": "draft",
            },
        ]
    },
}

COACH_ANSWERS = {
    "default": {
        "answer": "Loud rooms upset Marcus. Moving somewhere quiet and giving him his headphones helps him settle.",
        "sources": [
            {"type": "resident", "date": "2026-11-02", "label": "In Marcus's words"},
            {"type": "document", "date": "2021-03-15", "label": "From records, 2021"},
        ],
    },
    "unknown": {
        "answer": "I don't know — it's best to ask Marcus.",
        "sources": [],
    },
}

PENDING_MEMORIES = {
    "marcus": [
        {
            "id": 101,
            "type": "preference",
            "content": "Likes tea now (picked tea 5 times this week after months of coffee)",
            "source": "inferred",
            "label": "Pattern noticed",
            "times_seen": 5,
            "first_seen": "2026-11-01",
            "last_seen": "2026-11-06",
            "status": "pending",
        }
    ],
    "dana": [],
}

ACTION_PLAN = {
    "plan_id": 501,
    "goal": "bowling Saturday",
    "online_steps": [
        {"step": "book_activity", "detail": "Lane at KW Bowl, Saturday 2:00pm", "cost": 15.00},
        {"step": "add_to_calendar", "detail": "Bowling — Saturday 2:00pm", "cost": 0},
        {"step": "send_message", "detail": "Email Lisa: 'Marcus is going bowling Saturday at 2pm. Want to come?'", "cost": 0},
    ],
    "staff_tasks": [
        {"task": "Drive Marcus to KW Bowl", "due": "Saturday 1:30pm"},
    ],
    "total_cost": 15.00,
    "status": "proposed",
}

ACTION_RESULTS = {
    "results": [
        {"step": "book_activity", "result": "Booked: lane 4, KW Bowl, Saturday 2:00pm"},
        {"step": "add_to_calendar", "result": "Added to Marcus's calendar"},
        {"step": "send_message", "result": "Email sent to Lisa"},
        {"step": "create_staff_task", "result": "Staff task created: drive Marcus, Saturday 1:30pm"},
    ]
}

HANDOFF = {
    "items": [
        {"type": "choice", "date": "2026-11-06", "text": "Marcus chose bowling for Saturday (his choice, approved the plan himself)."},
        {"type": "staff_task", "date": "2026-11-07", "text": "Ride needed: drive Marcus to KW Bowl, Saturday 1:30pm."},
        {"type": "emh_checklist", "date": "2026-11-05", "text": "Grocery shopping didn't happen — bus was cancelled."},
        {"type": "pattern", "date": "2026-11-06", "text": "Pattern noticed (not confirmed): Marcus has picked tea 5 times this week."},
        {"type": "emh_note", "date": "2026-11-04", "text": "Quiet afternoon; Marcus listened to music in his room after the day program."},
    ]
}

ACTIVITY = {
    "marcus": {
        "items": [
            {"kind": "sentence", "date": "2026-11-06T09:12:00", "text": "Spoke: 'Can I get a double-double from Tim's?' (approved)"},
            {"kind": "choice", "date": "2026-11-06T14:30:00", "text": "Chose bowling over movie ($15, $25 left this week)"},
            {"kind": "action", "date": "2026-11-06T14:33:00", "text": "Approved plan: book lane, calendar, email Lisa"},
        ]
    },
    "dana": {"items": []},
}

CHOICE_WITH_CONSEQUENCES = {
    "id": 301,
    "options": [
        {"label": "bowling", "photo": "tiles/marcus_bowling", "cost": 15.00, "consequence": "Costs $15. You'd have $25 left this week."},
        {"label": "movie", "photo": "tiles/marcus_movie", "cost": 12.00, "consequence": "Costs $12. You'd have $28 left this week."},
        {"label": "not decided yet", "photo": "tiles/marcus_later", "cost": 0, "consequence": "That's okay — we can come back to this."},
    ],
    "status": "not_yet_decided",
}

STORY_DRAFT = {
    "text": "I'm Marcus. Saturdays are my bowling days. I get a double-double on the way. One day I want to see the Raptors play for real."
}
