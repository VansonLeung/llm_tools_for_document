import {
  loadPagedMarkdownDocument,
  locateSectionPageRange,
  readPages,
  searchPages
} from "../services/pagedMarkdownService.js";

export async function buildPagedMarkdownTools(document) {
  const pagedDocument = await loadPagedMarkdownDocument(document);

  return [
    {
      definition: {
        type: "function",
        function: {
          name: "locate_paged_markdown_section_pages",
          description: "Locate the page range for a target section in a paged markdown document.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The section title or partial title to find."
              }
            },
            required: ["query"],
            additionalProperties: false
          }
        }
      },
      async execute({ query }) {
        return locateSectionPageRange(pagedDocument, query);
      }
    }
  ];
}

export async function buildPagedMarkdownSearchTools(document) {
  const pagedDocument = await loadPagedMarkdownDocument(document);

  return [
    {
      definition: {
        type: "function",
        function: {
          name: "search_pages",
          description: "Search paged markdown text by keyword or regex, optionally within a page range.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Keyword text or regular expression pattern to search for."
              },
              startPage: {
                type: "integer",
                description: "Optional inclusive start page number. Defaults to the first page."
              },
              endPage: {
                type: "integer",
                description: "Optional inclusive end page number. Defaults to the last page."
              },
              useRegex: {
                type: "boolean",
                description: "Set true to treat query as a regular expression pattern."
              },
              caseSensitive: {
                type: "boolean",
                description: "Set true to make the search case-sensitive."
              }
            },
            required: ["query"],
            additionalProperties: false
          }
        }
      },
      async execute(args) {
        return searchPages(pagedDocument, args);
      }
    },
    {
      definition: {
        type: "function",
        function: {
          name: "read_pages",
          description: "Read the full text content for an inclusive page range.",
          parameters: {
            type: "object",
            properties: {
              startPage: {
                type: "integer",
                description: "Inclusive start page number."
              },
              endPage: {
                type: "integer",
                description: "Inclusive end page number."
              }
            },
            required: ["startPage", "endPage"],
            additionalProperties: false
          }
        }
      },
      async execute(args) {
        return readPages(pagedDocument, args);
      }
    }
  ];
}