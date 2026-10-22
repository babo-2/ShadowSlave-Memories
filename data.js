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
