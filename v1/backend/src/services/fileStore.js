import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

function sanitizeFilename(filename) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function sortByPageName(left, right) {
  return left.originalName.localeCompare(right.originalName, undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

class FileStore {
  constructor() {
    this.documents = new Map();
  }

  async ensureStorageDir() {
    await fs.mkdir(config.storageDir, { recursive: true });
  }

  async saveDocument({ kind, files }) {
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error("At least one file is required.");
    }

    if (kind === "markdown" && files.length !== 1) {
      throw new Error("Markdown uploads must contain exactly one file.");
    }

    await this.ensureStorageDir();

    const documentId = randomUUID();
    const documentDir = path.join(config.storageDir, documentId);
    await fs.mkdir(documentDir, { recursive: true });

    const storedFiles = [];

    for (const file of files) {
      const safeName = sanitizeFilename(file.originalname);
      const storedName = `${Date.now()}-${safeName}`;
      const fullPath = path.join(documentDir, storedName);
      await fs.writeFile(fullPath, file.buffer);

      storedFiles.push({
        id: randomUUID(),
        originalName: file.originalname,
        storedName,
        path: fullPath
      });
    }

    storedFiles.sort(sortByPageName);

    const document = {
      id: documentId,
      kind,
      name: kind === "markdown" ? storedFiles[0].originalName : path.basename(documentDir),
      uploadedAt: new Date().toISOString(),
      files: storedFiles.map((file, index) => ({
        ...file,
        pageNumber: kind === "paged-markdown" ? index + 1 : null
      }))
    };

    this.documents.set(documentId, document);
    return document;
  }

  getDocument(documentId) {
    return this.documents.get(documentId) || null;
  }

  listDocuments() {
    return Array.from(this.documents.values()).sort((left, right) => {
      return right.uploadedAt.localeCompare(left.uploadedAt);
    });
  }
}

export const fileStore = new FileStore();