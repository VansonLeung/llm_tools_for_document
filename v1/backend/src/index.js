import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { listAgents } from "./agents/index.js";
import { config } from "./config.js";
import { initializeSse, writeSseEvent } from "./lib/sse.js";
import { taskStore } from "./lib/taskStore.js";
import { runAgentTask } from "./services/agentRunner.js";
import { fileStore } from "./services/fileStore.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const allowedOrigins = new Set(config.corsOrigins);

function normalizeTaskMessageItem(item, index) {
  if (!item || typeof item !== "object") {
    throw new Error(`messages[${index}] must be an object.`);
  }

  if (!["user", "assistant"].includes(item.role)) {
    throw new Error(`messages[${index}].role must be either user or assistant.`);
  }

  if (!["text", "document-content"].includes(item.source)) {
    throw new Error(`messages[${index}].source must be either text or document-content.`);
  }

  if (item.source === "text") {
    const content = typeof item.content === "string" ? item.content.trim() : "";
    if (!content) {
      throw new Error(`messages[${index}].content is required for text messages.`);
    }

    return {
      role: item.role,
      source: item.source,
      content
    };
  }

  return {
    role: item.role,
    source: item.source
  };
}

function normalizeTaskInput(body) {
  const documentId = typeof body?.documentId === "string" ? body.documentId.trim() : "";
  const legacyMessage = typeof body?.message === "string" ? body.message.trim() : "";
  const systemPrompt = typeof body?.systemPrompt === "string" ? body.systemPrompt.trim() : "";
  const messages = Array.isArray(body?.messages)
    ? body.messages.map((item, index) => normalizeTaskMessageItem(item, index))
    : [];

  if (!documentId) {
    throw new Error("documentId is required.");
  }

  if (!legacyMessage && messages.length === 0) {
    throw new Error("message or messages are required.");
  }

  return {
    documentId,
    taskInput: {
      systemPrompt,
      messages: messages.length > 0
        ? messages
        : [
            {
              role: "user",
              source: "text",
              content: legacyMessage
            }
          ]
    }
  };
}

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.has(origin) || allowedOrigins.has("*")) {
      return callback(null, true);
    }

    return callback(new Error("Not allowed by CORS"));
  },
  credentials: false
}));
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    modelConfigured: Boolean(config.openaiApiKey),
    model: config.openaiModel
  });
});

app.get("/api/agents", (_req, res) => {
  res.json({
    agents: listAgents().map((agent) => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      capabilities: agent.capabilities,
      supportedDocumentKinds: agent.supportedDocumentKinds
    }))
  });
});

app.get("/api/documents", (_req, res) => {
  res.json({
    documents: fileStore.listDocuments()
  });
});

app.post("/api/documents/upload", upload.array("files"), async (req, res) => {
  try {
    const kind = req.body.kind;
    if (!["markdown", "paged-markdown", "json"].includes(kind)) {
      return res.status(400).json({
        error: "kind must be one of markdown, paged-markdown, or json."
      });
    }

    const files = req.files || [];
    const document = await fileStore.saveDocument({
      kind,
      files
    });

    return res.status(201).json({ document });
  } catch (error) {
    return res.status(400).json({
      error: error.message
    });
  }
});

app.post("/api/agents/:agentId/tasks", async (req, res) => {
  const { agentId } = req.params;
  let documentId;
  let taskInput;

  try {
    const normalized = normalizeTaskInput(req.body || {});
    documentId = normalized.documentId;
    taskInput = normalized.taskInput;
  } catch (error) {
    return res.status(400).json({
      error: error.message
    });
  }

  const task = taskStore.createTask({
    agentId,
    documentId,
    taskInput
  });

  res.status(202).json({
    taskId: task.id,
    task
  });

  runAgentTask({
    taskStore,
    taskId: task.id,
    agentId,
    documentId,
    taskInput
  }).catch((error) => {
    taskStore.failTask(task.id, error.message);
  });
});

app.get("/api/tasks/:taskId", (req, res) => {
  const task = taskStore.getTask(req.params.taskId);
  if (!task) {
    return res.status(404).json({ error: "Task not found." });
  }

  return res.json({ task });
});

app.get("/api/tasks/:taskId/stream", (req, res) => {
  const task = taskStore.getTask(req.params.taskId);
  if (!task) {
    return res.status(404).json({ error: "Task not found." });
  }

  initializeSse(res);
  writeSseEvent(res, "stream.ready", {
    taskId: task.id,
    status: task.status
  });

  for (const event of task.events) {
    writeSseEvent(res, event.type, event);
  }

  const unsubscribe = taskStore.subscribe(task.id, (event) => {
    writeSseEvent(res, event.type, event);
    if (event.type === "task.completed" || event.type === "task.failed") {
      res.end();
    }
  });

  req.on("close", () => {
    unsubscribe();
    res.end();
  });
});

app.listen(config.port, "0.0.0.0", async () => {
  await fileStore.ensureStorageDir();
  console.log(`Mini agentic backend listening on http://0.0.0.0:${config.port}`);
});