const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const sanitizeHtml = require('sanitize-html');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Directories ──
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const RECIPE_PAGES_DIR = path.join(__dirname, 'public', 'recipes');
const DATA_DIR = path.join(__dirname, 'data');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(RECIPE_PAGES_DIR, { recursive: true });

// ── Database setup (sql.js — pure JS, no native compilation) ──
const DB_PATH = path.join(DATA_DIR, 'recipes.db');
let db;
let dbReady = false;

async function initDb() {
  const SQL = await initSqlJs();

  // Load existing DB or create new
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      recipe_name TEXT NOT NULL,
      display_name TEXT DEFAULT '',
      origin TEXT DEFAULT '',
      story TEXT DEFAULT '',
      serves TEXT NOT NULL,
      prep_time TEXT NOT NULL,
      cook_time TEXT NOT NULL,
      difficulty TEXT DEFAULT '',
      ingredients TEXT NOT NULL,
      method TEXT NOT NULL,
      serve_with TEXT DEFAULT '',
      dietary TEXT DEFAULT '[]',
      allergens TEXT DEFAULT '[]',
      photo TEXT DEFAULT '',
      email TEXT NOT NULL,
      status TEXT DEFAULT 'approved',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_recipes_status ON recipes(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_recipes_slug ON recipes(slug)`);

  saveDb();
  dbReady = true;
  console.log('✅ Database initialized');
}

function saveDb() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// ── Slug generator ──
function generateSlug(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .substring(0, 80);
}

function uniqueSlug(name) {
  let slug = generateSlug(name);
  let suffix = 0;
  const existing = db.exec(`SELECT slug FROM recipes WHERE slug LIKE '${slug}%'`);
  const taken = new Set();
  if (existing.length > 0 && existing[0].values) {
    existing[0].values.forEach(row => taken.add(row[0]));
  }
  while (taken.has(slug)) {
    suffix++;
    slug = generateSlug(name) + '-' + suffix;
  }
  return slug;
}

// ── Photo upload config ──
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
      return cb(new Error('Only JPG and PNG files are allowed'));
    }
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e6) + ext;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.jpg', '.jpeg', '.png'].includes(ext) && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG and PNG files are allowed'));
    }
  }
});

// ── Middleware ──
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Sanitize text input ──
function sanitize(text) {
  return sanitizeHtml(text, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard'
  }).trim();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── API: Submit recipe ──
app.post('/api/recipes', upload.single('photo'), (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'Database not ready' });

  try {
    const { recipeName, displayName, origin, story, serves, prepTime, cookTime,
            difficulty, ingredients, method, serveWith, dietary, allergens, email, permission } = req.body;

    // Validate required fields
    if (!recipeName || !serves || !prepTime || !cookTime || !ingredients || !method || !email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!permission || permission !== 'on') {
      return res.status(400).json({ error: 'Permission to publish is required' });
    }

    // Validate email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // Validate photo
    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Only JPG and PNG images are allowed' });
      }
    }

    const slug = uniqueSlug(recipeName);
    const dietaryList = Array.isArray(dietary) ? dietary : (dietary ? [dietary] : []);
    const allergenList = Array.isArray(allergens) ? allergens : (allergens ? [allergens] : []);
    const photoPath = req.file ? `/uploads/${req.file.filename}` : '';

    db.run(`
      INSERT INTO recipes (slug, recipe_name, display_name, origin, story, serves,
        prep_time, cook_time, difficulty, ingredients, method, serve_with,
        dietary, allergens, photo, email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      slug,
      sanitize(recipeName),
      sanitize(displayName || ''),
      sanitize(origin || ''),
      sanitize(story || ''),
      sanitize(serves),
      sanitize(prepTime),
      sanitize(cookTime),
      difficulty || '',
      sanitize(ingredients),
      sanitize(method),
      sanitize(serveWith || ''),
      JSON.stringify(dietaryList),
      JSON.stringify(allergenList),
      photoPath,
      email.toLowerCase().trim()
    ]);

    saveDb();

    // Get the inserted ID
    const result = db.exec('SELECT last_insert_rowid() as id');
    const id = result[0].values[0][0];

    // Generate static recipe page
    generateRecipePage(slug);

    res.json({ success: true, slug, id });
  } catch (err) {
    console.error('Recipe submission error:', err);
    res.status(500).json({ error: 'Failed to submit recipe' });
  }
});

// ── API: Search recipes ──
app.get('/api/recipes', (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'Database not ready' });

  const { q, dietary, difficulty, sort, page = 1, limit = 12 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let where = ["status = 'approved'"];
  let params = [];

  if (q) {
    where.push('(recipe_name LIKE ? OR origin LIKE ? OR story LIKE ? OR ingredients LIKE ? OR method LIKE ?)');
    const term = `%${q}%`;
    params.push(term, term, term, term, term);
  }

  if (dietary) {
    const diets = dietary.split(',');
    diets.forEach(d => {
      where.push('dietary LIKE ?');
      params.push(`%"${d}"%`);
    });
  }

  if (difficulty) {
    where.push('difficulty = ?');
    params.push(difficulty);
  }

  const whereClause = where.join(' AND ');

  let orderBy = 'created_at DESC';
  if (sort === 'name') orderBy = 'recipe_name ASC';
  if (sort === 'oldest') orderBy = 'created_at ASC';

  const countResult = db.exec(`SELECT COUNT(*) as total FROM recipes WHERE ${whereClause}`);
  const total = countResult.length > 0 ? countResult[0].values[0][0] : 0;

  // Build parameterized query
  const allParams = [...params, parseInt(limit), offset];
  const recipesResult = db.exec(`
    SELECT id, slug, recipe_name, display_name, origin, story, serves,
      prep_time, cook_time, difficulty, dietary, allergens, photo, created_at
    FROM recipes WHERE ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `);

  const recipes = [];
  if (recipesResult.length > 0 && recipesResult[0].values) {
    const cols = recipesResult[0].columns;
    recipesResult[0].values.forEach(row => {
      const obj = {};
      cols.forEach((col, i) => obj[col] = row[i]);
      obj.dietary = JSON.parse(obj.dietary || '[]');
      obj.allergens = JSON.parse(obj.allergens || '[]');
      obj.photo = obj.photo || null;
      obj.story = obj.story ? obj.story.substring(0, 150) + (obj.story.length > 150 ? '…' : '') : null;
      recipes.push(obj);
    });
  }

  res.json({
    recipes,
    total,
    page: parseInt(page),
    totalPages: Math.ceil(total / parseInt(limit))
  });
});

// ── API: Get single recipe ──
app.get('/api/recipes/:slug', (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'Database not ready' });

  const result = db.exec(`
    SELECT id, slug, recipe_name, display_name, origin, story, serves,
      prep_time, cook_time, difficulty, ingredients, method, serve_with,
      dietary, allergens, photo, created_at
    FROM recipes WHERE slug = ? AND status = 'approved'
  `);

  if (result.length === 0 || result[0].values.length === 0) {
    return res.status(404).json({ error: 'Recipe not found' });
  }

  const cols = result[0].columns;
  const row = result[0].values[0];
  const recipe = {};
  cols.forEach((col, i) => recipe[col] = row[i]);
  recipe.dietary = JSON.parse(recipe.dietary || '[]');
  recipe.allergens = JSON.parse(recipe.allergens || '[]');

  res.json(recipe);
});

// ── API: Stats ──
app.get('/api/stats', (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'Database not ready' });

  const totalResult = db.exec("SELECT COUNT(*) as count FROM recipes WHERE status = 'approved'");
  const total = totalResult.length > 0 ? totalResult[0].values[0][0] : 0;

  const originsResult = db.exec("SELECT COUNT(DISTINCT origin) as count FROM recipes WHERE status = 'approved' AND origin != ''");
  const origins = originsResult.length > 0 ? originsResult[0].values[0][0] : 0;

  res.json({ totalRecipes: total, uniqueOrigins: origins });
});

// ── Generate static recipe page for SEO ──
function generateRecipePage(slug) {
  try {
    const result = db.exec(`SELECT * FROM recipes WHERE slug = ? AND status = 'approved'`);
    if (result.length === 0 || result[0].values.length === 0) return;

    const cols = result[0].columns;
    const row = result[0].values[0];
    const recipe = {};
    cols.forEach((col, i) => recipe[col] = row[i]);

    const dietary = JSON.parse(recipe.dietary || '[]');
    const allergens = JSON.parse(recipe.allergens || '[]');

    const ingredientsLines = (recipe.ingredients || '').split('\n').filter(l => l.trim());
    const methodLines = (recipe.method || '').split('\n').filter(l => l.trim());

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(recipe.recipe_name)} — Community Recipe Book</title>
<meta name="description" content="${escapeHtml(recipe.story || recipe.recipe_name + ' — a community recipe')}">
<meta property="og:title" content="${escapeHtml(recipe.recipe_name)}">
<meta property="og:description" content="${escapeHtml(recipe.story || 'A community recipe')}">
${recipe.photo ? `<meta property="og:image" content="${escapeHtml(recipe.photo)}">` : ''}
<meta property="og:type" content="article">
<link rel="canonical" href="/recipe/${escapeHtml(slug)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Source+Sans+3:wght@300;400;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/style.css">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Recipe",
  "name": ${JSON.stringify(recipe.recipe_name)},
  ${recipe.display_name ? `"author": {"@type": "Person", "name": ${JSON.stringify(recipe.display_name)}},` : ''}
  ${recipe.origin ? `"recipeCuisine": ${JSON.stringify(recipe.origin)},` : ''}
  "recipeYield": ${JSON.stringify(recipe.serves)},
  "prepTime": ${JSON.stringify(recipe.prep_time)},
  "cookTime": ${JSON.stringify(recipe.cook_time)},
  ${recipe.difficulty ? `"recipeCategory": ${JSON.stringify(recipe.difficulty)},` : ''}
  "recipeIngredient": ${JSON.stringify(ingredientsLines)},
  "recipeInstructions": ${JSON.stringify(methodLines.map((m, i) => ({"@type": "HowToStep", "position": i + 1, "text": m})))}
  ${recipe.photo ? `,"image": ${JSON.stringify(recipe.photo)}` : ''}
}
</script>
</head>
<body>
<nav class="nav">
  <a href="/" class="nav-brand">🥟 Community Recipe Book</a>
  <div class="nav-links">
    <a href="/">Browse</a>
    <a href="/submit.html">Submit</a>
  </div>
</nav>
<main class="recipe-detail">
  <a href="/" class="back-link">← Back to all recipes</a>
  ${recipe.photo ? `<img src="${escapeHtml(recipe.photo)}" alt="${escapeHtml(recipe.recipe_name)}" class="recipe-detail-image">` : `<div class="recipe-detail-placeholder">🥘</div>`}
  <h1>${escapeHtml(recipe.recipe_name)}</h1>
  <div class="meta">
    ${recipe.display_name ? `<span>👤 ${escapeHtml(recipe.display_name)}</span>` : ''}
    ${recipe.origin ? `<span>🌍 ${escapeHtml(recipe.origin)}</span>` : ''}
    <span>👥 Serves ${escapeHtml(recipe.serves)}</span>
    <span>⏱ Prep: ${escapeHtml(recipe.prep_time)}</span>
    <span>🔥 Cook: ${escapeHtml(recipe.cook_time)}</span>
    ${recipe.difficulty ? `<span>📊 ${escapeHtml(recipe.difficulty)}</span>` : ''}
  </div>
  ${recipe.story ? `<div class="story">${escapeHtml(recipe.story)}</div>` : ''}
  ${dietary.length ? `<div class="recipe-card-tags">${dietary.map(d => `<span class="tag tag-dietary">${escapeHtml(d)}</span>`).join('')}</div>` : ''}
  ${allergens.length ? `<div class="recipe-card-tags" style="margin-top:8px">${allergens.map(a => `<span class="tag">${escapeHtml(a)}</span>`).join('')}</div>` : ''}
  <h2>Ingredients</h2>
  <div class="ingredients-list">${escapeHtml(recipe.ingredients)}</div>
  <h2>Method</h2>
  <div class="method-text">${escapeHtml(recipe.method)}</div>
  ${recipe.serve_with ? `<h2>Serve with</h2><div class="method-text">${escapeHtml(recipe.serve_with)}</div>` : ''}
  <p style="margin-top:32px;color:var(--ink-muted);font-size:0.85rem">Added ${new Date(recipe.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
</main>
<footer class="footer"><p>🥟 Community Recipe Book — Celebrating food, family &amp; culture</p></footer>
</body>
</html>`;

    fs.writeFileSync(path.join(RECIPE_PAGES_DIR, `${slug}.html`), html);
    console.log(`✅ Generated recipe page: ${slug}`);
  } catch (err) {
    console.error('Failed to generate recipe page:', err);
  }
}

// ── Serve submit page ──
app.get('/submit', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'submit.html'));
});

// ── Serve recipe detail via slug ──
app.get('/recipe/:slug', (req, res) => {
  const htmlPath = path.join(RECIPE_PAGES_DIR, `${req.params.slug}.html`);
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    res.redirect('/?recipe=' + req.params.slug);
  }
});

// ── Start ──
async function start() {
  await initDb();

  // Regenerate all static recipe pages on startup
  try {
    const result = db.exec("SELECT slug FROM recipes WHERE status = 'approved'");
    if (result.length > 0 && result[0].values) {
      result[0].values.forEach(row => generateRecipePage(row[0]));
      console.log(`✅ Regenerated ${result[0].values.length} recipe pages`);
    }
  } catch (err) {
    console.error('Failed to regenerate recipe pages:', err);
  }

  app.listen(PORT, () => {
    console.log(`🥟 Community Recipe Book running at http://localhost:${PORT}`);
  });
}

start();

// Graceful shutdown
process.on('SIGTERM', () => { saveDb(); process.exit(0); });
process.on('SIGINT', () => { saveDb(); process.exit(0); });