/** Detects devices without hover (phones, tablets), where mouse-over interactions don't apply. */
class InputMode {
  static #noHover = window.matchMedia("(hover: none)");

  static get isTouch() {
    return InputMode.#noHover.matches;
  }
}

let items = [];

let tiers = {"?": 0, "I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7};
let ranks = {"?": 0, "Dormant": 1, "Awakened": 2, "Ascended": 3, "Transcendent": 4, "Supreme": 5, "Sacred": 6, "Divine": 7};

let currentChapter = Number(localStorage.getItem("currentChapter")) || 500;

//load items from storage
let glintRanks=loadList("glintRanks", ['Divine']);
let glintTiers=loadList("glintTiers", ['VII']);
let generalSettings=loadList("generalSettings", {"history": true});

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

let historyTooltip = null;
let historyTooltipLocked = false;
panel.addEventListener("click", (e) => {
  e.stopPropagation()
  if (document.querySelector(".dropdown").classList.contains("open")){
    document.querySelector(".dropdown").classList.toggle("open");
  }
  if (!historyTooltipLocked) return;
  if (historyTooltip.contains(event.target)) return;
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

function loadBackgroundColors(){//general load() function
  let colorBy = localStorage.getItem("colorBy") || "rank";
  document.getElementById("colorBy").value=colorBy;
  document.querySelectorAll(".colorBySection").forEach(s => s.classList.remove("active"));
  document.getElementById("colorBySection-"+colorBy).classList.add("active")
  
  let tiersList = ["I", "II", "III", "IV", "V", "VI", "VII", "?"];
  let colorInputs=document.getElementById("colorBySection-tier").querySelectorAll("input");
  loadList("colorsTier", ["#7f8c8d", "#27ae60", "#2980b9", "#8e44ad", "#ff01c8", "#0400f3", "#f39c12", "#14141480"]).forEach((color, i) => {
    colorInputs[i].value=color;
    if (colorBy=="tier") ApplyBackgroundColors("tier-"+tiersList[i], color);
  })
  let ranksList=["Dormant", "Awakened", "Ascended", "Transcendent", "Supreme", "Sacred", "Divine", "?"];
  colorInputs=document.getElementById("colorBySection-rank").querySelectorAll("input");
  loadList("colorsRank", ["#7f8c8d", "#27ae60", "#2980b9", "#8e44ad", "#ff01c8", "#0400f3", "#f39c12", "#14141480"]).forEach((color, i) => {
    colorInputs[i].value=color;
    if (colorBy=="rank") ApplyBackgroundColors("rank-"+ranksList[i], color);
  })
}
function setColorBy(type="colorBy"){
  document.querySelectorAll("."+type+"Section").forEach(s => s.classList.remove("active"));
  document.getElementById(type+"Section-"+document.getElementById(type).value).classList.add("active")
  localStorage.setItem("colorBy", document.getElementById("colorBy").value)//or save()
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

function ApplyBackgroundColors(type, color){
  document.querySelectorAll("."+type.replace("?", "\\?")).forEach(item => {
    item.style.backgroundColor=color
  })
  save()
}

function resetColors(type){
  if (!confirm("Are you sure you want to reset the memory background colors?")) return;
  original = ["#7f8c8d", "#27ae60", "#2980b9", "#8e44ad", "#ff01c8", "#0400f3", "#f39c12", "#14141480"]
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

//SEARCH
slider.value=currentChapter;
chapterInput.value=currentChapter;
ascbtn.addEventListener("click", () => {
  asc = !asc;
  ascbtn.textContent = asc ? "↑" : "↓";
  renderItems();
});
slider.addEventListener("input", () => {//only visual, no update
    const value = (slider.value - slider.min) / (slider.max - slider.min) * 100;
    slider.style.background = `linear-gradient(
      to right,
      #ffffff 0%,
      #ffffff ${value}%,
      rgba(6,6,6,0.7) ${value}%,
      rgba(6,6,6,0.7) 100%
    )`;
    chapterInput.value=slider.value;
    currentChapter = slider.value;
});
slider.addEventListener("change", () => {//update
    renderItems()
    localStorage.setItem("currentChapter", currentChapter+"")
});
chapterInput.addEventListener("change", ()=>{//update
  slider.value=chapterInput.value;
  currentChapter=chapterInput.value;
  renderItems();
})
document.getElementById("searchInput").addEventListener("input", (e) => {
  renderItems()
})

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

const dropdownSelect = document.querySelector(".dropdown-select");
const buttonSelect = dropdownSelect.querySelector(".dropdown-select-button");
const menuSelect = dropdownSelect.querySelector(".dropdown-select-menu");
let valueSelect = "rank";
buttonSelect.onclick = event => {
    event.stopPropagation()
    dropdownSelect.classList.toggle("open");
    if (document.querySelector(".dropdown").classList.contains("open")){
      document.querySelector(".dropdown").classList.toggle("open");
    }
};
menuSelect.onclick = event => {
    event.stopPropagation()
    const option = event.target.closest("[data-value]");
    if (!option) return;

    if (option.dataset.value==valueSelect) return;
    valueSelect = option.dataset.value;
    buttonSelect.querySelector("span").textContent = option.textContent;
    dropdownSelect.classList.remove("open");
    renderItems()
};

//close all with click
document.addEventListener("click", () => {
  if (isclicked){
    isclicked=false;
    hidePanel()
  }else{
    if (sortedWith!=currentChapter){
      renderItems();
    }
  }
  if (document.querySelector(".dropdown").classList.contains("open")){
    document.querySelector(".dropdown").classList.toggle("open");
  }
  if (dropdownSelect.classList.contains("open")){
    dropdownSelect.classList.toggle("open");
  }
})

function toggleDropdown() {
  document.querySelector(".dropdown").classList.toggle("open");
  if (dropdownSelect.classList.contains("open")){
    dropdownSelect.classList.toggle("open");
  }
  event.stopPropagation();
}
function loadList(list, defaultReturn){
  lst = localStorage.getItem(list);
  if (!lst){
    return defaultReturn;
  }else{
    return JSON.parse(lst);
  }
}
function save_general_settings(){
  localStorage.setItem("generalSettings", JSON.stringify(generalSettings))
}
function save(){
  localStorage.setItem("glintRanks", JSON.stringify(glintRanks));
  localStorage.setItem("glintTiers", JSON.stringify(glintTiers));
  let colorsTier=[];
  let colorsRank=[];
  document.getElementById("colorBySection-tier").querySelectorAll("input").forEach(input => colorsTier.push(input.value));
  document.getElementById("colorBySection-rank").querySelectorAll("input").forEach(input => colorsRank.push(input.value));
  localStorage.setItem("colorsTier", JSON.stringify(colorsTier))//WHY IS IT REVERSED???
  localStorage.setItem("colorsRank", JSON.stringify(colorsRank))
  localStorage.setItem("colorBy", document.getElementById("colorBy").value)
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


function SearchFilter(data, query=""){
  const checked = [...document.querySelectorAll(".dropdown-menu input:checked")].map(cb => cb.value);
  const result = data.filter((item) => {
    if (query=="") return true;
    for (const FilterType of checked){
      if (!item[FilterType.split("-")[0]]) continue;
      if (FilterType.includes("-")){
        for (const ench of item[FilterType.split("-")[0]]){
          if (ench[FilterType.split("-")[1]] && ench[FilterType.split("-")[1]].toLowerCase().includes(query.toLowerCase())){
            return true;
          }
        }
        return false;
      }
      if (item[FilterType].toLowerCase().includes(query.toLowerCase())){
        return true;
      }
    }
    return false;
  });
  return result;
}
function renderItems(query="") {
  if (!query){
    query=document.getElementById("searchInput").value
  }
  let [owned, destroyed, given_away] = updateHistory(items, currentChapter)
  owned = SearchFilter(owned, query)
  destroyed = SearchFilter(destroyed, query)
  given_away = SearchFilter(given_away, query)
  let [OwnedItems, DestroyedItems, given_away_items] = sortItems(owned, destroyed, given_away, currentChapter);
  //OWNED
  grid_owned.innerHTML="";
  OwnedItems.forEach(item => {
    grid_owned.appendChild(createItem(item));
  });
  requestAnimationFrame(() => {grid_owned.style.maxHeight = (10+grid_owned.scrollHeight) + "px";});//fixes bug that scrollHeight is 0 sometimes
  grid_owned.parentElement.style.display = OwnedItems.length ? "" : "none";

  //DESTROYED
  grid_destroyed.innerHTML="";
  DestroyedItems.forEach(item => {
    grid_destroyed.appendChild(createItem(item))
  })
  requestAnimationFrame(() => {grid_destroyed.style.maxHeight = (10+grid_destroyed.scrollHeight) + "px";});
  grid_destroyed.parentElement.style.display = DestroyedItems.length ? "" : "none";

  //GIVEN AWAY
  grid_given_away.innerHTML="";
  given_away_items.forEach(item => {
  grid_given_away.appendChild(createItem(item))
  })
  requestAnimationFrame(() => {grid_given_away.style.maxHeight = (10+grid_given_away.scrollHeight) + "px";});
  grid_given_away.parentElement.style.display = given_away_items.length ? "" : "none";
  
  loadBackgroundColors()
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
        <div class="item-name">${item.name}</div>
        <div class="item-tier">${item.tier}</div>
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
        if (document.querySelector(".dropdown").classList.contains("open")){
          document.querySelector(".dropdown").classList.toggle("open");
        }
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
                        Object.assign(field, change.value);
                    }
                }
            } else {
                item[change.field] = change.value;
            }
            break;
        case "add":
            item[change.field] = append(item[change.field], change.value);
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
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    const availableHeight = (window.innerHeight - y) - 50;
    panel.style.maxHeight = `${availableHeight}px`;
}
function hidePanel() {
  if (!isclicked){
    historyTooltipLocked=false
    hideHistoryTooltip()
    panel.style.display = "none";
  }
}

fetch("/memories.json")
  .then(response => response.json())
  .then(data => {
    items = data;
    renderItems()
  }
);