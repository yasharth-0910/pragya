"""Business-logic layer (CLAUDE.md §3). Services own all logic — chunking,
retrieval, generation, auth — and are called by routers. No HTTP here, no raw
SQL engine creation; routers handle HTTP, models/database handle persistence."""
