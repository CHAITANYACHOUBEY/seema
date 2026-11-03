# Seema Enterprise website upgrade

This version keeps the existing React/FastAPI commerce architecture and gives the storefront a new industrial visual system.

## What changed

- Reworked the home page into a modern industrial fastener storefront.
- Added smoother Framer Motion entrance, hover and parallax interactions.
- Reworked navigation and mobile menu.
- Reworked product cards to match the new red / charcoal / white visual system.
- Reworked footer with business contact information and catalogue access.
- Updated the shop page styling for the new visual language.
- Added the Seema Enterprise logo asset at `frontend/public/seema-logo.png`.
- Removed the old Emergent page metadata and scripts from `frontend/public/index.html`.
- Corrected sample image references from `.jpg` to the actual `.jpeg` files.
- Updated fresh-seed company defaults with the supplied Seema Enterprise contact details.

## Run locally

### Frontend

```bash
cd frontend
yarn install
yarn start
```

### Backend

```bash
cd backend
pip install -r requirements.txt
python server.py
```

Set the existing environment variables used by the project, especially `REACT_APP_BACKEND_URL`, MongoDB configuration and Clerk configuration.

## Production

Build the frontend with:

```bash
yarn build
```

Serve the generated `frontend/build` directory behind HTTPS and point `REACT_APP_BACKEND_URL` at the production API.

The React Router application needs SPA fallback to `index.html` on the web server.
