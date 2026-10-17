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
  return PYPI_IMPORT_TO_DIST.get(lower) || importName;
}
