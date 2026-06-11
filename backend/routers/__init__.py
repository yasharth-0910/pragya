"""HTTP layer (CLAUDE.md §3). Routers do HTTP only — validate input, call a
service, shape the response. No business logic and no direct DB engine work lives
here; that belongs in services/ and models/database respectively."""
