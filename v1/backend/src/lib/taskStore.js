import { randomUUID } from "node:crypto";

class TaskStore {
  constructor() {
    this.tasks = new Map();
  }

  createTask({ agentId, documentId, taskInput }) {
    const message = summarizeTaskInput(taskInput);
    const task = {
      id: randomUUID(),
      agentId,
      documentId,
      message,
      messageInput: taskInput,
      status: "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      events: [],
      listeners: new Set(),
      result: "",
      error: null
    };

    this.tasks.set(task.id, task);
    this.appendEvent(task.id, "task.created", {
      status: task.status,
      agentId,
      documentId,
      message,
      messageInput: taskInput
    });
    return task;
  }

  getTask(taskId) {
    return this.tasks.get(taskId) || null;
  }

  appendEvent(taskId, type, payload) {
    const task = this.getTask(taskId);
    if (!task) {
      return;
    }

    const event = {
      id: randomUUID(),
      type,
      timestamp: new Date().toISOString(),
      payload
    };

    task.updatedAt = event.timestamp;
    task.events.push(event);

    for (const listener of task.listeners) {
      listener(event);
    }
  }

  setStatus(taskId, status, payload = {}) {
    const task = this.getTask(taskId);
    if (!task) {
      return;
    }

    task.status = status;
    this.appendEvent(taskId, "task.updated", {
      status,
      ...payload
    });
  }

  setResult(taskId, result) {
    const task = this.getTask(taskId);
    if (!task) {
      return;
    }

    task.result = result;
  }

  failTask(taskId, errorMessage) {
    const task = this.getTask(taskId);
    if (!task) {
      return;
    }

    task.error = errorMessage;
    task.status = "failed";
    this.appendEvent(taskId, "task.failed", {
      message: errorMessage
    });
  }

  completeTask(taskId, result) {
    const task = this.getTask(taskId);
    if (!task) {
      return;
    }

    task.result = result;
    task.status = "completed";
    this.appendEvent(taskId, "task.completed", {
      result
    });
  }

  subscribe(taskId, listener) {
    const task = this.getTask(taskId);
    if (!task) {
      throw new Error("Task not found.");
    }

    task.listeners.add(listener);
    return () => {
      task.listeners.delete(listener);
    };
  }
}

function summarizeTaskInput(taskInput) {
  const messages = Array.isArray(taskInput?.messages) ? taskInput.messages : [];

  if (messages.length === 1 && messages[0].source === "text" && messages[0].role === "user") {
    return messages[0].content;
  }

  const parts = [];
  if (taskInput?.systemPrompt) {
    parts.push("system prompt");
  }
  parts.push(`${messages.length} message${messages.length === 1 ? "" : "s"}`);
  return `Composite input (${parts.join(", ")})`;
}

export const taskStore = new TaskStore();