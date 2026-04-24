import fs from "node:fs/promises";

function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseHeadingCandidate(line) {
  const markdownMatch = line.match(/^(#{1,6})\s+(.+)$/);
  if (markdownMatch) {
    return {
      title: markdownMatch[2].trim(),
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

export async function loadPagedMarkdownDocument(document) {
  if (!document || document.kind !== "paged-markdown") {
    throw new Error("A paged markdown document is required.");
  }

  const pages = [];

  for (const file of document.files) {
    const content = await fs.readFile(file.path, "utf8");
    pages.push({
      pageNumber: file.pageNumber,
      originalName: file.originalName,
      lines: content.split(/\r?\n/)
    });
  }

  const sections = [];

  pages.forEach((page) => {
    page.lines.forEach((line, index) => {
      const candidate = parseHeadingCandidate(line);
      if (!candidate) {
        return;
      }

      if (normalize(candidate.title) === `page ${page.pageNumber}`) {
        return;
      }

      sections.push({
        ...candidate,
        pageNumber: page.pageNumber,
        lineNumber: index + 1
      });
    });
  });

  return {
    pages,
    sections
  };
}

function resolvePageRange(pagedDocument, startPage, endPage) {
  const firstPage = pagedDocument.pages[0]?.pageNumber || 1;
  const lastPage = pagedDocument.pages[pagedDocument.pages.length - 1]?.pageNumber || 1;

  if (!Number.isInteger(startPage) || !Number.isInteger(endPage)) {
    throw new Error("startPage and endPage must be integers.");
  }

  if (startPage > endPage) {
    throw new Error(`Page range ${startPage}-${endPage} is invalid.`);
  }

  const effectiveStartPage = Math.max(startPage, firstPage);
  const effectiveEndPage = Math.min(endPage, lastPage);
  const hasOverlap = effectiveStartPage <= effectiveEndPage;

  return {
    requestedPageRange: {
      startPage,
      endPage
    },
    effectivePageRange: hasOverlap
      ? {
          startPage: effectiveStartPage,
          endPage: effectiveEndPage
        }
      : null,
    firstPage,
    lastPage,
    hasOverlap
  };
}

function getPagesInRange(pagedDocument, startPage, endPage) {
  const resolvedRange = resolvePageRange(pagedDocument, startPage, endPage);
  const pages = resolvedRange.hasOverlap
    ? pagedDocument.pages.filter((page) => {
        return page.pageNumber >= resolvedRange.effectivePageRange.startPage && page.pageNumber <= resolvedRange.effectivePageRange.endPage;
      })
    : [];

  return {
    ...resolvedRange,
    pages
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function locateSectionPageRange(pagedDocument, query) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    throw new Error("query is required.");
  }

  const exact = pagedDocument.sections.find((section) => normalize(section.title) === normalizedQuery);
  const partial = pagedDocument.sections.find((section) => normalize(section.title).includes(normalizedQuery));
  const match = exact || partial;

  if (!match) {
    throw new Error(`No paged markdown section matched \"${query}\".`);
  }

  const currentIndex = pagedDocument.sections.findIndex((section) => {
    return section.pageNumber === match.pageNumber && section.lineNumber === match.lineNumber;
  });
  const nextSection = pagedDocument.sections[currentIndex + 1] || null;
  const lastPage = pagedDocument.pages[pagedDocument.pages.length - 1]?.pageNumber || match.pageNumber;

  return {
    title: match.title,
    startPage: match.pageNumber,
    endPage: nextSection ? nextSection.pageNumber : lastPage,
    startLine: match.lineNumber,
    nextSectionTitle: nextSection?.title || null
  };
}

export function searchPages(
  pagedDocument,
  {
    query,
    startPage = pagedDocument.pages[0]?.pageNumber || 1,
    endPage = pagedDocument.pages[pagedDocument.pages.length - 1]?.pageNumber || 1,
    useRegex = false,
    caseSensitive = false
  }
) {
  if (typeof query !== "string" || !query.trim()) {
    throw new Error("query is required.");
  }

  const range = getPagesInRange(pagedDocument, startPage, endPage);
  const flags = caseSensitive ? "g" : "gi";
  const pattern = useRegex ? query : escapeRegExp(query);

  let matcher;
  try {
    matcher = new RegExp(pattern, flags);
  } catch {
    throw new Error(`Invalid regular expression: ${query}`);
  }

  const matches = [];

  for (const page of range.pages) {
    const matchingLines = [];

    page.lines.forEach((line, index) => {
      const lineMatches = Array.from(line.matchAll(matcher));
      if (lineMatches.length === 0) {
        return;
      }

      matchingLines.push({
        lineNumber: index + 1,
        text: line,
        matchCount: lineMatches.length
      });
    });

    if (matchingLines.length > 0) {
      matches.push({
        pageNumber: page.pageNumber,
        matchCount: matchingLines.reduce((sum, line) => sum + line.matchCount, 0),
        matchingLines
      });
    }
  }

  return {
    query,
    useRegex,
    caseSensitive,
    requestedPageRange: range.requestedPageRange,
    effectivePageRange: range.effectivePageRange,
    availablePageRange: {
      startPage: range.firstPage,
      endPage: range.lastPage
    },
    totalMatchingPages: matches.length,
    matches
  };
}

export function readPages(
  pagedDocument,
  {
    startPage,
    endPage
  }
) {
  const range = getPagesInRange(pagedDocument, startPage, endPage);

  return {
    requestedPageRange: range.requestedPageRange,
    effectivePageRange: range.effectivePageRange,
    availablePageRange: {
      startPage: range.firstPage,
      endPage: range.lastPage
    },
    pages: range.pages.map((page) => ({
      pageNumber: page.pageNumber,
      content: page.lines.join("\n")
    }))
  };
}