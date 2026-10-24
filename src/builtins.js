export const NODE_BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
  'events', 'fs', 'fs/promises', 'http', 'http2', 'https', 'inspector',
  'module', 'net', 'os', 'path', 'path/posix', 'path/win32', 'perf_hooks',
  'process', 'punycode', 'querystring', 'readline', 'repl', 'stream',
  'stream/promises', 'stream/web', 'string_decoder', 'sys', 'timers',
  'timers/promises', 'tls', 'trace_events', 'tty', 'url', 'util',
  'util/types', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
  'test', 'assert/strict', 'dns/promises', 'inspector/promises',
  'sqlite', 'stream/consumers', 'readline/promises', 'test/reporters', 'sea',
  'sidecar_sdk'
]);

export const PYTHON_BUILTINS = new Set([
  'abc', 'argparse', 'array', 'ast', 'asynchat', 'asyncio', 'asyncore',
  'atexit', 'audioop', 'base64', 'bdb', 'binascii', 'binhex', 'bisect',
  'builtins', 'bz2', 'calendar', 'cgi', 'cgitb', 'chunk', 'cmath',
  'cmd', 'code', 'codecs', 'codeop', 'collections', 'colorsys', 'compileall',
  'concurrent', 'configparser', 'contextlib', 'contextvars', 'copy', 'copyreg',
  'cprofile', 'crypt', 'csv', 'ctypes', 'curses', 'dataclasses', 'datetime',
  'dbm', 'decimal', 'difflib', 'dis', 'distutils', 'doctest', 'email',
  'encodings', 'ensurepip', 'enum', 'errno', 'faulthandler', 'fcntl',
  'filecmp', 'fileinput', 'fnmatch', 'fractions', 'ftplib', 'functools',
  'gc', 'getopt', 'getpass', 'gettext', 'glob', 'graphlib', 'grp',
  'gzip', 'hashlib', 'heapq', 'hmac', 'html', 'http', 'imaplib',
  'imghdr', 'imp', 'importlib', 'inspect', 'io', 'ipaddress', 'itertools',
  'json', 'keyword', 'lib2to3', 'linecache', 'locale', 'logging', 'lzma',
  'mailbox', 'mailcap', 'marshal', 'math', 'mimetypes', 'mmap', 'modulefinder',
  'msilib', 'msvcrt', 'multiprocessing', 'netrc', 'nis', 'nntplib',
  'numbers', 'operator', 'optparse', 'os', 'ossaudiodev', 'pathlib',
  'pdb', 'pickle', 'pickletools', 'pipes', 'pkgutil', 'platform', 'plistlib',
  'poplib', 'posix', 'posixpath', 'pprint', 'profile', 'pstats', 'pty',
  'pwd', 'py_compile', 'pyclbr', 'pydoc', 'queue', 'quopri', 'random',
  're', 'readline', 'reprlib', 'resource', 'rlcompleter', 'runpy', 'sched',
  'secrets', 'select', 'selectors', 'shelve', 'shlex', 'shutil', 'signal',
  'site', 'smtpd', 'smtplib', 'sndhdr', 'socket', 'socketserver', 'spwd',
  'sqlite3', 'ssl', 'stat', 'statistics', 'string', 'stringprep', 'struct',
  'subprocess', 'sunau', 'symbol', 'symtable', 'sys', 'sysconfig', 'syslog',
  'tabnanny', 'tarfile', 'telnetlib', 'tempfile', 'termios', 'test', 'textwrap',
  'threading', 'time', 'timeit', 'tkinter', 'token', 'tokenize', 'trace',
  'traceback', 'tracemalloc', 'tty', 'turtle', 'turtledemo', 'types',
  'typing', 'unicodedata', 'unittest', 'urllib', 'uu', 'uuid', 'venv',
  'warnings', 'wave', 'weakref', 'webbrowser', 'winreg', 'winsound',
  'wsgiref', 'xdrlib', 'xml', 'xmlrpc', 'zipapp', 'zipfile', 'zipimport',
  'zlib', 'zoneinfo', 'tomllib',
  'pip', 'setuptools', 'antigravity',
  'bmesh', 'bpy', 'mathutils', 'gpu', 'aud', 'sidecar_sdk',
  'and', 'or', 'in', 'not', 'python_version', 'platform_system', 'os_name',
  '__future__', '__main__', 'nt'
]);

export const RUST_BUILTINS = new Set([
  'std', 'core', 'alloc', 'proc_macro', 'test', 'bench', 'rustc_std_workspace_core',
  'proc_macro2', 'quote', 'syn' // build-time universals pulled via macros, not Cargo lines
]);

const EXTRA_BUILTINS = { npm: new Set(), pypi: new Set(), cargo: new Set() };

// Runtime extension for .slopdepsrc.json (private toolchains, internal SDKs)
export function extendBuiltins(ecosystem, names) {
  if (!EXTRA_BUILTINS[ecosystem] || !Array.isArray(names)) return;
  for (const name of names) {
    if (typeof name === 'string' && name.trim()) {
      EXTRA_BUILTINS[ecosystem].add(name.trim().toLowerCase());
    }
  }
}

export function isBuiltin(pkgName, ecosystem) {
  if (ecosystem === 'npm') {
    const clean = pkgName.startsWith('node:') ? pkgName.slice(5) : pkgName;
    return NODE_BUILTINS.has(clean) || EXTRA_BUILTINS.npm.has(clean.toLowerCase());
  }
  if (ecosystem === 'pypi') {
    const lower = pkgName.toLowerCase();
    // All _-prefixed names are C-level stdlib internals (_thread, _collections_abc, etc.)
    if (lower.startsWith('_')) return true;
    return PYTHON_BUILTINS.has(lower) || EXTRA_BUILTINS.pypi.has(lower);
  }
  if (ecosystem === 'cargo') {
    const lower = pkgName.toLowerCase();
    return RUST_BUILTINS.has(lower) || EXTRA_BUILTINS.cargo.has(lower);
  }
  return false;
}
