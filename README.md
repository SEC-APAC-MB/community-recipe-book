# 🥟 Community Recipe Book

A community recipe book website where festival attendees and food lovers can submit, browse, and search recipes from around the world.

## Features

- **Submit recipes** — 3–5 minute form with all 16 fields (recipe name, origin, story, dietary info, allergens, photo upload, etc.)
- **Auto-publish** — submitted recipes are automatically stored and published to a searchable blog
- **Search & filter** — full-text search across recipe names, ingredients, origins; filter by dietary info and difficulty
- **Recipe pages** — each recipe gets its own SEO-friendly page with structured data (Schema.org Recipe markup)
- **Photo uploads** — JPG/PNG upload with drag-and-drop support
- **Responsive** — works on mobile, tablet, and desktop
- **Warm design** — terracotta/saffron/cream palette with Playfair Display typography

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: SQLite (via better-sqlite3) — lightweight, no external DB needed
- **Search**: Server-side full-text search with fuzzy matching
- **Frontend**: Vanilla HTML/CSS/JS — no framework, fast and simple
- **Photo handling**: Multer for uploads, stored in `public/uploads/`
- **SEO**: Static recipe page generation + Schema.org structured data

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start

# Open in browser
open http://localhost:3000
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | 3000 | Server port |

## Project Structure

```
community-recipe-book/
├── server.js              # Express backend + API
├── package.json
├── public/
│   ├── index.html          # Browse/search recipes
│   ├── submit.html         # Recipe submission form
│   ├── css/style.css       # Full stylesheet
│   ├── uploads/            # User-uploaded photos
│   └── recipes/            # Auto-generated recipe pages
├── data/                   # SQLite database (auto-created)
└── README.md
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Browse/search recipes |
| `GET` | `/submit.html` | Recipe submission form |
| `GET` | `/recipe/:slug` | Single recipe page |
| `POST` | `/api/recipes` | Submit a new recipe |
| `GET` | `/api/recipes?q=&dietary=&difficulty=&page=&limit=` | Search/filter recipes |
| `GET` | `/api/recipes/:slug` | Get recipe JSON |
| `GET` | `/api/stats` | Recipe statistics |

## License

MIT