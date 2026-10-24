const stage = document.querySelector("#reviewStage");
const dropZone = document.querySelector("#dropZone");
const fileInput = document.querySelector("#fileInput");
const pickButton = document.querySelector("#pickButton");
const demoButton = document.querySelector("#demoButton");
const speechText = document.querySelector("#speechText");
const stationStatus = document.querySelector("#stationStatus");
const statusText = document.querySelector("#statusText");
const readoutDot = document.querySelector("#readoutDot");
const fileCount = document.querySelector("#fileCount");
const screenMessage = document.querySelector("#screenMessage");
const screenStatus = document.querySelector("#screenStatus");
const screenPercent = document.querySelector("#screenPercent");
const screenProgress = document.querySelector("#screenProgress");
const eventList = document.querySelector("#eventList");
const eventCount = document.querySelector("#eventCount");
const reportPanel = document.querySelector("#reportPanel");
const reportLabel = document.querySelector("#reportLabel");
const reportTitle = document.querySelector("#reportTitle");
const reportDescription = document.querySelector("#reportDescription");
const reportScore = document.querySelector("#reportScore");
const reportStamp = document.querySelector("#reportStamp");
const reportButton = document.querySelector("#reportButton");
const reportDialog = document.querySelector("#reportDialog");
const dialogClose = document.querySelector("#dialogClose");
const dialogSummary = document.querySelector("#dialogSummary");
const dialogFindings = document.querySelector("#dialogFindings");
const dialogTime = document.querySelector("#dialogTime");
const fileCards = [...document.querySelectorAll(".file-card")];

const builtIns = new Set([
  "assert",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "timers",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
]);

const state = {
  token: 0,
  files: [],
  result: null,
  dragDepth: 0,
};

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

function setSpeech(message) {
  speechText.textContent = message;
}

function setProgress(value) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));
  screenProgress.style.width = `${safeValue}%`;
  screenPercent.textContent = `${String(safeValue).padStart(2, "0")}%`;
}

function setStatus({ station, readout, screen, message, dot = "idle" }) {
  stationStatus.textContent = station;
  statusText.textContent = readout;
  screenStatus.textContent = screen;
  screenMessage.textContent = message;
  readoutDot.className = `readout-dot ${dot === "idle" ? "" : `is-${dot}`}`;
}

function resetStage() {
  stage.classList.remove("is-hovering", "is-scratching", "is-scanning", "is-done");
  reportPanel.classList.remove("is-open");
  reportButton.disabled = true;
  reportLabel.textContent = "not yet";
  reportScore.textContent = "--";
  reportStamp.textContent = "PENDING";
  reportTitle.textContent = "The cat is waiting.";
  reportDescription.textContent = "Give her a folder and the envelope will come back with the suspicious bits circled.";
  dialogSummary.replaceChildren();
  dialogFindings.replaceChildren();
  setProgress(0);
}

function setQueuedFiles(files) {
  const names = files.slice(0, fileCards.length).map((file) => file.name.split(/[\\/]/).pop());

  fileCards.forEach((card, index) => {
    const name = card.querySelector("b");
    const icon = card.querySelector(".file-icon");
    const file = files[index];

    if (!file) {
      name.textContent = ["app.ts", "package.json", "worker.py"][index];
      icon.textContent = ["JS", "{}", "PY"][index];
      return;
    }

    const extension = file.name.split(".").pop()?.toUpperCase() || "TXT";
    name.textContent = names[index];
    icon.textContent = extension === "JSON" ? "{}" : extension.slice(0, 3);
  });
}

function addEvent(actor, message, muted = false) {
  const row = document.createElement("div");
  row.className = `event-row${muted ? " event-muted" : ""}`;

  const time = document.createElement("span");
  const now = new Date();
  time.textContent = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const who = document.createElement("b");
  who.textContent = actor;

  const copy = document.createElement("p");
  copy.textContent = message;

  row.append(time, who, copy);
  eventList.prepend(row);

  while (eventList.children.length > 7) {
    eventList.lastElementChild.remove();
  }

  eventCount.textContent = `${String(Math.min(99, eventList.children.length)).padStart(2, "0")} events`;
}

function packageName(specifier) {
  if (specifier.startsWith("@")) {
    return specifier.split("/").slice(0, 2).join("/");
  }

  return specifier.split("/")[0];
}

function isExternalPackage(specifier) {
  if (!specifier || specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("#")) {
    return false;
  }

  if (specifier.startsWith("node:")) {
    return false;
  }

  const root = packageName(specifier);
  return !builtIns.has(root);
}

function extractJavaScriptImports(source) {
  const imports = new Set();
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  patterns.forEach((pattern) => {
    for (const match of source.matchAll(pattern)) {
      if (isExternalPackage(match[1])) {
        imports.add(packageName(match[1]));
      }
    }
  });

  return [...imports];
}

function extractPythonImports(source) {
  const imports = new Set();
  const patterns = [
    /^\s*import\s+([A-Za-z0-9_.-]+)/gm,
    /^\s*from\s+([A-Za-z0-9_.-]+)\s+import/gm,
  ];

  patterns.forEach((pattern) => {
    for (const match of source.matchAll(pattern)) {
      const root = match[1].split(".")[0];
      if (!new Set(["asyncio", "collections", "datetime", "json", "math", "os", "pathlib", "re", "sys", "typing"]).has(root)) {
        imports.add(root);
      }
    }
  });

  return [...imports];
}

function readManifest(text, fileName) {
  const dependencies = new Set();

  if (fileName.endsWith("package.json")) {
    try {
      const manifest = JSON.parse(text);
      ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].forEach((key) => {
        Object.keys(manifest[key] || {}).forEach((dependency) => dependencies.add(packageName(dependency)));
      });
    } catch {
      return { dependencies, invalid: true };
    }
  }

  if (/requirements(?:[-_].*)?\.txt$/i.test(fileName)) {
    text.split(/\r?\n/).forEach((line) => {
      const match = line.trim().match(/^([A-Za-z0-9_.-]+)/);
      if (match && !line.trim().startsWith("#")) dependencies.add(match[1].toLowerCase());
    });
  }

  return { dependencies, invalid: false };
}

function isSourceFile(fileName) {
  return /\.(?:[cm]?[jt]sx?|vue|svelte|astro|py|pyi)$/i.test(fileName);
}

async function analyzeFiles(files) {
  const manifests = new Set();
  const sourceFiles = [];
  const findings = [];
  let scanned = 0;

  for (const file of files) {
    const fileName = file.name.toLowerCase();
    if (!/package\.json$|requirements(?:[-_].*)?\.txt$/i.test(fileName)) continue;

    try {
      const text = await file.text();
      const manifest = readManifest(text, fileName);
      manifest.dependencies.forEach((dependency) => manifests.add(dependency));
      if (manifest.invalid) {
        findings.push({ file: file.name, package: "package.json", detail: "invalid JSON manifest" });
      }
    } catch {
      findings.push({ file: file.name, package: "manifest", detail: "could not be read" });
    }
  }

  for (const file of files) {
    if (!isSourceFile(file.name) || file.size > 1_500_000) continue;
    try {
      const source = await file.text();
      sourceFiles.push({ file, source });
      scanned += 1;
    } catch {
      findings.push({ file: file.name, package: "source", detail: "could not be read" });
    }
  }

  for (const { file, source } of sourceFiles) {
    const isPython = /\.(?:py|pyi)$/i.test(file.name);
    const imports = isPython ? extractPythonImports(source) : extractJavaScriptImports(source);

    imports.forEach((dependency) => {
      const normalizedDependency = dependency.toLowerCase();
      const hasDependency = [...manifests].some((manifestDependency) => manifestDependency.toLowerCase() === normalizedDependency);
      if (!hasDependency) {
        findings.push({ file: file.name, package: dependency, detail: "import is missing from the manifest" });
      }
    });

    if (/\bTODO\b|FIXME\b/i.test(source)) {
      findings.push({ file: file.name, package: "unfinished note", detail: "TODO or FIXME left in source" });
    }
  }

  const uniqueFindings = findings.filter((finding, index, list) => {
    const key = `${finding.file}:${finding.package}:${finding.detail}`;
    return list.findIndex((candidate) => `${candidate.file}:${candidate.package}:${candidate.detail}` === key) === index;
  });

  return {
    files: files.length,
    scanned,
    findings: uniqueFindings,
    score: Math.max(0, 100 - uniqueFindings.length * 17),
  };
}

function createSampleFiles() {
  return [
    new File(
      [
        '{"name":"demo-app","dependencies":{"react":"19.0.0"}}',
      ],
      "package.json",
      { type: "application/json" },
    ),
    new File(
      [
        'import React from "react";\nimport { useTactileSpring } from "react-smooth-springs";\n\n// TODO: replace this before ship\nexport const App = () => <main>hello</main>;',
      ],
      "app.tsx",
      { type: "text/typescript" },
    ),
    new File(
      ['from cursed_utils import scan_project\n\nscan_project(".")'],
      "worker.py",
      { type: "text/x-python" },
    ),
  ];
}

function updateReport(result) {
  state.result = result;
  reportScore.textContent = String(result.score);
  reportLabel.textContent = `${result.findings.length} finding${result.findings.length === 1 ? "" : "s"}`;
  reportStamp.textContent = result.findings.length ? "REVIEW" : "CLEAN";
  reportTitle.textContent = result.findings.length ? "A few claws were needed." : "Purrfect. Nothing suspicious.";
  reportDescription.textContent = result.findings.length
    ? `${result.findings.length} thing${result.findings.length === 1 ? "" : "s"} deserve attention before this goes anywhere near install.`
    : "No missing imports or loose notes showed up in this local pass.";

  dialogSummary.replaceChildren();
  [
    [result.files, "files received"],
    [result.scanned, "source files"],
    [result.findings.length, "findings"],
  ].forEach(([value, label]) => {
    const cell = document.createElement("div");
    cell.className = "summary-cell";
    const strong = document.createElement("strong");
    strong.textContent = String(value);
    const span = document.createElement("span");
    span.textContent = label;
    cell.append(strong, span);
    dialogSummary.append(cell);
  });

  dialogFindings.replaceChildren();
  if (!result.findings.length) {
    const empty = document.createElement("p");
    empty.className = "finding-empty";
    empty.textContent = "No findings. The cat has nothing to scratch out.";
    dialogFindings.append(empty);
  } else {
    result.findings.slice(0, 12).forEach((finding) => {
      const row = document.createElement("div");
      row.className = "finding-row";
      const dot = document.createElement("i");
      const name = document.createElement("b");
      const detail = document.createElement("span");
      dot.setAttribute("aria-hidden", "true");
      name.textContent = `${finding.package} · ${finding.file}`;
      detail.textContent = finding.detail;
      row.append(dot, name, detail);
      dialogFindings.append(row);
    });
  }

  dialogTime.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

async function runScan(incomingFiles, isDemo = false) {
  const files = [...incomingFiles].filter((file) => file && typeof file.name === "string");
  if (!files.length) return;

  state.token += 1;
  const token = state.token;
  state.files = files;
  resetStage();
  setQueuedFiles(files);
  fileCount.textContent = `${files.length} file${files.length === 1 ? "" : "s"} queued`;
  stage.classList.add("is-hovering");
  setSpeech("meow. mine now.");
  setStatus({ station: "receiving", readout: "files received", screen: "RECEIVING FILES", message: "// the pile has landed", dot: "live" });
  addEvent("you", `${files.length} file${files.length === 1 ? "" : "s"} dropped${isDemo ? " from the sample tray" : " on the desk"}.`);

  await wait(650);
  if (token !== state.token) return;
  stage.classList.remove("is-hovering");
  stage.classList.add("is-scratching", "is-scanning");
  setSpeech("hold still. i am looking.");
  setStatus({ station: "reviewing", readout: "cat is scratching", screen: "INDEXING FILES", message: "// paws on keyboard", dot: "live" });
  addEvent("cat", "scratching the file pile.");
  setProgress(12);

  const analysisPromise = analyzeFiles(files);
  const progressTimer = window.setInterval(() => {
    const current = Number.parseInt(screenPercent.textContent, 10) || 12;
    if (current < 83) setProgress(current + (current < 40 ? 9 : 4));
  }, 270);

  await wait(520);
  if (token !== state.token) return;
  addEvent("cat", "reading the imports, one by one.");
  await wait(680);
  if (token !== state.token) return;
  addEvent("cat", "checking manifests against source.");

  const result = await analysisPromise;
  window.clearInterval(progressTimer);
  if (token !== state.token) return;

  setProgress(100);
  updateReport(result);
  stage.classList.remove("is-scratching", "is-scanning");
  stage.classList.add("is-done");
  setSpeech(result.findings.length ? "meowww. i found some claws." : "meowww. your work is clean.");
  setStatus({ station: "sealed", readout: "report is ready", screen: "REVIEW SEALED", message: result.findings.length ? "// suspicious bits circled" : "// nothing suspicious found", dot: "done" });
  addEvent("cat", result.findings.length ? `${result.findings.length} finding${result.findings.length === 1 ? "" : "s"} circled in red.` : "no suspicious imports found.");
  await wait(470);
  if (token !== state.token) return;
  reportPanel.classList.add("is-open");
  reportButton.disabled = false;
  addEvent("cat", "the envelope is sealed. open it.");
}

function chooseFiles() {
  fileInput.value = "";
  fileInput.click();
}

pickButton.addEventListener("click", chooseFiles);
demoButton.addEventListener("click", () => runScan(createSampleFiles(), true));
fileInput.addEventListener("change", (event) => runScan(event.target.files));

dropZone.addEventListener("click", (event) => {
  if (event.target.closest("button, a")) return;
  chooseFiles();
});

dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    chooseFiles();
  }
});

dropZone.addEventListener("dragenter", (event) => {
  event.preventDefault();
  state.dragDepth += 1;
  stage.classList.add("is-hovering");
  setSpeech("meow. give me ur files.");
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
});

dropZone.addEventListener("dragleave", (event) => {
  event.preventDefault();
  state.dragDepth = Math.max(0, state.dragDepth - 1);
  if (state.dragDepth === 0) stage.classList.remove("is-hovering");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  state.dragDepth = 0;
  stage.classList.remove("is-hovering");
  runScan(event.dataTransfer.files);
});

reportButton.addEventListener("click", () => {
  if (!state.result) return;
  if (typeof reportDialog.showModal === "function") {
    reportDialog.showModal();
  } else {
    reportDialog.setAttribute("open", "");
  }
});

dialogClose.addEventListener("click", () => {
  reportDialog.close();
});

reportDialog.addEventListener("click", (event) => {
  if (event.target === reportDialog) reportDialog.close();
});

window.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    chooseFiles();
  }
});

setQueuedFiles([]);

if (new URLSearchParams(window.location.search).has("demo")) {
  window.setTimeout(() => runScan(createSampleFiles(), true), 180);
}
