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
  ['grpc', 'grpcio']
]);

export function resolvePyPiDistributionName(importName) {
  const lower = importName.toLowerCase();
  if (PYPI_IMPORT_TO_DIST.has(lower)) {
    return PYPI_IMPORT_TO_DIST.get(lower);
  }

  // PEP 420 namespace packages: Google Cloud, Azure, OpenTelemetry
  if (lower.startsWith('google.cloud.')) {
    return `google-cloud-${lower.slice(13).replace(/_/g, '-')}`;
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
    return lower.replace(/\./g, '-');
  }

  return importName;
}
