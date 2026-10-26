// Data validation
// Normalize untrusted JSON once, before it reaches search, history, or rendering.
const MEMORY_RANKS = {"?": 0, Dormant: 1, Awakened: 2, Ascended: 3, Transcendent: 4, Supreme: 5, Sacred: 6, Divine: 7};
const MEMORY_TIERS = {"?": 0, I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7};

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function dataWarning(path, message) {
  console.warn(`[memories] ${path}: ${message}`);
}

function normalizeMemoryField(field, value, path) {
  if (field === "rank" || field === "tier") {
    const allowed = field === "rank" ? MEMORY_RANKS : MEMORY_TIERS;
    if (typeof value === "string" && Object.hasOwn(allowed, value)) return value;
    dataWarning(path, "required value is missing or invalid; using '?'.");
    return "?";
  }
  if (field === "enchantments") {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
      dataWarning(path, "expected an array; using [].");
      return [];
    }
    return value.map((entry, index) => normalizeEnchantment(entry, `${path}[${index}]`));
  }
  if (typeof value === "string" && (field !== "name" || value.trim())) return value;
  if (field === "name" || value !== undefined) {
    dataWarning(path, `${field === "name" ? "required value is missing or invalid" : "expected text"}; using a default.`);
  }
  return field === "name" ? "Unknown memory" : "";
}

function normalizeEnchantment(value, path, partial = false) {
  if (!isRecord(value)) {
    dataWarning(path, "expected an enchantment object; using defaults.");
    value = {};
  }
  const result = {};
  if (!partial || Object.hasOwn(value, "name")) {
    if (typeof value.name === "string" && value.name.trim()) result.name = value.name;
    else {
      dataWarning(`${path}.name`, "required value is missing or invalid; using 'Unknown enchantment'.");
      result.name = "Unknown enchantment";
    }
  }
  if (!partial || Object.hasOwn(value, "description")) {
    result.description = normalizeMemoryField("description", value.description, `${path}.description`);
  }
  if (!partial || Object.hasOwn(value, "passive")) {
    if (value.passive !== undefined && value.passive !== null && typeof value.passive !== "boolean") {
      dataWarning(`${path}.passive`, "expected a boolean; using null (unknown).");
    }
    result.passive = typeof value.passive === "boolean" ? value.passive : null;
  }
  return result;
}

function normalizeHistoryOperation(value, chapter, description, path) {
  if (!isRecord(value)) {
    dataWarning(path, "expected a history event; ignoring it.");
    return [];
  }
  const text = typeof value.description === "string" ? value.description : description;
  if (Object.hasOwn(value, "changes")) {
    if (!Array.isArray(value.changes)) {
      dataWarning(`${path}.changes`, "expected an array; using no changes.");
      return [];
    }
    return value.changes.flatMap((change, index) =>
      normalizeHistoryOperation(change, chapter, text, `${path}.changes[${index}]`));
  }
  // An explicitly empty type is an existing informational entry, not an acquisition.
  const type = value.type === "" ? "note" : value.type;
  if (!["note", "create", "destroy", "given_away", "update", "add"].includes(type)) {
    dataWarning(`${path}.type`, "required value is missing or invalid; ignoring the operation.");
    return [];
  }
  const result = {chapter, description: text, type};
  if (type !== "update" && type !== "add") return [result];
  const field = value.field;
  if (!["name", "rank", "tier", "type", "description", "enchantments"].includes(field)) {
    dataWarning(`${path}.field`, "required value is missing or invalid; ignoring the operation.");
    return [];
  }
  result.field = field;
  if (!Object.hasOwn(value, "value")) {
    dataWarning(`${path}.value`, "required value is missing; ignoring the operation to preserve existing data.");
    return [];
  }
  if (Object.hasOwn(value, "where")) {
    const keys = isRecord(value.where) ? Object.keys(value.where) : [];
    if (type !== "update" || field !== "enchantments" || keys.length === 0 ||
        !keys.every(key => ["name", "description", "passive"].includes(key) &&
          (key === "passive" ? typeof value.where[key] === "boolean" : typeof value.where[key] === "string")) ||
        !isRecord(value.value)) {
      dataWarning(`${path}.where`, "invalid enchantment update; ignoring the operation.");
      return [];
    }
    result.where = {...value.where};
    result.value = normalizeEnchantment(value.value, `${path}.value`, true);
  } else if (type === "add") {
    if (field === "enchantments") {
      result.value = normalizeEnchantment(value.value, `${path}.value`);
    } else if (["name", "description", "type"].includes(field) && typeof value.value === "string") {
      result.value = value.value;
    } else {
      dataWarning(`${path}.value`, "invalid addition; ignoring the operation.");
      return [];
    }
  } else {
    result.value = normalizeMemoryField(field, value.value, `${path}.value`);
  }
  return [result];
}

function validateMemories(data) {
  if (!Array.isArray(data)) {
    dataWarning("root", "expected an array of memories; using [].");
    return [];
  }
  return data.map((value, index) => {
    const path = `memory[${index}]${typeof value?.name === "string" ? ` (${value.name})` : ""}`;
    if (!isRecord(value)) {
      dataWarning(path, "expected an object; using defaults.");
      value = {};
    }
    const memory = {};
    for (const field of ["name", "rank", "tier", "type", "description", "enchantments"]) {
      memory[field] = normalizeMemoryField(field, value[field], `${path}.${field}`);
    }
    memory.ChangeHistory = [];
    if (!Array.isArray(value.ChangeHistory)) {
      dataWarning(`${path}.ChangeHistory`, "required array is missing or invalid; using [] (no known acquisition).");
      return memory;
    }
    value.ChangeHistory.forEach((entry, eventIndex) => {
      const eventPath = `${path}.ChangeHistory[${eventIndex}]`;
      if (!isRecord(entry) || !Number.isSafeInteger(entry.chapter) || entry.chapter < 0) {
        dataWarning(`${eventPath}.chapter`, "required nonnegative integer is missing or invalid; ignoring the event.");
        return;
      }
      const description = typeof entry.description === "string" ? entry.description : "Changed";
      const changes = normalizeHistoryOperation(entry, entry.chapter, description, eventPath);
      if (changes.length) {
        memory.ChangeHistory.push({chapter: entry.chapter, description, changes});
      }
    });
    // Stable sorting preserves the authored order of changes in the same chapter.
    memory.ChangeHistory.sort((a, b) => a.chapter - b.chapter);
    return memory;
  });
}

// Search matching
const SEARCH_MODES = ["contains", "equals", "startsWith", "endsWith", "notContains", "regex"];

// Glob matching with the same one-edit allowance as the fuzzy text modifier.
function matchesFuzzyWildcard(text, pattern) {
  let previousPrevious;
  let previous = Array.from({length: text.length + 1}, (_, index) => index);
  for (let token = 0; token < pattern.length; token++) {
    const character = pattern[token];
    const current = [character === "*" ? previous[0] : previous[0] + 1];
    for (let index = 1; index <= text.length; index++) {
      if (character === "*") {
        current[index] = Math.min(previous[index], current[index - 1]);
      } else {
        const matches = character === "?" || character === text[index - 1];
        current[index] = Math.min(previous[index - 1] + (matches ? 0 : 1),
          previous[index] + 1, current[index - 1] + 1);
        if (token > 0 && index > 1 && pattern[token - 1] !== "*" &&
            (character === "?" || character === text[index - 2]) &&
            (pattern[token - 1] === "?" || pattern[token - 1] === text[index - 1])) {
          current[index] = Math.min(current[index], previousPrevious[index - 2] + 1);
        }
      }
    }
    previousPrevious = previous;
    previous = current;
  }
  return previous[text.length] <= 1;
}

// Full-field glob matching without converting user wildcards into a regular expression.
function matchesWildcard(text, pattern) {
  let position = 0;
  let token = 0;
  let star = -1;
  let retry = 0;
  while (position < text.length) {
    if (pattern[token] === "?" || pattern[token] === text[position]) {
      position++;
      token++;
    } else if (pattern[token] === "*") {
      star = token++;
      retry = position;
    } else if (star !== -1) {
      token = star + 1;
      position = ++retry;
    } else return false;
  }
  while (pattern[token] === "*") token++;
  return token === pattern.length;
}

// At most one insertion, deletion, replacement, or adjacent-letter swap.
function matchesOneTypo(text, query) {
  if (text === query) return true;
  if (Math.abs(text.length - query.length) > 1) return false;
  let index = 0;
  while (index < text.length && index < query.length && text[index] === query[index]) index++;
  if (text.length > query.length) return text.slice(index + 1) === query.slice(index);
  if (text.length < query.length) return text.slice(index) === query.slice(index + 1);
  return text.slice(index + 1) === query.slice(index + 1) ||
    (text[index] === query[index + 1] && text[index + 1] === query[index] &&
      text.slice(index + 2) === query.slice(index + 2));
}

function matchesFuzzyText(text, query, mode) {
  if (mode === "equals") return matchesOneTypo(text, query);
  // An edit can change the length by one. Keep start/end anchors intact.
  for (let length = Math.max(1, query.length - 1); length <= query.length + 1; length++) {
    if (length > text.length) continue;
    if (mode === "startsWith") {
      if (matchesOneTypo(text.slice(0, length), query)) return true;
    } else if (mode === "endsWith") {
      if (matchesOneTypo(text.slice(-length), query)) return true;
    } else {
      for (let start = 0; start <= text.length - length; start++) {
        if (matchesOneTypo(text.slice(start, start + length), query)) return true;
      }
    }
  }
  return false;
}

function getSearchValues(item, fields) {
  return fields.flatMap(filter => {
    const [field, nested] = filter.split("-");
    const values = nested && Array.isArray(item[field])
      ? item[field].map(entry => entry?.[nested]) : nested ? [] : [item[field]];
    return values.filter(value => typeof value === "string");
  });
}

// Regex predicates run in the inline worker, where slow expressions can be terminated.
function createSearchMatcher(query, settings) {
  const raw = query.trim();
  if (!raw) return () => true;
  const normalize = value => settings.caseSensitive ? value : value.toLowerCase();
  const needle = normalize(raw);
  let pattern = needle;
  if (["contains", "notContains", "endsWith"].includes(settings.mode)) pattern = "*" + pattern;
  if (["contains", "notContains", "startsWith"].includes(settings.mode)) pattern += "*";
  const expression = settings.mode === "regex" ? new RegExp(raw, settings.caseSensitive ? "" : "i") : null;
  const match = value => {
    const text = normalize(value);
    if (settings.wildcard && settings.mode !== "regex") {
      return settings.fuzzy ? matchesFuzzyWildcard(text, pattern) : matchesWildcard(text, pattern);
    }
    if (settings.fuzzy && settings.mode !== "regex") {
      return matchesFuzzyText(text, needle, settings.mode);
    }
    switch (settings.mode) {
      case "equals": return text === needle;
      case "startsWith": return text.startsWith(needle);
      case "endsWith": return text.endsWith(needle);
      case "regex": return expression.test(value);
      default: return text.includes(needle);
    }
  };
  return values => settings.mode === "notContains" ? !values.some(match) : values.some(match);
}

// Worker and application UI
// This self-contained function becomes an inline worker, so deployment needs only this JS file.
function regexSearchWorker() {
  self.onmessage = ({data}) => {
    try {
      const expression = new RegExp(data.query.trim(), data.settings.caseSensitive ? "" : "i");
      const indices = [];
      data.values.forEach((values, index) => {
        if (values.some(value => expression.test(value))) indices.push(index);
      });
      self.postMessage({indices});
    } catch (error) {
      self.postMessage({error: `Invalid regular expression: ${error.message}`});
    }
  };
}

let regexWorkerUrl = null;
function createRegexWorker() {
  if (!regexWorkerUrl) {
    const source = `(${regexSearchWorker.toString()})();`;
    regexWorkerUrl = URL.createObjectURL(new Blob([source], {type: "text/javascript"}));
  }
  return new Worker(regexWorkerUrl);
}

/** Detects devices without hover (phones, tablets), where mouse-over interactions don't apply. */
class InputMode {
  static #noHover = window.matchMedia("(hover: none)");

  static get isTouch() {
    return InputMode.#noHover.matches;
  }
}

let items = [];

const tiers = MEMORY_TIERS;
const ranks = MEMORY_RANKS;
const defaultColors = ["#7f8c8d", "#27ae60", "#2980b9", "#8e44ad", "#ff01c8", "#0400f3", "#f39c12", "#141414"];
const BORDER_STYLES = ["none", "solid", "dashed", "dotted", "double", "groove", "ridge", "inset", "outset"];
const borderGroups = {
  rank: ["Dormant", "Awakened", "Ascended", "Transcendent", "Supreme", "Sacred", "Divine", "?"],
  tier: ["I", "II", "III", "IV", "V", "VI", "VII", "?"]
};
const defaultBorders = Object.fromEntries(Object.entries(borderGroups).map(([group, values]) =>
  [group, Object.fromEntries(values.map(value => [value, {
    style: value === "?" ? "dashed" : "none", color: "#7f8c8d", width: 2
  }]))]));
let storageWarningShown = false;
let historyCache = {data: null, chapter: null, groups: null};

let currentChapter = 500;

//load items from storage
let glintRanks=loadList("glintRanks", ['Divine']);
let glintTiers=loadList("glintTiers", ['VII']);
let generalSettings=loadList("generalSettings", {history: true, groupGivenAway: false});
let searchSettings = loadList("searchSettings", {mode: "contains", caseSensitive: false, fuzzy: false, wildcard: false});
let borderSettings = loadList("borderSettings", {by: "rank", ...defaultBorders});
let activeSearchWorker = null;
let searchTimeout = null;

let historyEnabled = generalSettings.history;

let isclicked = false;
let sortedWith = currentChapter;
let currentlyLocked = "";

const slider = document.getElementById("chapter");
const chapterInput = document.getElementById("chapter-input");
const grid_owned = document.getElementById("grid_owned");
const grid_destroyed = document.getElementById("grid_destroyed");
const grid_given_away = document.getElementById("grid_given_away");
const panel = document.getElementById("infoPanel");
const ascbtn = document.getElementById("sortBtn");
const searchInput = document.getElementById("searchInput");
const searchOptions = document.querySelector(".dropdown");
const searchOptionsBtn = document.getElementById("searchOptionsBtn");
const clearSearch = document.getElementById("clearSearch");
const storedChapter = readStorage("currentChapter");
if (storedChapter !== null) {
  currentChapter = normalizeChapter(storedChapter, 500);
  if (String(currentChapter) !== storedChapter) {
    console.warn("[settings] currentChapter is invalid or out of bounds; using", currentChapter);
    writeStorage("currentChapter", String(currentChapter));
  }
}

let historyTooltip = null;
let historyTooltipLocked = false;
panel.addEventListener("click", (e) => {
  e.stopPropagation()
  setSearchOptionsOpen(false);
  if (!historyTooltipLocked) return;
  if (historyTooltip?.contains(e.target)) return;
  historyTooltipLocked = false;
  if (historyTooltip) {
      historyTooltip.remove();
      historyTooltip = null;
  }
})
panel.addEventListener("wheel", (e) => {
  const atTop = panel.scrollTop === 0 && e.deltaY < 0;
  const atBottom = panel.scrollTop + panel.clientHeight >= panel.scrollHeight && e.deltaY > 0;

  if (atTop || atBottom) {
    e.preventDefault();
  }
}, { passive: false });
document.querySelectorAll('.grid').forEach((element)=>{
  element.previousElementSibling.addEventListener('click', ()=>{
    element.previousElementSibling.childNodes[1].classList.toggle("up")
    element.classList.toggle("folded");
  });
});

//SETTINGS
const SettingsOverlay = document.getElementById("SettingsOverlay");
const settingsBtn = document.getElementById("settingsBtn");
const closeBtn = document.getElementById("closeBtn");
const tabs = document.querySelectorAll(".tab");
const sections = document.querySelectorAll(".section");

let asc=false;

settingsBtn.onclick = () => SettingsOverlay.classList.add("open");
closeBtn.onclick = () => SettingsOverlay.classList.remove("open");

const settingsPanel = SettingsOverlay.querySelector(".settingsPanel");
const settingsContent = settingsPanel.querySelector(".content");
settingsPanel.addEventListener("wheel", event => {
  if (event.ctrlKey || !event.deltaY) return;
  const insideContent = settingsContent.contains(event.target);
  const atTop = settingsContent.scrollTop <= 0 && event.deltaY < 0;
  const atBottom = settingsContent.scrollTop + settingsContent.clientHeight >= settingsContent.scrollHeight - 1 && event.deltaY > 0;
  if (!insideContent || atTop || atBottom) event.preventDefault();
}, {passive: false});

function loadBackgroundColors(){//general load() function
  let colorBy = loadColorBy();
  document.getElementById("colorBy").value=colorBy;
  document.querySelectorAll(".colorBySection").forEach(s => s.classList.remove("active"));
  document.getElementById("colorBySection-"+colorBy).classList.add("active")
  
  let tiersList = ["I", "II", "III", "IV", "V", "VI", "VII", "?"];
  let colorInputs=document.getElementById("colorBySection-tier").querySelectorAll("input");
  loadList("colorsTier", defaultColors).forEach((color, i) => {
    colorInputs[i].value=color;
    if (colorBy=="tier") ApplyBackgroundColors("tier-"+tiersList[i], color, false);
  })
  let ranksList=["Dormant", "Awakened", "Ascended", "Transcendent", "Supreme", "Sacred", "Divine", "?"];
  colorInputs=document.getElementById("colorBySection-rank").querySelectorAll("input");
  loadList("colorsRank", defaultColors).forEach((color, i) => {
    colorInputs[i].value=color;
    if (colorBy=="rank") ApplyBackgroundColors("rank-"+ranksList[i], color, false);
  })
}
function setColorBy(type="colorBy"){
  document.querySelectorAll("."+type+"Section").forEach(s => s.classList.remove("active"));
  document.getElementById(type+"Section-"+document.getElementById(type).value).classList.add("active")
  writeStorage("colorBy", document.getElementById("colorBy").value)
  loadBackgroundColors()
}
function toggleGlint(type=""){
  if (!type) return;
  if (Object.hasOwn(ranks, type)){
    if (glintRanks.includes(type)) {
      glintRanks= glintRanks.filter(x => x !== type);
    } else {
      glintRanks= [...glintRanks, type];
    }
  }else if(Object.hasOwn(tiers, type)){
    if (glintTiers.includes(type)) {
      glintTiers= glintTiers.filter(x => x !== type);
    } else {
      glintTiers= [...glintTiers, type];
    }
  }else{return;}

  save()
  renderItems()
}
function UpdateColors(from){
  let to = "rank";
  if (from=="rank") to="tier";
  if (!confirm("Are you sure you want to override the " + to + " color values?")) return;
  let inputsTo = document.getElementById("colorBySection-"+to).querySelectorAll("input")
  document.getElementById("colorBySection-"+from).querySelectorAll("input").forEach((input, i) => {
    inputsTo[i].value=input.value;
  })
  save();
  loadBackgroundColors();
}

document.querySelectorAll(".glintCheckBox").forEach((e) => {
  if (glintRanks.includes(e.value) || glintTiers.includes(e.value)){
    e.checked=true;
  }else{
    e.checked=false;
  }
});

function ApplyBackgroundColors(type, color, persist = true){
  document.querySelectorAll("."+type.replace("?", "\\?")).forEach(item => {
    item.style.backgroundColor=color
  })
  if (persist) save();
}

function resetColors(type){
  if (!confirm(`Reset all ${type} colors to default?`)) return;
  const original = defaultColors;
  document.getElementById("colorBySection-"+type).querySelectorAll("input").forEach((input, i) => {
    input.value=original[i]
  })
  save()
  loadBackgroundColors()
}

SettingsOverlay.onclick = (e) => {
  if (e.target === SettingsOverlay) {
    SettingsOverlay.classList.remove("open");
  }
};

tabs.forEach(tab => {
  tab.onclick = () => {
    tabs.forEach(t => t.classList.remove("active"));
    sections.forEach(s => s.classList.remove("active"));

    tab.classList.add("active");
    document.getElementById("section-"+tab.dataset.target).classList.add("active");
  };
});

const borderByInput = document.getElementById("borderBy");
borderByInput.value = borderSettings.by;
function applyMemoryBorders() {
  const group = borderSettings.by;
  for (const value of borderGroups[group]) {
    const border = borderSettings[group][value];
    for (const item of document.getElementsByClassName(`${group}-${value}`)) {
      item.style.border = `${border.width}px ${border.style} ${border.color}`;
    }
  }
}
function saveBorderSettings() {
  writeStorage("borderSettings", JSON.stringify(borderSettings));
  applyMemoryBorders();
}
function renderBorderControls() {
  const group = borderSettings.by;
  const options = document.getElementById("borderOptions");
  options.replaceChildren();
  for (const value of borderGroups[group]) {
    const border = borderSettings[group][value];
    const field = document.createElement("fieldset");
    field.className = "border-field";
    const updatePreview = () => {
      field.style.border = `${border.width}px ${border.style} ${border.color}`;
      field.classList.toggle("border-none", border.style === "none");
    };
    updatePreview();
    const legend = document.createElement("legend");
    legend.textContent = value;
    field.appendChild(legend);
    for (const [key, title] of [["style", "Style"], ["color", "Color"], ["width", "Width (px)"]]) {
      const label = document.createElement("label");
      label.textContent = title;
      const input = document.createElement(key === "style" ? "select" : "input");
      input.id = `border-${group}-${value === "?" ? "unknown" : value}-${key}`;
      if (key === "style") {
        for (const style of BORDER_STYLES) {
          const option = document.createElement("option");
          option.value = style;
          option.textContent = style[0].toUpperCase() + style.slice(1);
          input.appendChild(option);
        }
      } else {
        input.type = key === "color" ? "color" : "number";
        if (key === "width") { input.min = "0"; input.max = "20"; input.step = "1"; }
      }
      input.value = border[key];
      input.setAttribute("aria-label", `${group} ${value} border ${title.toLowerCase()}`);
      input.addEventListener("change", () => {
        if (!input.checkValidity() || (key === "width" && input.value === "")) {
          input.value = border[key];
          return;
        }
        border[key] = key === "width" ? Number(input.value) : input.value;
        updatePreview();
        saveBorderSettings();
      });
      label.appendChild(input);
      field.appendChild(label);
    }
    options.appendChild(field);
  }
  document.getElementById("resetBorders").textContent = `Reset ${group} to default`;
  document.getElementById("copyBorders").textContent = `Use borders from ${group === "rank" ? "tier" : "rank"}`;
}
borderByInput.addEventListener("change", () => {
  borderSettings.by = borderByInput.value;
  renderBorderControls();
  saveBorderSettings();
});
document.getElementById("resetBorders").addEventListener("click", () => {
  if (!confirm(`Reset all ${borderSettings.by} borders to default?`)) return;
  borderSettings[borderSettings.by] = structuredClone(defaultBorders[borderSettings.by]);
  renderBorderControls();
  saveBorderSettings();
});
document.getElementById("copyBorders").addEventListener("click", () => {
  const target = borderSettings.by;
  const source = target === "rank" ? "tier" : "rank";
  borderGroups[target].forEach((value, index) => {
    borderSettings[target][value] = structuredClone(borderSettings[source][borderGroups[source][index]]);
  });
  renderBorderControls();
  saveBorderSettings();
});
renderBorderControls();

const historyToggle = document.getElementById("historyToggle");
historyToggle.checked=generalSettings.history
historyToggle.dispatchEvent(new Event("change"));
historyToggle.addEventListener("change", () => {
    historyEnabled = historyToggle.checked;
    generalSettings.history=historyEnabled
    save_general_settings()
    if (!historyEnabled) {
        historyTooltipLocked = false;
        hideHistoryTooltip();
    }
});
const groupGivenAwayToggle = document.getElementById("groupGivenAwayToggle");
groupGivenAwayToggle.checked = generalSettings.groupGivenAway;
groupGivenAwayToggle.addEventListener("change", () => {
  generalSettings.groupGivenAway = groupGivenAwayToggle.checked;
  save_general_settings();
  renderItems();
});

//SEARCH
const matchModeInput = document.getElementById("searchMatchMode");
const caseSensitiveInput = document.getElementById("searchCaseSensitive");
const fuzzyInput = document.getElementById("searchFuzzy");
const wildcardInput = document.getElementById("searchWildcard");
matchModeInput.value = searchSettings.mode;
caseSensitiveInput.checked = searchSettings.caseSensitive;
fuzzyInput.checked = searchSettings.fuzzy;
wildcardInput.checked = searchSettings.wildcard;
function updateFuzzyControl() {
  fuzzyInput.disabled = searchSettings.mode === "regex";
  wildcardInput.disabled = searchSettings.mode === "regex";
  document.getElementById("searchFuzzyDescription").textContent = fuzzyInput.disabled
    ? "Available with text matching modes." : "Allow one character typo.";
}
updateFuzzyControl();
function saveSearchSettings() {
  searchSettings = {mode: matchModeInput.value, caseSensitive: caseSensitiveInput.checked,
    fuzzy: fuzzyInput.checked, wildcard: wildcardInput.checked};
  updateFuzzyControl();
  writeStorage("searchSettings", JSON.stringify(searchSettings));
  renderItems();
}
matchModeInput.addEventListener("change", saveSearchSettings);
caseSensitiveInput.addEventListener("change", saveSearchSettings);
fuzzyInput.addEventListener("change", saveSearchSettings);
wildcardInput.addEventListener("change", saveSearchSettings);
syncChapterControls(currentChapter);
ascbtn.addEventListener("click", () => {
  asc = !asc;
  ascbtn.textContent = asc ? "↑" : "↓";
  const label = asc ? "Ascending order. Switch to descending" : "Descending order. Switch to ascending";
  ascbtn.setAttribute("aria-label", label);
  ascbtn.title = label;
  renderItems();
});
// Preview while dragging; commit only when the slider is released.
slider.addEventListener("input", () => syncChapterControls(Number(slider.value)));
slider.addEventListener("change", () => setChapter(slider.value));
chapterInput.addEventListener("change", () => setChapter(chapterInput.value));

function normalizeChapter(value, fallback) {
  const number = typeof value === "string" && value.trim() === "" ? NaN : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Number(slider.max), Math.max(Number(slider.min), Math.trunc(number)));
}

function syncChapterControls(chapter) {
  slider.value = chapter;
  chapterInput.value = chapter;
  const progress = (chapter - Number(slider.min)) / (Number(slider.max) - Number(slider.min)) * 100;
  slider.style.background = `linear-gradient(to right, #fff 0%, #fff ${progress}%, rgba(6,6,6,0.7) ${progress}%, rgba(6,6,6,0.7) 100%)`;
}

function setChapter(value) {
  const chapter = normalizeChapter(value, currentChapter);
  syncChapterControls(chapter);
  writeStorage("currentChapter", String(chapter));
  if (chapter === currentChapter) return;
  currentChapter = chapter;
  isclicked = false;
  hidePanel();
  renderItems();
}
searchInput.addEventListener("input", () => renderItems());
clearSearch.addEventListener("click", () => {
  searchInput.value = "";
  renderItems();
  searchInput.focus();
});
document.getElementById("menu").addEventListener("change", () => renderItems());
searchOptions.addEventListener("keydown", event => {
  if (event.key === "Escape" && searchOptions.classList.contains("open")) {
    event.preventDefault();
    setSearchOptionsOpen(false);
    searchOptionsBtn.focus();
  }
});

document.getElementById("menu").addEventListener("click", (e) => {
  if (isclicked){
    isclicked=false;
    hidePanel()
  }else{
    if (sortedWith!=currentChapter){
      renderItems();
    }
  }
  e.stopPropagation();
})

let valueSelect = "rank";
document.getElementById("sortSelect").addEventListener("change", event => {
  valueSelect = event.target.value;
  renderItems();
});

//close all with click
document.addEventListener("click", event => {
  // Labels, their native checkbox click, and menu padding all count as inside.
  if (searchOptions.contains(event.target)) return;
  if (isclicked){
    isclicked=false;
    hidePanel()
  }else{
    if (sortedWith!=currentChapter){
      renderItems();
    }
  }
  setSearchOptionsOpen(false);
})

function setSearchOptionsOpen(open) {
  searchOptions.classList.toggle("open", open);
  searchOptionsBtn.setAttribute("aria-expanded", String(open));
}
function toggleDropdown(event) {
  setSearchOptionsOpen(!searchOptions.classList.contains("open"));
  event.stopPropagation();
}

function updateSearchSummary(query, total, available) {
  const selected = [...document.querySelectorAll("#menu input:checked")];
  const labels = selected.map(input => input.parentElement.textContent.trim());
  document.getElementById("searchFieldCount").textContent = selected.length;
  searchOptionsBtn.setAttribute("aria-label", `Search in: ${labels.join(", ") || "no fields selected"}`);
  clearSearch.hidden = searchInput.value.length === 0;
  document.getElementById("searchResults").textContent = query.trim()
    ? `${total} of ${available} memories · Chapter ${currentChapter}`
    : `${total} ${total === 1 ? "memory" : "memories"} · Chapter ${currentChapter}`;
  document.getElementById("searchEmpty").hidden = total !== 0;
  document.getElementById("searchEmptyTitle").textContent = available ? "No matching memories" : "No memories at this chapter";
}
function storageWarning(error) {
  if (!storageWarningShown) console.warn("[settings] Browser storage is unavailable; changes may not persist.", error);
  storageWarningShown = true;
}
function readStorage(key) {
  try { return localStorage.getItem(key); }
  catch (error) { storageWarning(error); return null; }
}
function writeStorage(key, value) {
  try { localStorage.setItem(key, value); }
  catch (error) { storageWarning(error); }
}
function loadColorBy() {
  const value = readStorage("colorBy");
  if (value === "rank" || value === "tier") return value;
  if (value !== null) {
    console.warn("[settings] colorBy is invalid; using rank.");
    writeStorage("colorBy", "rank");
  }
  return "rank";
}
function loadList(key, defaults) {
  const raw = readStorage(key);
  if (raw === null) return structuredClone(defaults);
  let value;
  try { value = JSON.parse(raw); }
  catch { value = undefined; }
  let normalized = structuredClone(defaults);
  if (key === "borderSettings" && isRecord(value)) {
    normalized.by = ["rank", "tier"].includes(value.by) ? value.by : defaults.by;
    for (const [group, values] of Object.entries(borderGroups)) {
      for (const category of values) {
        const border = value[group]?.[category];
        if (!isRecord(border)) continue;
        const target = normalized[group][category];
        if (BORDER_STYLES.includes(border.style)) target.style = border.style;
        if (typeof border.color === "string" && /^#[0-9a-f]{6}$/i.test(border.color)) target.color = border.color;
        if (Number.isInteger(border.width) && border.width >= 0 && border.width <= 20) target.width = border.width;
      }
    }
  } else if (key === "generalSettings" && isRecord(value)) {
    normalized.history = typeof value.history === "boolean" ? value.history : defaults.history;
    normalized.groupGivenAway = typeof value.groupGivenAway === "boolean" ? value.groupGivenAway : defaults.groupGivenAway;
  } else if (key === "searchSettings" && isRecord(value)) {
    normalized.mode = SEARCH_MODES.includes(value.mode) ? value.mode : defaults.mode;
    normalized.caseSensitive = typeof value.caseSensitive === "boolean" ? value.caseSensitive : defaults.caseSensitive;
    normalized.fuzzy = value.mode === "fuzzy" || (typeof value.fuzzy === "boolean" ? value.fuzzy : defaults.fuzzy);
    // Preserve the full-field semantics of the former Wildcard matching mode.
    normalized.wildcard = value.mode === "wildcard" || (typeof value.wildcard === "boolean" ? value.wildcard : defaults.wildcard);
    if (value.mode === "wildcard") normalized.mode = "equals";
  } else if (key === "glintRanks" || key === "glintTiers") {
    const allowed = key === "glintRanks" ? ranks : tiers;
    if (Array.isArray(value)) {
      const valid = value.filter(entry => typeof entry === "string" && entry !== "?" && Object.hasOwn(allowed, entry));
      // Preserve an intentionally empty selection; recover wholly corrupt lists to defaults.
      if (value.length === 0 || valid.length > 0) normalized = [...new Set(valid)];
    }
  } else if ((key === "colorsRank" || key === "colorsTier") && Array.isArray(value)) {
    normalized = defaults.map((fallback, index) =>
      typeof value[index] === "string" && /^#[0-9a-f]{6}$/i.test(value[index]) ? value[index] : fallback);
  }
  if (JSON.stringify(value) !== JSON.stringify(normalized)) {
    console.warn(`[settings] ${key} contains invalid or missing values; restoring defaults for those values.`);
    writeStorage(key, JSON.stringify(normalized));
  }
  return normalized;
}
function save_general_settings(){
  writeStorage("generalSettings", JSON.stringify(generalSettings))
}
function save(){
  writeStorage("glintRanks", JSON.stringify(glintRanks));
  writeStorage("glintTiers", JSON.stringify(glintTiers));
  let colorsTier=[];
  let colorsRank=[];
  document.getElementById("colorBySection-tier").querySelectorAll("input").forEach(input => colorsTier.push(input.value));
  document.getElementById("colorBySection-rank").querySelectorAll("input").forEach(input => colorsRank.push(input.value));
  writeStorage("colorsTier", JSON.stringify(colorsTier))
  writeStorage("colorsRank", JSON.stringify(colorsRank))
  writeStorage("colorBy", document.getElementById("colorBy").value)
}


function matches(where, obj) {
  return Object.entries(where).every(([key, value]) => obj[key] === value);
}
function append(target, value) {
  if (Array.isArray(target)) {
    return [...target, value];
  }

  if (typeof target === "string") {
    return target + value;
  }

  throw new Error("Unsupported type");
}


function SearchFilter(data, query = "", fields, matcher) {
  if (!query.trim()) return [...data];
  if (!fields.length) return [];
  return data.filter(item => matcher(getSearchValues(item, fields)));
}
function getChapterItems() {
  if (historyCache.data !== items || historyCache.chapter !== currentChapter) {
    historyCache = {data: items, chapter: currentChapter, groups: updateHistory(items, currentChapter)};
  }
  return historyCache.groups;
}
function renderItems(query="") {
  if (!query){
    query=document.getElementById("searchInput").value
  }
  // Termination also prevents an old result from replacing a newer query/chapter.
  if (activeSearchWorker) activeSearchWorker.terminate();
  activeSearchWorker = null;
  clearTimeout(searchTimeout);
  setSearchError("");
  const groups = getChapterItems();
  const available = groups.reduce((count, group) => count + group.length, 0);
  const fields = [...document.querySelectorAll("#menu input:checked")].map(input => input.value);
  if (searchSettings.mode === "regex" && query.trim() && fields.length) {
    // Arbitrary expressions run off the UI thread and have a fixed time budget.
    renderFilteredItems([[], [], []], query, available);
    document.getElementById("searchEmpty").hidden = true;
    document.getElementById("searchResults").textContent = "Searching…";
    const fail = message => {
      if (activeSearchWorker) activeSearchWorker.terminate();
      activeSearchWorker = null;
      clearTimeout(searchTimeout);
      renderFilteredItems([[], [], []], query, available);
      document.getElementById("searchEmpty").hidden = true;
      setSearchError(message);
    };
    try {
      const worker = createRegexWorker();
      activeSearchWorker = worker;
      worker.onmessage = ({data}) => {
        if (activeSearchWorker !== worker) return;
        if (data.error) { fail(data.error); return; }
        clearTimeout(searchTimeout);
        worker.terminate();
        activeSearchWorker = null;
        const indices = new Set(data.indices);
        let index = 0;
        renderFilteredItems(groups.map(group => group.filter(() => indices.has(index++))), query, available);
      };
      worker.onerror = event => {
        if (activeSearchWorker !== worker) return;
        event.preventDefault();
        fail("Regex search could not start. Try another matching mode or reload the page.");
      };
      searchTimeout = setTimeout(() => {
        if (activeSearchWorker === worker) fail("This regular expression took too long. Try a simpler pattern.");
      }, 1500);
      worker.postMessage({query, settings: searchSettings, values: groups.flat().map(item => getSearchValues(item, fields))});
    } catch {
      fail("Regex search is unavailable in this browser. Choose another matching mode.");
    }
    return;
  }
  const matcher = fields.length ? createSearchMatcher(query, searchSettings) : () => false;
  renderFilteredItems(groups.map(group => SearchFilter(group, query, fields, matcher)), query, available);
}

function setSearchError(message) {
  const error = document.getElementById("searchError");
  error.textContent = message;
  error.hidden = !message;
  searchInput.setAttribute("aria-invalid", String(Boolean(message)));
}

function renderFilteredItems([owned, destroyed, given_away], query, available) {
  if (generalSettings.groupGivenAway) {
    destroyed = [...destroyed, ...given_away];
    given_away = [];
  }
  updateSearchSummary(query, owned.length + destroyed.length + given_away.length, available);
  let [OwnedItems, DestroyedItems, given_away_items] = sortItems(owned, destroyed, given_away, currentChapter);
  //OWNED
  grid_owned.innerHTML="";
  OwnedItems.forEach(item => {
    grid_owned.appendChild(createItem(item));
  });
  grid_owned.parentElement.style.display = OwnedItems.length ? "" : "none";

  //DESTROYED
  grid_destroyed.innerHTML="";
  DestroyedItems.forEach(item => {
    grid_destroyed.appendChild(createItem(item))
  })
  grid_destroyed.parentElement.style.display = DestroyedItems.length ? "" : "none";

  //GIVEN AWAY
  grid_given_away.innerHTML="";
  given_away_items.forEach(item => {
  grid_given_away.appendChild(createItem(item))
  })
  grid_given_away.parentElement.style.display = given_away_items.length ? "" : "none";
  
  loadBackgroundColors()
  applyMemoryBorders();
}
function createItem(item) {
    const div = document.createElement("div");
    div.className = `item rank-${item.rank} tier-${item.tier}`;
    
    if (glintRanks.includes(item.rank)){
      div.classList.add("glint")
    }else if(glintTiers.includes(item.tier)){
      div.classList.add("glint")
    }

    div.style.backgroundColor
    let i = ranks[item.rank]
    document.getElementById("colorBySection-rank").querySelectorAll("input")[i];
    /*//should I use this or ? in class
    if (item.rank=="?" || !Object.hasOwn(ranks, item.rank)){
      div.classList.add("rank-unknown")
    } */
    div.innerHTML = `
        <div class="item-name">${escapeHtml(item.name)}</div>
        <div class="item-tier">${escapeHtml(item.tier)}</div>
    `;

    div.addEventListener("mousemove", (e) => {if (!isclicked && !InputMode.isTouch) showPanel(item, e.clientX, e.clientY)});
    div.addEventListener("mouseleave", hidePanel);
    div.addEventListener("click", (event) => {
        // Touch has no hover state, so a second tap on the open item closes it
        if (InputMode.isTouch && isclicked && currentlyLocked == item.name) {
            event.stopPropagation();
            isclicked = false;
            hidePanel();
            return;
        }
        // stopPropagation below keeps the document click handler from closing a pinned tooltip
        historyTooltipLocked = false;
        hideHistoryTooltip();

        if (!(isclicked && currentlyLocked!=item.name)){isclicked=!isclicked;}
        currentlyLocked=item.name;
        showPanel(item, event.clientX, event.clientY)
        setSearchOptionsOpen(false);
        event.stopPropagation();
    });
    return div;
}


function applyChange(item, change) {
    switch (change.type) {
        case "create":
            return { created: true };
        case "update":
            if (Object.hasOwn(change, "where")) {
                for (const field of item[change.field]) {
                    if (matches(change.where, field)) {
                        Object.assign(field, structuredClone(change.value));
                    }
                }
            } else {
                item[change.field] = structuredClone(change.value);
            }
            break;
        case "add":
            item[change.field] = append(item[change.field], structuredClone(change.value));
            break;
        case "destroy":
            return { destroyed: true };
        case "given_away":
            return { givenAway: true };
    }
    return {};
}
function updateHistory(data, chapter) {
    const owned = [];
    const destroyed = [];
    const given_away = [];

    for (const item of data) {
        const newItem = structuredClone(item);
        if (item.ChangeHistory[0]?.chapter > chapter) {
            continue;
        }
        let isCreated = false;
        let isDestroyed = false;
        let isGivenAway = false;
        for (const change of item.ChangeHistory) {
            if (change.chapter > chapter) continue;
            const changes = change.changes ?? [change];
            for (const currentChange of changes) {
                const result = applyChange(newItem, currentChange);//handles recusrive due to changes
                if (result.created) {
                    isCreated = true;
                    isDestroyed = false;
                    isGivenAway = false;
                }
                if (result.destroyed) {
                    isDestroyed = true;
                }
                if (result.givenAway) {
                    isGivenAway = true;
                }
            }
        }
        if (!isCreated) {
            continue;
        }
        if (isDestroyed) {
            destroyed.push(newItem);
        } else if (isGivenAway) {
            given_away.push(newItem);
        } else {
            owned.push(newItem);
        }
    }
    return [owned, destroyed, given_away];
}
function sortItems(owned, destroyed, given_away, chapter) {
  sortedWith=currentChapter;
  const value = valueSelect//document.getElementById("sort").value;

  function sortRank(a, b){
    if (ranks[a.rank] !== ranks[b.rank]) {
      return ranks[a.rank] - ranks[b.rank];
    }
    return tiers[a.tier] - tiers[b.tier]; // tie-breaker
  }

  function sortTier(a, b){
    if (tiers[a.tier] !== tiers[b.tier]) {
      return tiers[a.tier] - tiers[b.tier];
    }
    return ranks[a.rank] - ranks[b.rank]; // tie-breaker
  }

  function sortChapterReceived(a, b){
    if (a.ChangeHistory[0]["chapter"] !== b.ChangeHistory[0]["chapter"]) {
      return a.ChangeHistory[0]["chapter"] - b.ChangeHistory[0]["chapter"];
    }
    return sortRank(a, b); // tie-breaker
  }

  function sortChapterChanged(a, b){
    let chapterChangeA = Math.max(...[...a.ChangeHistory].map(history => history.chapter).filter(x => x <= chapter));
    let chapterChangeB = Math.max(...[...b.ChangeHistory].map(history => history.chapter).filter(x => x <= chapter));

    if (chapterChangeA !== chapterChangeB) {
      return chapterChangeA - chapterChangeB;
    }

    return sortRank(a, b); // tie-breaker
  }

  switch (value) {
    case "chapter-recv":
      owned.sort((a, b) => sortChapterReceived(a, b));
      destroyed.sort((a, b) => sortChapterReceived(a, b));
      given_away.sort((a, b) => sortChapterReceived(a, b));
      break;
    case "chapter-changed"://work in progress
      owned.sort((a, b) => sortChapterChanged(a, b));
      destroyed.sort((a, b) => sortChapterChanged(a, b));
      given_away.sort((a, b) => sortChapterChanged(a, b));
      break;
    case "name":
      owned.sort((a, b) => a.name.localeCompare(b.name));
      destroyed.sort((a, b) => a.name.localeCompare(b.name));
      given_away.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "rank":
      owned.sort((a, b) => sortRank(a, b));
      destroyed.sort((a, b) => sortRank(a, b));
      given_away.sort((a, b) => sortRank(a, b));
      break;
    case "tier":
      owned.sort((a, b) => sortTier(a, b));
      destroyed.sort((a, b) => sortTier(a, b));
      given_away.sort((a, b) => sortTier(a, b));
      break;
  }
  if (!asc){
    owned.reverse();
    destroyed.reverse();
    given_away.reverse();
  }
  return [owned, destroyed, given_away]
}


function createHistoryTooltip(changes) {
    if (!changes || changes.length === 0) return null;

    const tooltip = document.createElement("div");
    tooltip.className = "history-tooltip";

    tooltip.innerHTML = `
        ${changes.map(change => `
            <div class="history-entry">
                <div class="history-chapter">
                    Chapter ${change.chapter}
                </div>

                <div class="history-description">
                    ${escapeHtml(change.description || "Changed")}
                </div>
            </div>
        `).join("")}
    `;

    document.body.appendChild(tooltip);

    return tooltip;
}
function showHistoryTooltip(indicator, changes) {
    hideHistoryTooltip();

    historyTooltip = createHistoryTooltip(changes);

    if (!historyTooltip) return;

    positionHistoryTooltip(indicator, historyTooltip);

    historyTooltip.addEventListener("click", (event) => {
        event.stopPropagation();
    });
}
function positionHistoryTooltip(indicator, tooltip) {
    const rect = indicator.getBoundingClientRect();

    let left = rect.left;
    let top = rect.bottom + 7;

    const tooltipRect = tooltip.getBoundingClientRect();

    // Keep inside right edge
    if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
    }

    // If there isn't enough room underneath,
    // put it above the indicator
    if (top + tooltipRect.height > window.innerHeight - 10) {
        top = rect.top - tooltipRect.height - 7;
    }

    // Keep inside left edge
    if (left < 10) {
        left = 10;
    }

    // Keep inside top edge
    if (top < 10) {
        top = 10;
    }

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}
function hideHistoryTooltip() {
    if (historyTooltipLocked) return;

    if (historyTooltip) {
        historyTooltip.remove();
        historyTooltip = null;
    }
}


function getEnchantmentChanges(item, enchantmentName, currentChapter) {
    if (!item.ChangeHistory || !enchantmentName) {
        return [];
    }

    const results = [];

    for (const change of item.ChangeHistory) {
        if (change.chapter > currentChapter) continue;

        // ---------------------------------------------
        // Direct enchantment operation
        // ---------------------------------------------
        if (change.field === "enchantments") {

            // -----------------------------------------
            // 1. Individual enchantment update
            //
            // where: { name: "Prince of the Underworld" }
            // -----------------------------------------
            if (
                change.where &&
                change.where.name === enchantmentName
            ) {
                results.push({
                    chapter: change.chapter,
                    description: change.description ||
                        "Enchantment updated",
                    change: change
                });
            }

            // -----------------------------------------
            // 2. Individual enchantment added
            //
            // value: { name: "Soulbound Relic", ... }
            // -----------------------------------------
            if (
                change.value &&
                !Array.isArray(change.value) &&
                change.value.name === enchantmentName
            ) {
                results.push({
                    chapter: change.chapter,
                    description: change.description ||
                        "Enchantment added",
                    change: change
                });
            }

            // -----------------------------------------
            // 3. Entire enchantment array introduced
            //
            // value: [
            //   { name: "Living Stone", ... },
            //   ...
            // ]
            // -----------------------------------------
            if (Array.isArray(change.value)) {
                const exists = change.value.some(
                    enchantment =>
                        enchantment &&
                        enchantment.name === enchantmentName
                );

                if (exists) {
                    results.push({
                        chapter: change.chapter,
                        description: change.description ||
                            "Enchantment added",
                        change: change
                    });
                }
            }
        }

        // ---------------------------------------------
        // Changes nested inside a history entry
        // ---------------------------------------------
        if (change.changes) {
            for (const nested of change.changes) {

                if (nested.field !== "enchantments") {
                    continue;
                }

                // -------------------------------------
                // Individual enchantment update
                // -------------------------------------
                if (
                    nested.where &&
                    nested.where.name === enchantmentName
                ) {
                    results.push({
                        chapter: change.chapter,
                        description: change.description ||
                            "Enchantment updated",
                        change: nested
                    });
                }

                // -------------------------------------
                // Individual enchantment added
                // -------------------------------------
                if (
                    nested.value &&
                    !Array.isArray(nested.value) &&
                    nested.value.name === enchantmentName
                ) {
                    results.push({
                        chapter: change.chapter,
                        description: change.description ||
                            "Enchantment added",
                        change: nested
                    });
                }

                // -------------------------------------
                // Entire enchantment array
                // -------------------------------------
                if (Array.isArray(nested.value)) {
                    const exists = nested.value.some(
                        enchantment =>
                            enchantment &&
                            enchantment.name === enchantmentName
                    );

                    if (exists) {
                        results.push({
                            chapter: change.chapter,
                            description: change.description ||
                                "Enchantments updated",
                            change: nested
                        });
                    }
                }
            }
        }
    }

    return results.sort(
        (a, b) => a.chapter - b.chapter
    );
}
function addChangeIndicator(parent, changes) {
    if (!historyEnabled) return;
    if (!changes || changes.length === 0) return;

    const indicator = document.createElement("span");

    indicator.className = "change-indicator";
    indicator.textContent = "◷";

    indicator.addEventListener("mouseenter", () => {
        if (!historyEnabled) return;
        if (!historyTooltipLocked) {
            showHistoryTooltip(indicator, changes);
        }
    });

    indicator.addEventListener("mouseleave", () => {
        if (!historyEnabled) return;
        if (!historyTooltipLocked) {
            hideHistoryTooltip();
        }
    });

    indicator.addEventListener("click", (event) => {
        event.stopPropagation();

        if (!historyEnabled) return;

        if (historyTooltipLocked) {
            historyTooltipLocked = false;
            hideHistoryTooltip();
            return;
        }

        showHistoryTooltip(indicator, changes);
        historyTooltipLocked = true;
    });

    parent.appendChild(indicator);
}
function getChangesForField(item, field, currentChapter) {
    if (!item.ChangeHistory) return [];

    const results = [];

    for (const change of item.ChangeHistory) {
        if (change.chapter > currentChapter) continue;

        if (change.field === field) {
            results.push({
                chapter: change.chapter,
                description: change.description,
                change: change
            });
        }

        if (change.changes) {
            for (const nested of change.changes) {
                if (nested.field === field) {
                    results.push({
                        chapter: change.chapter,
                        description: change.description,
                        change: nested
                    });
                }
            }
        }
    }

    return results;
}
function escapeHtml(value) {
    if (value == null) return "";

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
function handleChange(change){
  const results=[]
  // Memory created / revealed
  if (change.type === "create") {
      results.push({
          chapter: change.chapter,
          description: change.description || "Created",
          change: change
      });
  }

  // name update
  if (change.field === "name") {
      results.push({
          chapter: change.chapter,
          description: change.description || `Name changed to "${change.value}"`,
          change: change
      });
  }

  // Destroyed
  if (change.type === "destroy") {
      results.push({
          chapter: change.chapter,
          description: change.description || "Destroyed",
          change: change
      });
  }

  // Given away
  if (change.type === "given_away") {
      results.push({
          chapter: change.chapter,
          description: change.description || "Given away",
          change: change
      });
  }

  // Nested name update
  if (change.changes) {
      for (const nested of change.changes) {
          results.push(...handleChange(nested))
      }
  }
  return results;
}
function getNameHistory(item, currentChapter) {
    if (!item.ChangeHistory) return [];

    const results = [];

    for (const change of item.ChangeHistory) {
        if (change.chapter > currentChapter) continue;
        results.push(...handleChange(change))//handles recursive due to changes beeing nested
    }
    return results.sort((a, b) => a.chapter - b.chapter);
}

function createPanelCloseButton() {
    const button = document.createElement("button");
    button.className = "panel-close";
    button.setAttribute("aria-label", "Close");
    button.textContent = "✖";
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        isclicked = false;
        hidePanel();
    });
    return button;
}

function showPanel(item, x, y) {
    panel.style.display = "block";
    panel.innerHTML = "";
    panel.appendChild(createPanelCloseButton());

    let desc = item.description || "—";
    desc = escapeHtml(desc).replace(/\r?\n/g, "</br>");

    const rankChanges = getChangesForField(item,"rank",currentChapter);
    const tierChanges = getChangesForField(item,"tier",currentChapter);
    const typeChanges = getChangesForField(item,"type",currentChapter);
    const descriptionChanges = getChangesForField(item,"description",currentChapter);
    const nameHistory = getNameHistory(item,currentChapter);

    // --------------------------------------------------
    // Title
    // --------------------------------------------------
    const title = document.createElement("h3");
    title.textContent = item.name || "—";
    addChangeIndicator(title, nameHistory);

    panel.appendChild(title);

    // --------------------------------------------------
    // Rank
    // --------------------------------------------------
    const rankRow = document.createElement("div");
    const rankLabel = document.createElement("b");
    rankLabel.textContent = "Rank:";
    rankRow.appendChild(rankLabel);
    rankRow.appendChild(document.createTextNode(` ${item.rank || "—"}`));
    addChangeIndicator(rankRow, rankChanges);

    panel.appendChild(rankRow);

    // --------------------------------------------------
    // Tier
    // --------------------------------------------------
    const tierRow = document.createElement("div");
    const tierLabel = document.createElement("b");
    tierLabel.textContent = "Tier:";
    tierRow.appendChild(tierLabel);
    tierRow.appendChild(document.createTextNode(` ${item.tier || "—"}`));
    addChangeIndicator(tierRow, tierChanges);

    panel.appendChild(tierRow);

    // --------------------------------------------------
    // Type
    // --------------------------------------------------
    if (item.type){
      const typeRow = document.createElement("div");
      const typeLabel = document.createElement("b");
      typeLabel.textContent = "Type:";
      typeRow.appendChild(typeLabel);
      typeRow.appendChild(document.createTextNode(` ${item.type || "—"}`));
      addChangeIndicator(typeRow, typeChanges);

      panel.appendChild(typeRow);
    }


    // --------------------------------------------------
    // Description
    // --------------------------------------------------
    if (item.description){
    }
    const descriptionRow = document.createElement("div");
    const descriptionLabel = document.createElement("b");
    descriptionLabel.textContent = "Description:";
    descriptionRow.appendChild(descriptionLabel);
    descriptionRow.appendChild(document.createElement("br"));
    const descriptionText = document.createElement("span");
    descriptionText.innerHTML = desc;
    descriptionRow.appendChild(descriptionText);
    addChangeIndicator(descriptionRow,descriptionChanges);

    panel.appendChild(descriptionRow);

    // --------------------------------------------------
    // Enchantments
    // --------------------------------------------------
    if (item.enchantments) {
        const enchantmentsTitle = document.createElement("div");
        enchantmentsTitle.style.marginTop = "6px";
        const enchantmentsLabel = document.createElement("b");
        enchantmentsLabel.textContent = "Enchantments:";

        enchantmentsTitle.appendChild(enchantmentsLabel);

        panel.appendChild(enchantmentsTitle);

        const list = document.createElement("ul");

        for (const enchantment of item.enchantments) {
            const li = document.createElement("li");
            const enchantmentName = document.createElement("div");
            const name = document.createElement("b");
            name.textContent = `[${enchantment.name || "—"}]`;
            enchantmentName.appendChild(name);

            // ------------------------------------------
            // History specifically for THIS enchantment
            // ------------------------------------------

            const enchantmentChanges = getEnchantmentChanges(item,enchantment.name,currentChapter);
            addChangeIndicator(enchantmentName,enchantmentChanges);
            li.appendChild(enchantmentName);

            // ------------------------------------------
            // Enchantment description
            // ------------------------------------------
            const enchantmentDescription = document.createElement("div");
            enchantmentDescription.style.fontSize = "13px";
            enchantmentDescription.style.opacity = "0.7";
            enchantmentDescription.innerHTML = escapeHtml(enchantment.description || "").replace(/\r?\n/g,"</br>");
            li.appendChild(enchantmentDescription);
            list.appendChild(li);
        }

        panel.appendChild(list);
    }

    // --------------------------------------------------
    // Position panel
    // --------------------------------------------------
    const offset = 12;
    x += offset;
    const panelRect = panel.getBoundingClientRect();
    const screenW = window.innerWidth;
    if (x + panelRect.width > screenW) {
        x = (x - offset) - panelRect.width - offset;
    }
    x = Math.max(10, Math.min(x, screenW - panelRect.width - 10));
    y = Math.max(10, Math.min(y, window.innerHeight - 130));
    panel.style.maxHeight = `${Math.max(100, window.innerHeight - y - 10)}px`;
    panel.style.left = `${x + window.scrollX}px`;
    panel.style.top = `${y + window.scrollY}px`;
}
function hidePanel() {
  if (!isclicked){
    historyTooltipLocked=false
    hideHistoryTooltip()
    panel.style.display = "none";
  }
}

fetch("./memories.json")
  .then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then(data => {
    items = validateMemories(data);
    renderItems()
  })
  .catch(error => {
    console.error("[memories] Could not load memory data; using an empty collection.", error);
    items = [];
    renderItems();
    document.getElementById("searchEmpty").hidden = true;
    document.getElementById("searchResults").textContent = "";
    document.getElementById("dataStatus").textContent = "Memories could not be loaded. Please reload to try again.";
  });
