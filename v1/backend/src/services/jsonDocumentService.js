import fs from "node:fs/promises";

function getValueType(value) {
  if (Array.isArray(value)) {
    return "array";
  }

  if (value === null) {
    return "null";
  }

  return typeof value;
}

function formatPreview(value) {
  if (typeof value === "string") {
    return value.length > 120 ? `${value.slice(0, 120)}...` : value;
  }

  const serialized = JSON.stringify(value);
  return serialized.length > 120 ? `${serialized.slice(0, 120)}...` : serialized;
}

function parsePath(path) {
  if (typeof path !== "string" || !path.trim()) {
    throw new Error("path is required.");
  }

  const normalized = path.trim().replace(/^\$\.?/, "");
  if (!normalized) {
    return [];
  }

  const segments = [];
  const regex = /([^.\[\]]+)|\[(\d+)\]/g;
  let cursor = 0;

  for (const match of normalized.matchAll(regex)) {
    if (match.index !== cursor) {
      throw new Error(`Unsupported JSON path syntax: ${path}`);
    }

    cursor += match[0].length;
    if (match[0].startsWith("[")) {
      segments.push(Number(match[2]));
    } else {
      segments.push(match[1]);
    }

    if (normalized[cursor] === ".") {
      cursor += 1;
    }
  }

  if (cursor !== normalized.length) {
    throw new Error(`Unsupported JSON path syntax: ${path}`);
  }

  return segments;
}

function resolveValue(data, path) {
  const segments = parsePath(path);
  let current = data;

  for (const segment of segments) {
    if (typeof segment === "number") {
      if (!Array.isArray(current) || segment < 0 || segment >= current.length) {
        throw new Error(`JSON path not found: ${path}`);
      }
      current = current[segment];
      continue;
    }

    if (current === null || typeof current !== "object" || !(segment in current)) {
      throw new Error(`JSON path not found: ${path}`);
    }

    current = current[segment];
  }

  return current;
}

function collectStringFields(value, path = "$", items = []) {
  if (typeof value === "string") {
    items.push({
      path,
      value,
      preview: formatPreview(value)
    });
    return items;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectStringFields(entry, `${path}[${index}]`, items);
    });
    return items;
  }

  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) => {
      collectStringFields(entry, path === "$" ? `$.${key}` : `${path}.${key}`, items);
    });
  }

  return items;
}

export async function loadJsonDocument(document) {
  if (!document || document.kind !== "json") {
    throw new Error("A json document is required.");
  }

  const content = await fs.readFile(document.files[0].path, "utf8");

  let data;
  try {
    data = JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON document: ${error.message}`);
  }

  const stringFields = collectStringFields(data);

  return {
    content,
    data,
    stringFields,
    topLevelType: getValueType(data)
  };
}

export function readJsonDocument(jsonDocument) {
  return {
    topLevelType: jsonDocument.topLevelType,
    stringFieldCount: jsonDocument.stringFields.length,
    json: jsonDocument.data,
    prettyJson: JSON.stringify(jsonDocument.data, null, 2)
  };
}

export function readJsonValue(jsonDocument, path) {
  const value = resolveValue(jsonDocument.data, path);
  return {
    path,
    valueType: getValueType(value),
    value,
    prettyValue: typeof value === "string" ? value : JSON.stringify(value, null, 2)
  };
}

export function listJsonStringFields(jsonDocument, limit = 200) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("limit must be a positive integer.");
  }

  return {
    totalStringFields: jsonDocument.stringFields.length,
    fields: jsonDocument.stringFields.slice(0, limit)
  };
}