// Mapping of common Python top-level import names to their canonical PyPI distribution names.
// Only real import≠dist mismatches belong here — PyPI normalizes case on its own.
export const PYPI_IMPORT_TO_DIST = new Map([
  ['pil', 'Pillow'],
  ['yaml', 'PyYAML'],
  ['cv2', 'opencv-python'],
  ['sklearn', 'scikit-learn'],
  ['bs4', 'beautifulsoup4'],
  ['dateutil', 'python-dateutil'],
  ['openssl', 'pyOpenSSL'],
  ['dotenv', 'python-dotenv'],
  ['jwt', 'PyJWT'],
  ['serial', 'pyserial'],
  ['git', 'GitPython'],
  ['bio', 'biopython'],
  ['magic', 'python-magic'],
  ['fitz', 'PyMuPDF'],
  ['crypto', 'pycryptodome'],
  ['cryptodome', 'pycryptodomex'],
  ['discord', 'discord.py'],
  ['telegram', 'python-telegram-bot'],
  ['slack_sdk', 'slack-sdk'],
  ['docx', 'python-docx'],
  ['pptx', 'python-pptx'],
  ['jose', 'python-jose'],
  ['dns', 'dnspython'],
  ['usb', 'pyusb'],
  ['win32api', 'pywin32'],
  ['win32con', 'pywin32'],
  ['win32gui', 'pywin32'],
  ['win32com', 'pywin32'],
  ['pythoncom', 'pywin32'],
  ['pkg_resources', 'setuptools'],
  ['tortoise', 'tortoise-orm'],
  ['opengl', 'PyOpenGL'],
  ['websocket', 'websocket-client'],
  ['attr', 'attrs'],
  ['multipart', 'python-multipart'],
  ['levenshtein', 'Levenshtein'],
  ['psycopg2', 'psycopg2-binary'],
  ['pydantic_core', 'pydantic-core'],
  ['pydantic_settings', 'pydantic-settings'],
  ['grpc', 'grpcio'],
  ['mysqldb', 'mysqlclient'],
  ['wx', 'wxPython'],
  ['llama_cpp', 'llama-cpp-python'],
  ['appium', 'Appium-Python-Client'],
  ['uuid_extensions', 'uuid7'],
  ['traceloop', 'traceloop-sdk'],
  ['pinecone', 'pinecone-client'],
  ['qdrant_client', 'qdrant-client'],
  ['sentence_transformers', 'sentence-transformers'],
  ['huggingface_hub', 'huggingface-hub'],
  ['playwright', 'playwright'],
  ['googleapiclient', 'google-api-python-client']
]);

const EXTRA_MAP = new Map();

// Runtime extension for .slopdepsrc.json (private distributions, internal forks)
export function extendImportMap(entries) {
  if (!entries || typeof entries !== 'object') return;
  for (const [importName, distName] of Object.entries(entries)) {
    if (typeof importName === 'string' && typeof distName === 'string' && distName.trim()) {
      EXTRA_MAP.set(importName.toLowerCase(), distName.trim());
    }
  }
}

export function resolvePyPiDistributionName(importName) {
  const lower = importName.toLowerCase();
  const extra = EXTRA_MAP.get(lower);
  if (extra) return extra;
  if (PYPI_IMPORT_TO_DIST.has(lower)) {
    return PYPI_IMPORT_TO_DIST.get(lower);
  }

  // Windows pywin32 modules (win32api, win32evtlog, win32gui, pythoncom, etc.)
  if (lower.startsWith('win32') || lower === 'pythoncom') {
    return 'pywin32';
  }

  // Google authentication and APIs
  if (lower.startsWith('google.oauth2') || lower.startsWith('google.auth')) {
    return 'google-auth';
  }

  // PEP 420 namespace packages: Google Cloud, Google AI, Azure, OpenTelemetry
  if (lower.startsWith('google.cloud.')) {
    return `google-cloud-${lower.slice(13).replace(/_/g, '-')}`;
  }
  if (lower.startsWith('google.ai.')) {
    return `google-ai-${lower.slice(10).replace(/_/g, '-')}`;
  }
  if (lower === 'google.protobuf') {
    return 'protobuf';
  }
  if (lower.startsWith('google.')) {
    return `google-${lower.slice(7).replace(/_/g, '-')}`;
  }
  if (lower.startsWith('azure.')) {
    return lower.replace(/\./g, '-');
  }
  if (lower.startsWith('opentelemetry.')) {
    // Core API submodules live in opentelemetry-api, SDK in opentelemetry-sdk.
    // The dots-to-dashes fallback would invent names like 'opentelemetry-trace' that 404 on PyPI.
    if (lower.startsWith('opentelemetry.sdk')) {
      return 'opentelemetry-sdk';
    }
    if (/^opentelemetry\.(?:trace|metrics|propagators|context|baggage|attributes|util|environment)$/.test(lower)) {
      return 'opentelemetry-api';
    }
    return lower.replace(/\./g, '-');
  }
  if (lower.startsWith('paho.')) {
    return lower.replace(/\./g, '-');
  }

  return importName;
}

export const normalizePypiName = resolvePyPiDistributionName;
