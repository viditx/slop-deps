// Pure ESM PyPI normalization and alias map (zero Node builtin imports)

export const PYPI_IMPORT_MAP = {
  bs4: 'beautifulsoup4',
  cv2: 'opencv-python',
  pil: 'pillow',
  sklearn: 'scikit-learn',
  skimage: 'scikit-image',
  yaml: 'pyyaml',
  dotenv: 'python-dotenv',
  jwt: 'pyjwt',
  dateutil: 'python-dateutil',
  serial: 'pyserial',
  usb: 'pyusb',
  crypto: 'pycryptodome',
  nacl: 'pynacl',
   OpenSSL: 'pyopenssl',
  openssl: 'pyopenssl',
   fitz: 'pymupdf',
  wx: 'wxpython',
  gi: 'pygobject',
};

export function normalizePypiName(name) {
  if (!name) return '';
  const lower = String(name).trim().toLowerCase();
  if (PYPI_IMPORT_MAP[lower]) {
    return PYPI_IMPORT_MAP[lower];
  }
  return lower.replace(/[-_.]+/g, '-');
}
