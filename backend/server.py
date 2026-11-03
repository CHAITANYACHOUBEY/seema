import logging
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from fastapi import FastAPI  # noqa: E402
from starlette.middleware.cors import CORSMiddleware  # noqa: E402
import os  # noqa: E402

from clerk_auth import clerk_router  # noqa: E402
from core import RETIRED_ROLES, client, db  # noqa: E402
from r_admin import router as admin_router  # noqa: E402
from r_catalog import router as catalog_router  # noqa: E402
from r_shop import router as shop_router  # noqa: E402
from seed import seed  # noqa: E402
from storage import init_storage  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Seema Enterprise API")
app.include_router(clerk_router)
app.include_router(catalog_router)
app.include_router(shop_router)
app.include_router(admin_router)


@app.get("/api/health")
async def health():
    return {"ok": True}


app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
                   allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def startup():
    for old, new in RETIRED_ROLES.items():
        await db.users.update_many({"role": old}, {"$set": {"role": new}})
    await seed()
    try:
        init_storage()
    except Exception as e:
        logger.error(f"Storage init failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
