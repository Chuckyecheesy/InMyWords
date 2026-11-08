"""Coach answer wording (T4.6). Plain code, not the model: the source label
leads the sentence so a staff member never mistakes a pattern or an old
record for something the resident said."""


def coach_answer(facts: list[dict], name: str) -> str:
    top = facts[0]
    label = top["label"]
    content = top["content"].rstrip(". ")
    if label.lower() == "pattern noticed":
        text = f"Pattern noticed, not confirmed by {name} yet: {content}."
    else:
        text = f"{label}: {content}."
    flagged = [f for f in facts[1:] if f.get("update_reason")]
    if top.get("update_reason"):
        flagged = [top] + flagged
    if flagged:
        text += f" This may be out of date: {flagged[0]['content'].rstrip('. ')}. Worth asking {name}."
    return text
