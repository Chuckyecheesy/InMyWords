import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import React, { isValidElement, Suspense, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LoadingNotice } from "../components/LoadingNotice";
import HandoffPage from "../app/staff/handoff/page";
import StaffLoading from "../app/staff/loading";
import StaffSectionLoading from "../app/staff/[id]/loading";
import ResidentLoading from "../app/resident/loading";
import ResidentSectionLoading from "../app/resident/[id]/loading";
import { sampleResident } from "../lib/mock";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function findBoundary(node: ReactNode): { key: string | null; props: { children: ReactNode; fallback: ReactNode } } | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findBoundary(child);
      if (found) return found;
    }
  }
  if (!isValidElement<{ children?: ReactNode; fallback?: ReactNode }>(node)) return null;
  if (node.type === Suspense) return node as ReturnType<typeof findBoundary>;
  return findBoundary(node.props.children);
}

test("loading notice gives calm, polite feedback without animation or a time limit", () => {
  const html = renderToStaticMarkup(<LoadingNotice message="Loading updates…" />);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Loading updates…/);
  assert.match(html, /You can take your time/);
});

test("staff and resident routes have loading feedback; nested fallbacks do not duplicate the shell", () => {
  for (const Loading of [StaffLoading, ResidentLoading]) {
    const html = renderToStaticMarkup(<Loading />);
    assert.match(html, /role="status"/);
    assert.match(html, /<main/);
  }
  for (const Loading of [StaffSectionLoading, ResidentSectionLoading]) {
    const html = renderToStaticMarkup(<Loading />);
    assert.match(html, /role="status"/);
    assert.doesNotMatch(html, /<main|<header/);
  }
});

test("handoff shell resolves without requesting the summary and resets its boundary per resident", async () => {
  const hits: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    hits.push(url.pathname);
    assert.match(url.pathname, /^\/residents\//);
    return Response.json(sampleResident(url.pathname.split("/").at(-1)!));
  };
  for (const id of ["marcus", "dana"]) {
    const page = await HandoffPage({ searchParams: Promise.resolve({ resident: id }) });
    assert.ok(page);
    const boundary = findBoundary(page);
    assert.ok(boundary);
    assert.equal(boundary.key, id);
    assert.match(renderToStaticMarkup(boundary.props.fallback), /Loading updates since your last shift/);
    assert.ok(isValidElement(boundary.props.children));
  }
  assert.ok(hits.length > 0);
  assert.ok(hits.every((path) => !path.includes("handoff")));
});
