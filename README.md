# Mynotes

A self-hosted **handwriting notes app** — the core of GoodNotes, running as a single
Docker container on your TrueNAS Scale server and accessed through Tailscale.

Write with your finger, a mouse, or an **Apple Pencil on iPad Safari** (pressure
sensitive). Annotate PDFs, organize with folders and tags, search everything, and
export notebooks back to PDF.

| Feature | What it does |
|---|---|
| **Ink tools** | Pen (pressure-sensitive line width), highlighter (translucent, multiply blend), eraser (stroke-level), text tool |
| **Pages** | A4 pages with backgrounds: blank, ruled, grid, dots — change per page |
| **PDF import** | Upload a PDF → it becomes a notebook, one page per PDF page; draw/write on top |
| **Organization** | Notebooks in (nested) folders, colored tags, full-text search over all text items |
| **Navigation** | Page prev/next, add/delete/reorder pages, zoom in/out/fit |
| **Export** | Notebook or single page → PDF (ink + background + PDF page composited) |
| **Undo/redo** | Per page, also via Ctrl/Cmd+Z |

## Architecture

- **One container, one Node.js process** — no database server, no queue, nothing to babysit.
- Backend: **Fastify** + **better-sqlite3** (file-based `app.db`, WAL mode)
- Frontend: **Svelte 5** built with **Vite** + **Tailwind CSS 4**, served as static files by the backend (SPA fallback included)
- Ink engine: plain **Canvas 2D** — strokes are stored as pressure-tagged point lists in JSON and re-rendered as smooth quadratic curves; autosave after ~1 s of idle
- PDFs: rendered in the browser with **pdf.js** (the server only stores and serves the bytes); export composites each page to PNG with **pdf-lib**
- Access control: **none built in** — the app trusts its network boundary. Keep it behind Tailscale; anyone who can reach the port can use it.

```
Tailscale LAN ──► host port 3100 ──► mynotes container (Fastify + SQLite + static SPA)
```

## Repository layout

```
├── server/          Fastify API + SQLite
│   └── src/
│       ├── index.js # entrypoint (static hosting, listen)
│       ├── db.js    # schema + helpers
│       └── routes/  # folders, notebooks, pages, files (PDF upload), search
├── client/          Svelte 5 + Vite + Tailwind frontend
│   └── src/
│       ├── App.svelte
│       ├── components/  # Sidebar, Editor, Canvas (ink engine), NotebookModal, Icon
│       └── lib/         # api.js, engine/ink.js, pdf.js, export.js
├── .github/workflows/docker.yml  CI: builds & pushes the image to GHCR on every push to main
├── truenas.yaml                  Compose YAML for TrueNAS "Apps → Install via YAML"
├── Dockerfile       multi-stage: build frontend, run in node:22-alpine
├── docker-compose.yml            for the plain Docker-CLI deployment
└── package.json     npm workspaces + scripts
```

## Development (local)

Requires Node.js 20+ (22 recommended).

```bash
npm install
npm run dev:server   # API on http://localhost:3100
npm run dev:client   # Vite dev server on http://localhost:5173 (proxies /api)
```

Open http://localhost:5173. Production build: `npm run build` (outputs `client/dist`,
served by the API at http://localhost:3100).

## Deployment on TrueNAS Scale

Mynotes runs as a prebuilt Docker image from the **GitHub Container Registry**
(`ghcr.io/l385-glitch/mynotes`). Every push to `main` is built automatically by
GitHub Actions (`.github/workflows/docker.yml`) — nothing is built on the server.

### Option A: TrueNAS "Apps" (recommended)

Managed by the TrueNAS UI — you get the native **log viewer**,
**start/stop/restart** buttons and one-click **updates**.

1. TrueNAS UI: **Apps → Discover → ⋮ (three dots) → Install via YAML**.
2. Set **App name** to `mynotes`.
3. Paste the content of [`truenas.yaml`](truenas.yaml) into the YAML editor
   and click **Deploy**.

**Updating**

1. Push your code changes to GitHub (`git push`).
2. GitHub Actions builds and pushes the new image (a few minutes —
   watch it under the *Actions* tab of the repo).
3. TrueNAS UI: **Apps → Installed → mynotes → ⋮ → Update**.

### Option B: Docker CLI (alternative)

If you prefer managing the container from a shell:

```bash
ssh luca@<truenas-tailscale-ip>
sudo mkdir -p /var/docker/mynotes && sudo chown $USER /var/docker/mynotes
git clone https://github.com/L385-glitch/mynotes.git /var/docker/mynotes
cd /var/docker/mynotes
docker compose up -d --build
```

First build takes a couple of minutes (it compiles better-sqlite3 and the
frontend inside the image).

### Connect through Tailscale

Point your browser (or iPad Safari) at:

```
http://<truenas-tailscale-ip>:3100
```

No firewall rules, no reverse proxy, no TLS termination needed — Tailscale's
WireGuard tunnel provides encryption and access control.

## Usage notes

- **iPad**: open the URL in Safari, tap the page, and write with the Apple Pencil —
  pressure sensitivity works out of the box (the browser reports it per point).
  Pinch to zoom, two-finger drag to pan.
- **Desktop**: mouse/trackpad drawing, Ctrl+Z / Ctrl+Shift+Z for undo/redo,
  scroll to zoom (pinch on trackpad), drag with middle button or space+drag to pan.
- **Import a PDF**: *Import PDF* on the start screen (or in the sidebar) —
  the file is stored on the server and every page becomes an annotatable page.
- **Export**: the *Export PDF* button in the top bar renders the whole notebook
  (or the current page) to a downloadable PDF, including PDF backgrounds.
- **Search** (sidebar) covers all text items; handwriting itself is not OCR'd.
- **Data** lives in the mounted `data/` folder (`app.db` + `pdfs/`). Back it up
  by copying that folder.
