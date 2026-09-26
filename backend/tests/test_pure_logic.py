"""Unit tests for the pure functions at the core of ingestion and retrieval."""

from qdrant import build_visibility_filter
from services.ingestion_service import (
    CHILD_OVERLAP_WORDS,
    CHILD_WORDS,
    PARENT_WORDS,
    _strip_boilerplate,
    hierarchical_chunk,
)
from services.retrieval_service import rrf_fusion


def _hits(*ids: str) -> list[dict]:
    return [{"qdrant_id": i} for i in ids]


# ── rrf_fusion ────────────────────────────────────────────────────────────
def test_rrf_scores_use_k60_and_rank_from_one():
    fused = {r["qdrant_id"]: r["rrf_score"] for r in rrf_fusion(_hits("a", "b"), [])}
    assert fused["a"] == 1 / 61
    assert fused["b"] == 1 / 62


def test_rrf_doc_in_both_lists_outranks_doc_in_one():
    # "x" is rank 2 in both lists; "a" is rank 1 in dense only, "b" rank 1 in sparse only.
    fused = rrf_fusion(_hits("a", "x"), _hits("b", "x"))
    assert [r["qdrant_id"] for r in fused][0] == "x"
    assert fused[0]["rrf_score"] == 2 / 62
    assert len(fused) == 3  # deduped


def test_rrf_absent_doc_contributes_nothing():
    fused = rrf_fusion(_hits("a"), _hits("b"))
    assert {r["qdrant_id"] for r in fused} == {"a", "b"}
    assert rrf_fusion([], []) == []


def test_rrf_does_not_mutate_input_and_caps_pool_at_40():
    dense = _hits(*(f"d{i}" for i in range(30)))
    sparse = _hits(*(f"s{i}" for i in range(30)))
    assert len(rrf_fusion(dense, sparse)) == 40
    assert "rrf_score" not in dense[0]


# ── hierarchical_chunk ────────────────────────────────────────────────────
def _pages(n_words: int) -> list[dict]:
    return [{"text": " ".join(f"w{i}" for i in range(n_words)), "page": 1}]


def test_short_doc_is_its_own_parent():
    chunks = hierarchical_chunk(_pages(CHILD_WORDS - 1))
    assert len(chunks) == 1
    assert chunks[0]["child_text"] == chunks[0]["parent_text"]
    assert chunks[0]["child_text"]  # never empty


def test_empty_doc_yields_no_chunks():
    assert hierarchical_chunk([{"text": "   ", "page": 1}]) == []


def test_child_and_parent_sizes():
    chunks = hierarchical_chunk(_pages(PARENT_WORDS + 500))
    assert all(len(c["child_text"].split()) <= CHILD_WORDS for c in chunks)
    assert all(len(c["parent_text"].split()) <= PARENT_WORDS for c in chunks)
    assert len(chunks[0]["child_text"].split()) == CHILD_WORDS
    assert len(chunks[0]["parent_text"].split()) == PARENT_WORDS
    assert [c["chunk_index"] for c in chunks] == list(range(len(chunks)))


def test_children_overlap_by_twenty_percent():
    first, second = hierarchical_chunk(_pages(PARENT_WORDS))[:2]
    a, b = first["child_text"].split(), second["child_text"].split()
    assert a[-CHILD_OVERLAP_WORDS:] == b[:CHILD_OVERLAP_WORDS]
    assert CHILD_OVERLAP_WORDS == round(CHILD_WORDS * 0.2)


def test_child_reports_page_it_starts_on():
    pages = [
        {"text": " ".join(["a"] * 400), "page": 1},
        {"text": " ".join(["b"] * 400), "page": 2},
    ]
    chunks = hierarchical_chunk(pages)
    assert chunks[0]["page_number"] == 1
    # second child starts at word 273 (341 - 68), still page 1; third at 546 → page 2
    assert chunks[2]["page_number"] == 2


# ── build_visibility_filter ───────────────────────────────────────────────
def _branch(f, visibility: str):
    for sub in f.should:
        conds = {c.key: c.match.value for c in sub.must}
        if conds["visibility"] == visibility:
            return conds
    raise AssertionError(f"no {visibility} branch")


def test_visibility_filter_has_all_three_tiers():
    f = build_visibility_filter("dept-1", "user-1")
    assert len(f.should) == 3
    assert _branch(f, "company") == {"visibility": "company"}
    assert _branch(f, "department") == {"visibility": "department", "department_id": "dept-1"}


def test_personal_branch_is_tied_to_user_id():
    conds = _branch(build_visibility_filter("dept-1", "user-1"), "personal")
    assert conds["uploaded_by"] == "user-1"
    assert "department_id" not in conds


# ── _strip_boilerplate ────────────────────────────────────────────────────
def test_strip_boilerplate_removes_repeated_letterhead():
    pages = [
        {"text": f"INFOVANCE TECHNOLOGIES\nCompany wide policy line {i} is here now\nPage {i}", "page": i}
        for i in (1, 2, 3)
    ]
    out = _strip_boilerplate(pages)
    assert len(out) == 3
    for p in out:
        assert "INFOVANCE" not in p["text"]
        assert "Page " not in p["text"]
        assert "policy line" in p["text"]


def test_strip_boilerplate_drops_frequent_lines_and_empty_pages():
    repeated = "Employees receive twelve casual leaves per year"
    pages = [
        {"text": f"{repeated}\nUnique body sentence number {i} for testing", "page": i}
        for i in (1, 2, 3)
    ] + [{"text": "INFOVANCE TECHNOLOGIES", "page": 4}]
    out = _strip_boilerplate(pages)
    assert [p["page"] for p in out] == [1, 2, 3]  # boilerplate-only page dropped
    assert all(repeated not in p["text"] for p in out)  # >60% of pages → removed
