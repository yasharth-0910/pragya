"""Cross-cutting request-layer dependencies (auth, RBAC). Imported by routers as
FastAPI `Depends(...)` guards. Lives outside routers/ because these are shared
across many routers, not owned by any one."""
