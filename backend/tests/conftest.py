import os
import subprocess

import pytest
import requests


def _base():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        for line in open("/app/frontend/.env"):
            if line.startswith("REACT_APP_BACKEND_URL="):
                url = line.split("=", 1)[1].strip()
    return url.rstrip("/")


BASE_URL = _base()
ADMIN_ID = "user_3LHTDfo1TyJjoQNBm1Mwh7KrWui"
BUYER_ID = "user_3LHTDhUWSZCRdqDmDde8rB1klPC"
SALES_ID = "user_3LHTDiZMOZVrI5B77G39WDxMyjW"


def _token(uid):
    return subprocess.check_output(["python3", "/app/scripts/clerk_token.py", uid], text=True).strip()


def _client(uid=None):
    s = requests.Session()
    if uid:
        s.headers["Authorization"] = "Bearer " + _token(uid)
    return s


@pytest.fixture(scope="session")
def base():
    return BASE_URL


@pytest.fixture(scope="session")
def admin():
    return _client(ADMIN_ID)


@pytest.fixture(scope="session")
def buyer():
    return _client(BUYER_ID)


@pytest.fixture(scope="session")
def sales():
    return _client(SALES_ID)


@pytest.fixture(scope="session")
def anon():
    return requests.Session()


@pytest.fixture(scope="session", autouse=True)
def cleanup_test_catalog():
    """Remove TEST_ products/categories after the run so they don't pollute the storefront menu."""
    yield
    from dotenv import load_dotenv
    from pymongo import MongoClient
    load_dotenv("/app/backend/.env")
    db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    db.products.delete_many({"name": {"$regex": "^TEST_"}})
    db.categories.delete_many({"name": {"$regex": "^TEST_"}})
