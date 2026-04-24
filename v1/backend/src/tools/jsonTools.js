import {
  listJsonStringFields,
  loadJsonDocument,
  readJsonDocument,
  readJsonValue
} from "../services/jsonDocumentService.js";

export async function buildJsonTools(document) {
  const jsonDocument = await loadJsonDocument(document);

  return [
    {
      definition: {
        type: "function",
        function: {
          name: "read_json_document",
          description: "Read the uploaded JSON document and return its parsed content.",
          parameters: {
            type: "object",
            properties: {},
            additionalProperties: false
          }
        }
      },
      async execute() {
        return readJsonDocument(jsonDocument);
      }
    },
    // {
    //   definition: {
    //     type: "function",
    //     function: {
    //       name: "read_json_value",
    //       description: "Read a specific value from the JSON document by path such as $.person.name or $.items[0].title.",
    //       parameters: {
    //         type: "object",
    //         properties: {
    //           path: {
    //             type: "string",
    //             description: "JSON path starting at $, using dot notation and [index] for arrays."
    //           }
    //         },
    //         required: ["path"],
    //         additionalProperties: false
    //       }
    //     }
    //   },
    //   async execute({ path }) {
    //     return readJsonValue(jsonDocument, path);
    //   }
    // },
    // {
    //   definition: {
    //     type: "function",
    //     function: {
    //       name: "list_json_string_fields",
    //       description: "List string-valued JSON fields and their paths to help identify candidate fields for rewriting.",
    //       parameters: {
    //         type: "object",
    //         properties: {
    //           limit: {
    //             type: "integer",
    //             description: "Maximum number of string fields to return. Defaults to 200."
    //           }
    //         },
    //         additionalProperties: false
    //       }
    //     }
    //   },
    //   async execute({ limit = 200 }) {
    //     return listJsonStringFields(jsonDocument, limit);
    //   }
    // }
  ];
}