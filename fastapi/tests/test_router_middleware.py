import time

import pytest
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient
from starlette.middleware import Middleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


class TimingMiddleware(BaseHTTPMiddleware):
    """Test middleware that adds a process time header."""

    async def dispatch(self, request: Request, call_next):
        start = time.time()
        response = await call_next(request)
        response.headers["X-Process-Time"] = str(time.time() - start)
        return response


class HeaderMiddleware(BaseHTTPMiddleware):
    """Test middleware that adds a custom header."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Custom"] = "router-level"
        return response


class RequestCounter(BaseHTTPMiddleware):
    """Test middleware that counts requests via a list."""

    def __init__(self, app, counter: list):
        super().__init__(app)
        self.counter = counter

    async def dispatch(self, request: Request, call_next):
        self.counter.append(1)
        return await call_next(request)


def test_router_middleware_via_constructor():
    """Test that router middleware works when passed via constructor."""
    app = FastAPI()
    router = APIRouter(
        middleware=[Middleware(TimingMiddleware), Middleware(HeaderMiddleware)]
    )

    @router.get("/router-route")
    async def router_route():
        return {"source": "router"}

    app.include_router(router, prefix="/api")
    client = TestClient(app)

    response = client.get("/api/router-route")
    assert response.status_code == 200
    assert response.json() == {"source": "router"}
    assert response.headers.get("x-process-time") is not None
    assert response.headers.get("x-custom") == "router-level"


def test_router_middleware_isolation():
    """Test that router middleware does NOT apply to other routes."""
    app = FastAPI()
    router = APIRouter(middleware=[Middleware(HeaderMiddleware)])

    @router.get("/router-route")
    async def router_route():
        return {"source": "router"}

    @app.get("/app-route")
    async def app_route():
        return {"source": "app"}

    app.include_router(router, prefix="/api")
    client = TestClient(app)

    # Router route should have middleware
    r1 = client.get("/api/router-route")
    assert r1.headers.get("x-custom") == "router-level"

    # App route should NOT have middleware
    r2 = client.get("/app-route")
    assert r2.headers.get("x-custom") is None


def test_router_middleware_via_add_middleware():
    """Test that add_middleware method works."""
    router = APIRouter()
    router.add_middleware(TimingMiddleware)
    assert len(router.user_middleware) == 1
    assert router.user_middleware[0].cls == TimingMiddleware


def test_router_middleware_execution_order():
    """Test that middleware executes in the order they were added."""
    counter: list[int] = []

    app = FastAPI()
    router = APIRouter(
        middleware=[
            Middleware(RequestCounter, counter=counter),
            Middleware(RequestCounter, counter=counter),
        ]
    )

    @router.get("/test")
    async def test():
        return {"ok": True}

    app.include_router(router)
    client = TestClient(app)

    client.get("/test")
    # Both middlewares should have run (2 counts)
    assert len(counter) == 2


def test_router_without_middleware():
    """Test that a router without middleware works normally."""
    app = FastAPI()
    router = APIRouter()

    @router.get("/test")
    async def test():
        return {"ok": True}

    app.include_router(router)
    client = TestClient(app)

    response = client.get("/test")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_multiple_routers_with_different_middleware():
    """Test that multiple routers can have different middleware."""
    app = FastAPI()

    router1 = APIRouter(middleware=[Middleware(HeaderMiddleware)])

    @router1.get("/r1")
    async def r1():
        return {"router": 1}

    router2 = APIRouter()

    @router2.get("/r2")
    async def r2():
        return {"router": 2}

    app.include_router(router1, prefix="/v1")
    app.include_router(router2, prefix="/v2")
    client = TestClient(app)

    r1_resp = client.get("/v1/r1")
    assert r1_resp.headers.get("x-custom") == "router-level"

    r2_resp = client.get("/v2/r2")
    assert r2_resp.headers.get("x-custom") is None


def test_router_middleware_with_app_level_middleware():
    """Test that router middleware works alongside app-level middleware."""
    app = FastAPI()
    app.add_middleware(TimingMiddleware)

    router = APIRouter(middleware=[Middleware(HeaderMiddleware)])

    @router.get("/test")
    async def test():
        return {"ok": True}

    app.include_router(router)
    client = TestClient(app)

    response = client.get("/test")
    assert response.status_code == 200
    # App-level middleware should apply
    assert response.headers.get("x-process-time") is not None
    # Router-level middleware should also apply
    assert response.headers.get("x-custom") == "router-level"
