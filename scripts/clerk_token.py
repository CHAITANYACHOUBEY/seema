"""Print a short-lived Clerk session token for a test user id (preview/dev instance only)."""
import json
import os
import sys
import urllib.request

from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
SK = os.environ["CLERK_SECRET_KEY"]


def bapi(path, body):
    req = urllib.request.Request("https://api.clerk.com/v1" + path, data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": "Bearer " + SK, "Content-Type": "application/json", "User-Agent": "emergent-test"})
    return json.load(urllib.request.urlopen(req))


session = bapi("/sessions", {"user_id": sys.argv[1]})
print(bapi(f"/sessions/{session['id']}/tokens", {"expires_in_seconds": 3600})["jwt"])
