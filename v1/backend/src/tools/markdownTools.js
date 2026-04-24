import {
  countWordsByLineRange,
  extractTextByLineRange,
  loadMarkdownDocument,
  locateSectionRange
} from "../services/markdownDocumentService.js";

export async function buildMarkdownTools(document) {
  const markdownDocument = await loadMarkdownDocument(document);

  return [
    {
      definition: {
        type: "function",
        function: {
          name: "locate_markdown_section_range",
          description: "Locate the line range for a target markdown section heading.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The heading text or partial heading text to find."
              }
            },
            required: ["query"],
            additionalProperties: false
          }
        }
      },
      async execute({ query }) {
        const section = locateSectionRange(markdownDocument, query);
        return {
          title: section.title,
          startLine: section.startLine,
          endLine: section.endLine
        };
      }
    },
    {
      definition: {
        type: "function",
        function: {
          name: "count_markdown_words_in_range",
          description: "Count the words in a markdown document line range.",
          parameters: {
            type: "object",
            properties: {
              startLine: {
                type: "integer",
                description: "Inclusive start line number."
              },
              endLine: {
                type: "integer",
                description: "Inclusive end line number."
              }
            },
            required: ["startLine", "endLine"],
            additionalProperties: false
          }
        }
      },
      async execute({ startLine, endLine }) {
        return {
          startLine,
          endLine,
          wordCount: countWordsByLineRange(markdownDocument, startLine, endLine)
        };
      }
    },
    {
      definition: {
        type: "function",
        function: {
          name: "extract_markdown_text_in_range",
          description: "Extract text or matching words from a markdown document line range.",
          parameters: {
            type: "object",
            properties: {
              startLine: {
                type: "integer",
                description: "Inclusive start line number."
              },
              endLine: {
                type: "integer",
                description: "Inclusive end line number."
              },
              pattern: {
                type: "string",
                description: "Optional literal text to extract within the selected range."
              }
            },
            required: ["startLine", "endLine"],
            additionalProperties: false
          }
        }
      },
      async execute({ startLine, endLine, pattern = "" }) {
        return {
          startLine,
          endLine,
          pattern,
          extracted: extractTextByLineRange(markdownDocument, startLine, endLine, pattern)
        };
      }
    }
  ];
}