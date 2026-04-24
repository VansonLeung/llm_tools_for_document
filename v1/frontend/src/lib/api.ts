export type Agent = {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  supportedDocumentKinds: Array<"markdown" | "paged-markdown">;
};

export type DocumentRecord = {
  id: string;
  kind: "markdown" | "paged-markdown";
  name: string;
  uploadedAt: string;
  files: Array<{
    id: string;
    originalName: string;
    storedName: string;
    path: string;
    pageNumber: number | null;
  }>;
};

export type TaskEvent = {
  id: string;
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
};

export type TaskRecord = {
  id: string;
  agentId: string;
  documentId: string;
  message: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  result: string;
  error: string | null;
  events: TaskEvent[];
};

const apiBase = import.meta.env.VITE_API_URL || "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, init);
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(errorBody.error || "Request failed.");
  }

  return response.json() as Promise<T>;
}

export function getApiBase() {
  return apiBase;
}

export async function fetchHealth() {
  return request<{ ok: boolean; modelConfigured: boolean; model: string }>("/health");
}

export async function fetchAgents() {
  return request<{ agents: Agent[] }>("/agents");
}

export async function fetchDocuments() {
  return request<{ documents: DocumentRecord[] }>("/documents");
}

export async function uploadDocument(kind: "markdown" | "paged-markdown", files: File[]) {
  const formData = new FormData();
  formData.append("kind", kind);
  files.forEach((file) => formData.append("files", file));
  return request<{ document: DocumentRecord }>("/documents/upload", {
    method: "POST",
    body: formData
  });
}

export async function createTask(agentId: string, documentId: string, message: string) {
  return request<{ taskId: string; task: TaskRecord }>(`/agents/${agentId}/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ documentId, message })
  });
}