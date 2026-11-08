"use client";

import { useState } from "react";
import { FileText, FolderOpen, Plus, Search } from "lucide-react";
import { addRecord, getRecords, type ResidentRecord } from "@/lib/api";
import { DEMO_STAFF } from "@/lib/mock";
import { Badge, Callout, EmptyState } from "./ui";

const CATEGORIES = ["update", "binder", "care plan", "medical", "other"] as const;

export function RecordsLibrary({
  residentId,
  residentName: name,
  initial,
}: {
  residentId: string;
  residentName: string;
  initial: ResidentRecord[];
}) {
  const [records, setRecords] = useState(initial);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<string>("update");
  const [docDate, setDocDate] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const visible = records.filter((item) => {
    if (!query.trim()) return true;
    const haystack = `${item.title} ${item.body} ${item.category}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  async function save() {
    if (!title.trim() || !body.trim()) {
      setStatus("A title and the update text are both needed.");
      return;
    }
    setStatus("Saving…");
    const result = await addRecord({
      resident_id: residentId,
      title: title.trim(),
      body: body.trim(),
      category,
      author: DEMO_STAFF.name,
      doc_date: docDate || new Date().toISOString().slice(0, 10),
    });
    if (!result.ok) {
      setStatus(result.error);
      return;
    }
    setRecords(await getRecords(residentId));
    setTitle("");
    setBody("");
    setDocDate("");
    setAdding(false);
    setStatus("Saved. The Coach can cite this now.");
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-3)" }}>
        <label className="records-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder="Search records"
            aria-label="Search records"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button type="button" className="btn" data-variant="primary" data-size="lg" onClick={() => setAdding((v) => !v)}>
          <Plus size={20} aria-hidden="true" />
          Add record
        </button>
      </div>

      {status ? (
        <Callout tone={status.startsWith("Saved") ? "success" : "info"} role="status">
          {status}
        </Callout>
      ) : null}

      {adding ? (
        <form
          className="card card-pad stack"
          aria-label="Add a record"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className="field">
            <span>Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>
          <div className="row" style={{ gap: "var(--space-3)", flexWrap: "wrap" }}>
            <label className="field">
              <span>Category</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Document date</span>
              <input type="date" value={docDate} onChange={(event) => setDocDate(event.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>The update</span>
            <textarea rows={5} value={body} onChange={(event) => setBody(event.target.value)} required />
          </label>
          <div className="row">
            <button type="submit" className="btn" data-variant="primary" data-size="lg">
              Save record
            </button>
            <button type="button" className="btn" data-variant="ghost" data-size="lg" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState icon={<FolderOpen size={30} />} title={query ? "No records match" : "No records yet"}>
          {query ? "Try a different search." : `Add ${name}'s first document or dated update.`}
        </EmptyState>
      ) : (
        <ul style={{ listStyle: "none", display: "grid", gap: "var(--space-3)" }}>
          {visible.map((item) => (
            <li key={item.id} className="card card-pad">
              <button
                type="button"
                className="record-row"
                aria-expanded={openId === item.id}
                onClick={() => setOpenId(openId === item.id ? null : item.id)}
              >
                <FileText size={20} aria-hidden="true" />
                <span className="record-title">{item.title}</span>
                <Badge tone="document" label={item.category} />
                <span className="record-date">
                  {item.doc_date ?? "undated"} · added {item.uploaded_at?.slice(0, 10)}
                  {item.author ? ` by ${item.author}` : ""}
                </span>
              </button>
              {openId === item.id ? (
                <div className="record-body">
                  {item.body.split("\n").slice(0, 40).map((line, index) => (
                    <p key={index}>{line}</p>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
