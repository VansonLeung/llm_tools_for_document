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
    if (!["markdown", "paged-markdown"].includes(kind)) {
      return res.status(400).json({
        error: "kind must be either markdown or paged-markdown."
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
  const { documentId, message } = req.body || {};

  if (!documentId || !message) {
    return res.status(400).json({
      error: "documentId and message are required."
    });
  }

  const task = taskStore.createTask({
    agentId,
    documentId,
    message
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
    message
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