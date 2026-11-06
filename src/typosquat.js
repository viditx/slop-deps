// Typosquat detection engine — bundled popular-package corpus, confusable-character
// normalization, and edit-distance matching. Zero network, zero dependencies.

const CONFUSABLES = { '0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's', '7': 't', '$': 's' };
const DIGRAPHS = [['rn', 'm'], ['vv', 'w'], ['cl', 'd'], ['cj', 'g'], ['nn', 'm']];

// Most-installed / most-imitated packages. Typosquats live one or two edits away
// from these names, so they form the comparison corpus.
const NPM_POPULAR = [
  // frameworks & view
  'react', 'react-dom', 'react-router', 'react-query', 'preact', 'vue', 'vue-router',
  'angular', 'svelte', 'solid-js', 'lit', 'alpinejs', 'next', 'nuxt', 'gatsby', 'remix',
  'jquery', 'jquery-ui', 'bootstrap', 'tailwindcss', 'styled-components', 'emotion',
  // language & build
  'typescript', 'tslib', 'webpack', 'webpack-cli', 'vite', 'rollup', 'esbuild', 'gulp',
  'grunt', 'babel-core', 'babel-loader', 'eslint', 'stylelint', 'prettier', 'postcss',
  'sass', 'less', 'autoprefixer', 'esbuild', 'swc',
  // testing
  'jest', 'mocha', 'chai', 'vitest', 'ava', 'tape', 'karma', 'sinon', 'nock', 'supertest',
  'nyc', 'c8', 'playwright', 'puppeteer', 'cypress',
  // utilities
  'lodash', 'lodash-es', 'underscore', 'ramda', 'rxjs', 'async', 'bluebird', 'classnames',
  'clsx', 'deepmerge', 'deep-equal', 'uuid', 'nanoid', 'chalk', 'colors', 'kleur',
  'picocolors', 'debug', 'ms', 'moment', 'moment-timezone', 'dayjs', 'date-fns',
  'commander', 'yargs', 'minimist', 'inquirer', 'prompts', 'fuse.js', 'marked',
  'markdown-it', 'highlight.js', 'prismjs',
  // network & server
  'express', 'fastify', 'koa', 'connect', 'compression', 'cors', 'helmet', 'morgan',
  'body-parser', 'multer', 'busboy', 'serve-static', 'http-proxy', 'http-proxy-middleware',
  'axios', 'node-fetch', 'got', 'superagent', 'request', 'request-promise', 'ws',
  'socket.io', 'socket.io-client', 'express-session', 'form-data', 'qs', 'query-string',
  // data & databases
  'mongoose', 'sequelize', 'typeorm', 'prisma', 'knex', 'mysql', 'mysql2', 'pg',
  'mongodb', 'redis', 'ioredis', 'elasticsearch', 'graphql', 'apollo-server',
  // auth & crypto
  'jsonwebtoken', 'bcrypt', 'bcryptjs', 'passport', 'passport-local', 'passport-oauth2',
  'crypto-js', 'elliptic', 'md5', 'sha.js', 'cookie-parser', 'oauth',
  // python-bridge & ai sdk
  'openai', 'langchain', 'xml2js',
  // scraping & dom
  'cheerio', 'jsdom', 'xhr2', 'd3',
  // linting of content
  'xss', 'sanitize-html', 'dompurify', 'validator', 'ajv', 'zod', 'yup',
  // process & env
  'nodemon', 'pm2', 'concurrently', 'cross-env', 'rimraf', 'glob', 'mkdirp', 'fs-extra',
  'dotenv', 'config', 'serve', 'http-server', 'live-server', 'ngrok', 'node-cron', 'cron',
  // mail & misc services
  'nodemailer', 'stripe', 'twilio', 'aws-sdk',
  // historically imitated (famous supply-chain incidents)
  'left-pad', 'ua-parser-js', 'node-ipc', 'coa', 'rc', 'event-stream', 'colors'
];

const PYPI_POPULAR = [
  // http & networking
  'requests', 'urllib3', 'httpx', 'aiohttp', 'httplib2', 'certifi', 'idna', 'chardet',
  'requests-oauthlib', 'oauthlib', 'google-auth', 'websockets',
  // data science
  'numpy', 'pandas', 'scipy', 'matplotlib', 'seaborn', 'plotly', 'bokeh', 'statsmodels',
  'networkx', 'sympy', 'xgboost', 'lightgbm', 'joblib', 'dask', 'optuna',
  // ml & ai
  'scikit-learn', 'tensorflow', 'torch', 'keras', 'transformers', 'datasets',
  'accelerate', 'openai', 'anthropic', 'langchain', 'sentence-transformers',
  'opencv-python', 'pillow', 'pytesseract', 'easyocr',
  // web frameworks
  'django', 'djangorestframework', 'flask', 'flask-cors', 'flask-sqlalchemy', 'fastapi',
  'starlette', 'uvicorn', 'gunicorn', 'tornado', 'bottle', 'werkzeug', 'jinja2',
  'markupsafe', 'itsdangerous',
  // databases & queues
  'sqlalchemy', 'alembic', 'psycopg2-binary', 'pymongo', 'redis', 'celery', 'rq',
  'dramatiq', 'kombu', 'pyodbc', 'neo4j', 'elasticsearch', 'pyamqp',
  // dev tooling
  'pytest', 'pytest-cov', 'pytest-mock', 'black', 'tox', 'ruff', 'mypy', 'isort',
  'coverage', 'virtualenv', 'pipenv', 'poetry', 'autopep8', 'flake8', 'pre-commit',
  // cli & ui
  'click', 'typer', 'rich', 'textual', 'tqdm', 'prompt-toolkit',
  // parsing & formats
  'beautifulsoup4', 'lxml', 'pyyaml', 'toml', 'tomli', 'orjson', 'ujson', 'msgpack',
  'openpyxl', 'xlrd', 'pypdf', 'reportlab', 'fpdf', 'python-docx', 'python-pptx',
  'protobuf', 'grpcio',
  // security & crypto
  'cryptography', 'paramiko', 'pyjwt', 'pynacl', 'pycryptodome', 'certbot',
  'sentry-sdk', 'prometheus-client',
  // date & misc
  'pytz', 'arrow', 'pendulum', 'python-dateutil', 'six', 'python-dotenv', 'attrs',
  'pydantic', 'marshmallow', 'structlog', 'loguru', 'anyio', 'trio', 'greenlet',
  'uvloop', 'gevent', 'watchdog', 'supervisor', 'httpie', 'stripe', 'twilio',
  'sendgrid', 'boto3', 'firebase-admin', 'google-api-python-client',
  'google-cloud-storage', 'selenium', 'playwright', 'scrapy',
  // games & media
  'pygame', 'kivy', 'pyaudio', 'numpy', 'moviepy',
  // packaging legacy
  'pip', 'setuptools', 'wheel'
];


const RUST_POPULAR = [
  'serde', 'serde_json', 'serde_yaml', 'tokio', 'tokio-util', 'futures', 'async-std',
  'clap', 'structopt', 'anyhow', 'thiserror', 'eyre', 'log', 'env_logger', 'tracing',
  'reqwest', 'hyper', 'axum', 'actix-web', 'actix-rt', 'rocket', 'warp',
  'sqlx', 'diesel', 'sea-orm', 'rusqlite', 'mongodb', 'redis',
  'rand', 'rand_core', 'uuid', 'chrono', 'time', 'regex', 'itertools',
  'rayon', 'crossbeam', 'parking_lot', 'once_cell', 'lazy_static', 'bitflags',
  'bytes', 'byteorder', 'num', 'num-traits', 'num-bigint',
  'base64', 'hex', 'sha2', 'sha1', 'md5', 'hmac', 'ring', 'rustls', 'openssl',
  'native-tls', 'webpki', 'jsonwebtoken', 'argon2', 'bcrypt', 'scrypt',
  'url', 'percent-encoding', 'mime', 'http', 'cookie',
  'indicatif', 'dialoguer', 'crossterm', 'ratatui', 'termion',
  'egui', 'eframe', 'iced', 'bevy', 'winit', 'wgpu', 'image', 'ndarray', 'polars',
  'pyo3', 'neon', 'napi', 'wasm-bindgen', 'web-sys', 'js-sys', 'console_error_panic_hook',
  'cargo_metadata', 'semver', 'glob', 'walkdir', 'tempfile', 'fs_extra', 'dirs',
  'tar', 'zip', 'flate2', 'csv', 'ron', 'toml', 'config', 'dotenvy'
];

const CORPUS = {
  cargo: [...new Set(RUST_POPULAR)].map(canonical => ({ canonical, normalized: normalizeName(canonical) })),
  npm: [...new Set(NPM_POPULAR)].map(canonical => ({ canonical, normalized: normalizeName(canonical) })),
  pypi: [...new Set(PYPI_POPULAR)].map(canonical => ({ canonical, normalized: normalizeName(canonical) }))
};

const CORPUS_EXACT = {
  npm: new Set(NPM_POPULAR),
  pypi: new Set(PYPI_POPULAR),
  cargo: new Set(RUST_POPULAR)
};

function normalizeName(name) {
  let s = name.toLowerCase().replace(/[-_.\s]/g, '');
  s = s.replace(/[013457$]/g, ch => CONFUSABLES[ch]);
  for (const [from, to] of DIGRAPHS) {
    s = s.split(from).join(to);
  }
  return s;
}

function editDistance(a, b) {
  // Damerau-Levenshtein (optimal string alignment): substitutions, insertions,
  // deletions and adjacent transpositions ('reqeusts' -> 'requests' costs 1).
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev2 = null;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    // fresh row each iteration: reusing buffers makes prev2 alias curr and
    // curr[0] would corrupt the transposition source two rows back
    const curr = new Array(n + 1);
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        const twoBack = (prev2 ?? prev)[j - 2] + 1;
        if (twoBack < curr[j]) curr[j] = twoBack;
      }
    }
    prev2 = prev;
    prev = curr;
  }
  return prev[n];
}

function isCloseVariant(distance, nameLength) {
  if (distance === 0) return false;
  if (distance === 1) return nameLength >= 4;
  if (distance === 2) return nameLength >= 8;
  return false;
}

// Runtime corpus extension for .slopdepsrc.json (private registries, team stacks)
export function addPopularEntries(ecosystem, names) {
  if (!CORPUS_EXACT[ecosystem] || !Array.isArray(names)) return;
  for (const name of names) {
    if (typeof name !== 'string') continue;
    const canonical = name.trim().toLowerCase();
    if (!canonical) continue;
    if (!CORPUS_EXACT[ecosystem].has(canonical)) {
      CORPUS_EXACT[ecosystem].add(canonical);
      CORPUS[ecosystem].push({ canonical, normalized: normalizeName(canonical) });
    }
  }
}

// Merge auto-generated corpus (src/corpus.generated.js) if present
try {
  // eslint-disable-next-line no-undef
  const generated = await import('./corpus.generated.js');
  addPopularEntries('npm', generated.NPM_GENERATED || []);
  addPopularEntries('pypi', generated.PYPI_GENERATED || []);
} catch {
  // generated corpus not built yet — curated corpus still active
}

export function corpusSize(ecosystem) {
  return CORPUS[ecosystem] ? CORPUS[ecosystem].length : 0;
}

// Membership check without scoring — offline/privacy mode uses this to verify
// popular packages straight from the bundled corpus with zero network calls.
export function isPopularPackage(name, ecosystem) {
  if (!name || !CORPUS_EXACT[ecosystem]) return false;
  // Scoped packages must match their exact scoped name; stripping scopes allows
  // malicious packages like @evil/lodash to masquerade as popular packages offline.
  return CORPUS_EXACT[ecosystem].has(name.toLowerCase());
}
export function findTyposquatCandidate(name, ecosystem, ageDays = Infinity) {
  const corpus = CORPUS[ecosystem];
  if (!corpus || !name) return null;

  // A corpus member is popular in its own right — never flag one giant as a squat of another ('react' vs 'preact').
  if (CORPUS_EXACT[ecosystem]?.has(name.toLowerCase())) return null;

  // Compare the package part after any scope; a scoped name cannot typosquat an
  // unscoped popular package and vice versa.
  const bare = ecosystem === 'npm' && name.startsWith('@') ? name.slice(name.indexOf('/') + 1) : name;
  if (!name.startsWith('@') && CORPUS_EXACT[ecosystem]?.has(bare.toLowerCase())) return null;
  const normalized = normalizeName(bare);

  let best = null;
  for (const entry of corpus) {
    // Only the popular package itself is exempt; a different raw name that
    // normalizes identically ('m0rgan' vs 'morgan') is a lookalike squat.
    if (bare === entry.canonical) continue;
    const distance = editDistance(normalized, entry.normalized);
    const variant = distance === 0 || isCloseVariant(distance, entry.normalized.length);
    if (!variant) continue;
    if (!best || distance < best.distance) {
      best = { canonical: entry.canonical, distance };
    }
  }
  if (!best) return null;

  const established = Number.isFinite(ageDays) && ageDays >= 365;
  return {
    ...best,
    severity: established ? 'suggestion' : 'suspect'
  };
}

// "Did you mean" text for names that turned out not to exist.
export function typosquatSuggestion(name, ecosystem) {
  const candidate = findTyposquatCandidate(name, ecosystem);
  if (!candidate || candidate.distance > 1) return null;
  return candidate.canonical;
}
