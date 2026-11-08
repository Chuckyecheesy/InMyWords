"""Coach answer wording (T4.6). Plain code, not the model: the source label
leads the sentence so a staff member never mistakes a pattern or an old
record for something the resident said."""


def coach_answer(facts: list[dict], name: str) -> str:
    if len(facts) > 1:
        groups: dict[str, list[str]] = {}
        for fact in facts:
            label = fact["label"]
            if label.lower() == "pattern noticed":
                label = f"Pattern noticed, not confirmed by {name} yet"
            groups.setdefault(label, []).append(fact["content"].rstrip(". "))
        text = " ".join(
            f"{label}: {'; '.join(contents)}."
            for label, contents in groups.items()
        )
        flagged = [f for f in facts if f.get("update_reason")]
        if flagged:
            text += (
                f" This may be out of date: "
                f"{flagged[0]['content'].rstrip('. ')}. Worth asking {name}."
            )
        return text

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
