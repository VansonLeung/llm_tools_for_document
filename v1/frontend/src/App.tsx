import { useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import { Activity, Bot, FileText, LoaderCircle, Menu, Sparkles, Upload, X } from "lucide-react";
import { fetchAgents, fetchDocuments, fetchHealth, createTask, getApiBase, uploadDocument, type Agent, type DocumentRecord, type TaskEvent } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type HealthState = {
  ok: boolean;
  modelConfigured: boolean;
  model: string;
};

type ViewTab = "response" | "events";

const streamEventTypes = [
  "stream.ready",
  "task.created",
  "task.updated",
  "agent.started",
  "agent.turn",
  "tool.started",
  "tool.completed",
  "assistant.delta",
  "assistant.message",
  "task.completed",
  "task.failed"
] as const;

function formatTimestamp(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function normalizeEvent(type: string, data: string): TaskEvent {
  const parsed = JSON.parse(data) as Partial<TaskEvent> & { status?: string; taskId?: string };
  if (parsed.id && parsed.timestamp && parsed.payload) {
    return parsed as TaskEvent;
  }

  return {
    id: `${type}-${crypto.randomUUID()}`,
    type,
    timestamp: new Date().toISOString(),
    payload: parsed as Record<string, unknown>
  };
}

function getStatusTone(status: string) {
  if (status === "completed") {
    return "default" as const;
  }

  if (status === "failed") {
    return "secondary" as const;
  }

  return "outline" as const;
}

export default function App() {
  const [health, setHealth] = useState<HealthState | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [prompt, setPrompt] = useState(`Locate the "A. Legislative Proposals" section and give me the result in JSON format:

{
  "begin_at_page": ...,
  "begin_sentence": "...",
  "end_at_page": ...,
  "end_sentence": "..."
}
`);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [streamEvents, setStreamEvents] = useState<TaskEvent[]>([]);
  const [assistantResponse, setAssistantResponse] = useState("");
  const [taskStatus, setTaskStatus] = useState("idle");
  const [taskId, setTaskId] = useState("");
  const [busyUpload, setBusyUpload] = useState(false);
  const [busyRun, setBusyRun] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ViewTab>("response");
  const streamRef = useRef<EventSource | null>(null);
  const eventLogRef = useRef<HTMLDivElement | null>(null);

  const renderedAssistantResponse = useMemo(() => {
    if (!assistantResponse) {
      return "<p>Start a task to see the final agent response.</p>";
    }

    return marked.parse(assistantResponse, {
      async: false,
      breaks: true,
      gfm: true
    }) as string;
  }, [assistantResponse]);

  const selectedAgent = useMemo(() => {
    return agents.find((agent) => agent.id === selectedAgentId) || null;
  }, [agents, selectedAgentId]);

  const selectedDocumentKind = selectedAgent?.supportedDocumentKinds[0] || "markdown";

  const filteredDocuments = useMemo(() => {
    return documents.filter((document) => document.kind === selectedDocumentKind);
  }, [documents, selectedDocumentKind]);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [healthResponse, agentResponse, documentResponse] = await Promise.all([
          fetchHealth(),
          fetchAgents(),
          fetchDocuments()
        ]);

        setHealth(healthResponse);
        setAgents(agentResponse.agents);
        setDocuments(documentResponse.documents);

        const firstAgent = agentResponse.agents[0];
        if (firstAgent) {
          setSelectedAgentId(firstAgent.id);
        }
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Failed to load the application.");
        console.log(requestError);
      }
    };

    bootstrap();

    return () => {
      streamRef.current?.close();
    };
  }, []);

  useEffect(() => {
    const firstMatchingDocument = filteredDocuments[0]?.id || "";
    setSelectedDocumentId((current) => {
      if (filteredDocuments.some((document) => document.id === current)) {
        return current;
      }
      return firstMatchingDocument;
    });
  }, [filteredDocuments]);

  useEffect(() => {
    const container = eventLogRef.current;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [streamEvents]);

  async function refreshDocuments(preferredDocumentId?: string) {
    const response = await fetchDocuments();
    setDocuments(response.documents);
    if (preferredDocumentId) {
      setSelectedDocumentId(preferredDocumentId);
    }
  }

  async function handleUpload() {
    if (pendingFiles.length === 0) {
      setError("Choose at least one file to upload.");
      return;
    }

    try {
      setBusyUpload(true);
      setError("");
      const response = await uploadDocument(selectedDocumentKind, pendingFiles);
      setPendingFiles([]);
      await refreshDocuments(response.document.id);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
      console.error(uploadError);
    } finally {
      setBusyUpload(false);
    }
  }

  function attachStream(nextTaskId: string) {
    streamRef.current?.close();

    const eventSource = new EventSource(`${getApiBase()}/tasks/${nextTaskId}/stream`);
    streamRef.current = eventSource;

    streamEventTypes.forEach((eventType) => {
      eventSource.addEventListener(eventType, (event) => {
        const taskEvent = normalizeEvent(eventType, (event as MessageEvent).data);
        setStreamEvents((current) => [...current, taskEvent]);

        if (eventType === "task.updated") {
          const nextStatus = taskEvent.payload.status;
          if (typeof nextStatus === "string") {
            setTaskStatus(nextStatus);
          }
        }

        if (eventType === "assistant.message") {
          const content = taskEvent.payload.content;
          if (typeof content === "string") {
            setAssistantResponse(content);
          }
        }

        if (eventType === "assistant.delta") {
          const delta = taskEvent.payload.delta;
          const content = taskEvent.payload.content;

          if (typeof content === "string") {
            setAssistantResponse(content);
          } else if (typeof delta === "string") {
            setAssistantResponse((current) => current + delta);
          }
        }

        if (eventType === "task.completed") {
          const result = taskEvent.payload.result;
          if (typeof result === "string") {
            setAssistantResponse((current) => current || result);
          }
          setTaskStatus("completed");
          setBusyRun(false);
          eventSource.close();
        }

        if (eventType === "task.failed") {
          const message = taskEvent.payload.message;
          setTaskStatus("failed");
          setBusyRun(false);
          setError(typeof message === "string" ? message : "Task failed.");
          console.error(message);
          eventSource.close();
        }
      });
    });

    eventSource.onerror = () => {
      setBusyRun(false);
      eventSource.close();
    };
  }

  async function handleRun() {
    if (!selectedAgentId || !selectedDocumentId || !prompt.trim()) {
      setError("Select an agent, choose a document, and enter a task.");
      return;
    }

    try {
      setBusyRun(true);
      setError("");
      setAssistantResponse("");
      setStreamEvents([]);
      setTaskStatus("queued");
      setActiveTab("events");
      const response = await createTask(selectedAgentId, selectedDocumentId, prompt.trim());
      setTaskId(response.taskId);
      attachStream(response.taskId);
    } catch (taskError) {
      setBusyRun(false);
      setError(taskError instanceof Error ? taskError.message : "Failed to start the task.");
      console.log(taskError);
    }
  }

  return (
    <div className="h-screen overflow-hidden bg-slate-100 text-foreground">
      <div className="flex h-full overflow-hidden">
        <div
          className={`fixed inset-0 z-40 bg-slate-950/25 transition-opacity lg:hidden ${
            sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onClick={() => setSidebarOpen(false)}
        />

        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Mini Agentic</p>
              <h1 className="mt-1 text-lg font-semibold text-slate-900">Workspace</h1>
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">Status</p>
                <Badge variant={health?.ok ? "default" : "secondary"}>{health?.ok ? "online" : "loading"}</Badge>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                <div className="flex items-center gap-2 text-slate-900">
                  <Activity className="h-4 w-4" />
                  <span className="font-medium">Backend</span>
                </div>
                <p className="mt-2 break-all text-xs text-slate-500">{health?.model || "Loading model..."}</p>
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">Agents</p>
              <nav className="space-y-1">
                {agents.map((agent) => {
                  const active = agent.id === selectedAgentId;
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => {
                        setSelectedAgentId(agent.id);
                        setSidebarOpen(false);
                      }}
                      className={`w-full rounded-xl px-3 py-3 text-left transition ${
                        active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <Bot className="h-4 w-4 shrink-0" />
                          <span className="truncate text-sm font-medium">{agent.name}</span>
                        </div>
                        <span className={`shrink-0 text-[11px] uppercase ${active ? "text-slate-300" : "text-slate-400"}`}>
                          {agent.supportedDocumentKinds[0]}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </nav>
            </section>

            <section className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">Capabilities</p>
              <div className="space-y-2">
                {selectedAgent?.capabilities.map((capability) => (
                  <div key={capability} className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">
                    {capability}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 lg:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-slate-900">{selectedAgent?.name || "Select an agent"}</h2>
                <p className="truncate text-sm text-slate-500">Minimal interface for uploads, tasks, and live agent output.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={getStatusTone(taskStatus)}>{taskStatus}</Badge>
              <span className="hidden text-sm text-slate-500 sm:inline">{taskId ? `Task ${taskId.slice(0, 8)}` : "No active task"}</span>
            </div>
          </header>

          {error ? (
            <div className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:px-6">{error}</div>
          ) : null}

          <main className="min-h-0 flex-1 overflow-hidden p-4 sm:p-6">
            <div className="grid h-full min-h-0 gap-4 grid-rows-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:grid-cols-[380px_minmax(0,1fr)] lg:grid-rows-none">
              <div className="min-h-0 overflow-y-auto">
                <div className="space-y-4 pr-1">
                  <Card className="rounded-2xl border-slate-200 bg-white shadow-none">
                    <CardHeader className="p-5">
                      <CardTitle className="text-base">Upload</CardTitle>
                      <CardDescription>
                        {selectedDocumentKind === "markdown"
                          ? "One markdown file for line-aware review."
                          : "Multiple page files for paged review."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 p-5 pt-0">
                      <div className="space-y-2">
                        <Label htmlFor="files">Files</Label>
                        <Input
                          id="files"
                          type="file"
                          multiple={selectedDocumentKind === "paged-markdown"}
                          accept=".md,text/markdown"
                          onChange={(event) => setPendingFiles(Array.from(event.target.files || []))}
                        />
                      </div>
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                        {pendingFiles.length > 0
                          ? `${pendingFiles.length} file${pendingFiles.length > 1 ? "s" : ""} selected`
                          : "No files selected"}
                      </div>
                      <Button className="w-full rounded-xl" onClick={handleUpload} disabled={busyUpload}>
                        {busyUpload ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        Upload
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl border-slate-200 bg-white shadow-none">
                    <CardHeader className="p-5">
                      <CardTitle className="text-base">Task</CardTitle>
                      <CardDescription>Choose a document and send a prompt.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 p-5 pt-0">
                      <div className="space-y-2">
                        <Label htmlFor="document">Document</Label>
                        <select
                          id="document"
                          value={selectedDocumentId}
                          onChange={(event) => setSelectedDocumentId(event.target.value)}
                          className="flex h-11 w-full rounded-xl border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="">Select a document</option>
                          {filteredDocuments.map((document) => (
                            <option key={document.id} value={document.id}>
                              {document.name} ({document.files.length} file{document.files.length > 1 ? "s" : ""})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="prompt">Prompt</Label>
                        <Textarea id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} className="min-h-36 rounded-xl bg-white" />
                      </div>
                      <Button size="lg" className="w-full rounded-xl" onClick={handleRun} disabled={busyRun}>
                        {busyRun ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        Run agent
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <Card className="flex h-full min-h-0 flex-col rounded-2xl border-slate-200 bg-white shadow-none">
                <CardHeader className="border-b border-slate-200 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">Task output</CardTitle>
                      <CardDescription>Toggle between the rendered response and the live event stream.</CardDescription>
                    </div>
                    <FileText className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab("response")}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                        activeTab === "response" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      Response
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("events")}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                        activeTab === "events" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      Event log
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="flex min-h-0 flex-1 p-0">
                  {activeTab === "response" ? (
                    <div className="flex min-h-0 flex-1 overflow-hidden">
                      <div className="min-h-0 flex-1 overflow-y-auto p-5">
                        <div
                          className="response-markdown text-sm leading-7 text-slate-700"
                          dangerouslySetInnerHTML={{ __html: renderedAssistantResponse }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-0 flex-1 overflow-hidden">
                      <div ref={eventLogRef} className="min-h-0 flex-1 overflow-y-auto p-5">
                        <div className="space-y-3">
                          {streamEvents.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                              No stream events yet.
                            </div>
                          ) : (
                            streamEvents.map((event) => (
                              <div key={event.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                  <Badge variant="outline">{event.type}</Badge>
                                  <span className="text-xs text-slate-500">{formatTimestamp(event.timestamp)}</span>
                                </div>
                                <pre className="overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-slate-600">
                                  {JSON.stringify(event.payload, null, 2)}
                                </pre>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}