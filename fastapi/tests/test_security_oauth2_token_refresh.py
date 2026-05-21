import pytest
from fastapi import Depends, FastAPI
from fastapi.security import (
    OAuth2PasswordBearerWithRefresh,
    OAuth2RefreshRequestForm,
)
from fastapi.testclient import TestClient


def test_oauth2_password_bearer_with_refresh_openapi_schema():
    """
    Test that OAuth2PasswordBearerWithRefresh includes refreshUrl in the
    OpenAPI schema.
    """
    app = FastAPI()
    oauth2_scheme = OAuth2PasswordBearerWithRefresh(
        tokenUrl="/token", refreshUrl="/token/refresh"
    )

    @app.get("/items/")
    async def read_items(token: str = Depends(oauth2_scheme)):
        return {"token": token}

    client = TestClient(app)
    schema = app.openapi()
    security_scheme = schema["components"]["securitySchemes"][
        "OAuth2PasswordBearerWithRefresh"
    ]
    password_flow = security_scheme["flows"]["password"]
    assert password_flow["tokenUrl"] == "/token"
    assert password_flow["refreshUrl"] == "/token/refresh"
    assert "scopes" in password_flow


def test_oauth2_password_bearer_with_refresh_authentication():
    """
    Test that OAuth2PasswordBearerWithRefresh works for authentication.
    """
    app = FastAPI()
    oauth2_scheme = OAuth2PasswordBearerWithRefresh(
        tokenUrl="/token", refreshUrl="/token/refresh"
    )

    @app.get("/items/")
    async def read_items(token: str = Depends(oauth2_scheme)):
        return {"token": token}

    client = TestClient(app)

    # Valid bearer token
    response = client.get("/items/", headers={"Authorization": "Bearer testtoken"})
    assert response.status_code == 200
    assert response.json() == {"token": "testtoken"}

    # Missing auth header
    response = client.get("/items/")
    assert response.status_code == 401

    # Wrong scheme
    response = client.get("/items/", headers={"Authorization": "Basic dGVzdDp0ZXN0"})
    assert response.status_code == 401


def test_oauth2_password_bearer_with_refresh_auto_error_false():
    """
    Test that OAuth2PasswordBearerWithRefresh with auto_error=False
    returns None instead of 401.
    """
    app = FastAPI()
    oauth2_scheme = OAuth2PasswordBearerWithRefresh(
        tokenUrl="/token", refreshUrl="/token/refresh", auto_error=False
    )

    @app.get("/items/")
    async def read_items(token: str | None = Depends(oauth2_scheme)):
        return {"token": token}

    client = TestClient(app)

    response = client.get("/items/")
    assert response.status_code == 200
    assert response.json() == {"token": None}


def test_oauth2_password_bearer_with_refresh_scopes():
    """
    Test that OAuth2PasswordBearerWithRefresh accepts scopes.
    """
    app = FastAPI()
    oauth2_scheme = OAuth2PasswordBearerWithRefresh(
        tokenUrl="/token",
        refreshUrl="/token/refresh",
        scopes={"read:items": "Read items", "write:items": "Write items"},
    )

    @app.get("/items/")
    async def read_items(token: str = Depends(oauth2_scheme)):
        return {"token": token}

    schema = app.openapi()
    password_flow = schema["components"]["securitySchemes"][
        "OAuth2PasswordBearerWithRefresh"
    ]["flows"]["password"]
    assert password_flow["scopes"] == {
        "read:items": "Read items",
        "write:items": "Write items",
    }


def test_oauth2_refresh_request_form_full():
    """
    Test OAuth2RefreshRequestForm with all fields provided.
    """
    app = FastAPI()

    @app.post("/token/refresh")
    async def refresh_token(form_data: OAuth2RefreshRequestForm = Depends()):
        return {
            "grant_type": form_data.grant_type,
            "refresh_token": form_data.refresh_token,
            "scopes": form_data.scopes,
            "client_id": form_data.client_id,
            "client_secret": form_data.client_secret,
        }

    client = TestClient(app)

    response = client.post(
        "/token/refresh",
        data={
            "grant_type": "refresh_token",
            "refresh_token": "my_refresh_token",
            "scope": "read write",
            "client_id": "my_client",
            "client_secret": "my_secret",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["grant_type"] == "refresh_token"
    assert data["refresh_token"] == "my_refresh_token"
    assert data["scopes"] == ["read", "write"]
    assert data["client_id"] == "my_client"
    assert data["client_secret"] == "my_secret"


def test_oauth2_refresh_request_form_minimal():
    """
    Test OAuth2RefreshRequestForm with only required fields.
    """
    app = FastAPI()

    @app.post("/token/refresh")
    async def refresh_token(form_data: OAuth2RefreshRequestForm = Depends()):
        return {
            "refresh_token": form_data.refresh_token,
            "scopes": form_data.scopes,
        }

    client = TestClient(app)

    response = client.post(
        "/token/refresh",
        data={"refresh_token": "just_token"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["refresh_token"] == "just_token"
    assert data["scopes"] == []


def test_oauth2_refresh_request_form_invalid_grant_type():
    """
    Test OAuth2RefreshRequestForm rejects invalid grant_type.
    """
    app = FastAPI()

    @app.post("/token/refresh")
    async def refresh_token(form_data: OAuth2RefreshRequestForm = Depends()):
        return {"ok": True}

    client = TestClient(app)

    response = client.post(
        "/token/refresh",
        data={
            "grant_type": "password",
            "refresh_token": "test",
        },
    )
    assert response.status_code == 422


def test_oauth2_refresh_request_form_missing_refresh_token():
    """
    Test OAuth2RefreshRequestForm rejects missing refresh_token.
    """
    app = FastAPI()

    @app.post("/token/refresh")
    async def refresh_token(form_data: OAuth2RefreshRequestForm = Depends()):
        return {"ok": True}

    client = TestClient(app)

    response = client.post("/token/refresh", data={})
    assert response.status_code == 422
