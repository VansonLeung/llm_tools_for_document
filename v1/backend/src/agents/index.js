import { buildMarkdownTools } from "../tools/markdownTools.js";
import { buildPagedMarkdownSearchTools, buildPagedMarkdownTools } from "../tools/pagedMarkdownTools.js";

const agents = [
  {
    id: "markdown-vetting",
    name: "Markdown Vetting Agent",
    description: "Vets a single markdown document with line-aware lookup and extraction tools.",
    supportedDocumentKinds: ["markdown"],
    capabilities: [
      "Locate a target section line range",
      "Count words in a selected line range",
      "Extract text or literal matches from a selected line range"
    ],
    async buildTools(document) {
      return buildMarkdownTools(document);
    },
    buildSystemPrompt(document) {
      return [
        "You are a markdown vetting agent.",
        `You are analyzing the uploaded markdown document named \"${document.name}\".`,
        "Use tools before making factual claims about line ranges or extracted text.",
        "When you report findings, cite the relevant line range explicitly."
      ].join(" ");
    }
  },
  {
    id: "paged-markdown-vetting",
    name: "Paged Markdown Vetting Agent",
    description: "Vets a paged markdown document with page-range lookup tools.",
    supportedDocumentKinds: ["paged-markdown"],
    capabilities: [
      "Locate a target section page range",
      "Reason about section boundaries across sequential markdown pages"
    ],
    async buildTools(document) {
      return buildPagedMarkdownTools(document);
    },
    buildSystemPrompt(document) {
      return [
        "You are a paged markdown vetting agent.",
        `You are analyzing the uploaded paged markdown set named \"${document.name}\".`,
        "Use tools before making factual claims about page ranges.",
        "When you report findings, cite the relevant page range explicitly."
      ].join(" ");
    }
  },
  {
    id: "paged-markdown-unstructured-vetting",
    name: "Paged Markdown Unstructured Vetting Agent",
    description: "Vets unstructured paged markdown with page search and page reading tools.",
    supportedDocumentKinds: ["paged-markdown"],
    capabilities: [
      "Search pages by keyword or regex",
      "Limit searches to a page window",
      "Read raw page text across an inclusive page range"
    ],
    async buildTools(document) {
      return buildPagedMarkdownSearchTools(document);
    },
    buildSystemPrompt(document) {
      return [
        "You are an unstructured paged markdown vetting agent.",
        `You are analyzing the uploaded paged markdown set named \"${document.name}\".`,
        "Assume the source came from an unstructured PDF conversion, so headings may be unreliable.",
        "Use search_pages to discover relevant pages, then use read_pages to inspect the exact page content before answering.",
        "When you report findings, cite the relevant page numbers explicitly."
      ].join(" ");
    }
  }
];

export function listAgents() {
  return agents;
}

export function getAgentById(agentId) {
  return agents.find((agent) => agent.id === agentId) || null;
}