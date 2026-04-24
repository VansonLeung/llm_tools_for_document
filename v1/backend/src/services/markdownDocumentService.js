import fs from "node:fs/promises";

function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseHeadingCandidate(line) {
  const markdownMatch = line.match(/^(#{1,6})\s+(.+)$/);
  if (markdownMatch) {
    const title = markdownMatch[2].trim();
    if (/^page\s+\d+$/i.test(title)) {
      return null;
    }

    return {
      title,
      level: markdownMatch[1].length
    };
  }

  if (/^\([a-z]\)\s+/i.test(line)) {
    return {
      title: line.trim(),
      level: 4
    };
  }

  if (/^[A-Z]\.[\s\S]+/.test(line)) {
    return {
      title: line.trim(),
      level: 3
    };
  }

  if (/^[A-Z][A-Z0-9\s'(),.&\-/]+$/.test(line.trim()) && line.trim().length > 4) {
    return {
      title: line.trim(),
      level: 2
    };
  }

  return null;
}

function buildSections(lines) {
  const headings = [];

  lines.forEach((line, index) => {
    const candidate = parseHeadingCandidate(line);
    if (!candidate) {
      return;
    }

    headings.push({
      title: candidate.title,
      level: candidate.level,
      startLine: index + 1
    });
  });

  return headings.map((heading, index) => {
    let endLine = lines.length;
    for (let cursor = index + 1; cursor < headings.length; cursor += 1) {
      if (headings[cursor].level <= heading.level) {
        endLine = headings[cursor].startLine - 1;
        break;
      }
    }

    return {
      ...heading,
      endLine
    };
  });
}

function validateLineRange(lines, startLine, endLine) {
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) {
    throw new Error("startLine and endLine must be integers.");
  }

  if (startLine < 1 || endLine > lines.length || startLine > endLine) {
    throw new Error(`Line range ${startLine}-${endLine} is invalid for a ${lines.length}-line document.`);
  }
}

export async function loadMarkdownDocument(document) {
  if (!document || document.kind !== "markdown") {
    throw new Error("A markdown document is required.");
  }

  const content = await fs.readFile(document.files[0].path, "utf8");
  const lines = content.split(/\r?\n/);
  return {
    content,
    lines,
    sections: buildSections(lines)
  };
}

export function locateSectionRange(markdownDocument, query) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    throw new Error("query is required.");
  }

  const exact = markdownDocument.sections.find((section) => normalize(section.title) === normalizedQuery);
  const partial = markdownDocument.sections.find((section) => normalize(section.title).includes(normalizedQuery));
  const section = exact || partial;

  if (!section) {
    throw new Error(`No markdown section matched \"${query}\".`);
  }

  return section;
}

export function countWordsByLineRange(markdownDocument, startLine, endLine) {
  validateLineRange(markdownDocument.lines, startLine, endLine);
  const text = markdownDocument.lines.slice(startLine - 1, endLine).join(" ");
  const matches = text.match(/\b[^\s]+\b/g) || [];
  return matches.length;
}

export function extractTextByLineRange(markdownDocument, startLine, endLine, pattern = "") {
  validateLineRange(markdownDocument.lines, startLine, endLine);
  const text = markdownDocument.lines.slice(startLine - 1, endLine).join("\n");
  if (!pattern) {
    return text;
  }

  const regex = new RegExp(escapeRegExp(pattern), "gi");
  const matches = text.match(regex) || [];
  return matches;
}