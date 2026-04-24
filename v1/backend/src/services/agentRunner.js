import { getAgentById } from "../agents/index.js";
import { config } from "../config.js";
import { getOpenAIClient } from "../lib/openaiClient.js";
import { fileStore } from "./fileStore.js";

function normalizeAssistantContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (part?.type === "text") {
          return part.text;
        }

        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

function summarizeToolResult(result) {
  const serialized = JSON.stringify(result);
  return serialized.length > 240 ? `${serialized.slice(0, 240)}...` : serialized;
}

function chunkAssistantResponse(content) {
  return content.match(/[\s\S]{1,160}/g) || [];
}

function buildSystemPrompt(agent, document, taskInput) {
  const parts = [agent.buildSystemPrompt(document)];

  if (taskInput?.systemPrompt) {
    parts.push(taskInput.systemPrompt);
  }

  return parts.filter(Boolean).join("\n\n");
}

async function buildTaskMessages(taskInput, readDocumentContent) {
  const messages = [];

  for (const item of taskInput.messages) {
    if (item.source === "document-content") {
      messages.push({
        role: item.role,
        content: await readDocumentContent()
      });
      continue;
    }

    messages.push({
      role: item.role,
      content: item.content
    });
  }

  return messages;
}

export async function runAgentTask({ taskStore, taskId, agentId, documentId, taskInput }) {
  const agent = getAgentById(agentId);
  if (!agent) {
    throw new Error(`Unknown agent \"${agentId}\".`);
  }

  const document = fileStore.getDocument(documentId);
  if (!document) {
    throw new Error(`Unknown document \"${documentId}\".`);
  }

  if (!agent.supportedDocumentKinds.includes(document.kind)) {
    throw new Error(`${agent.name} does not support documents of type ${document.kind}.`);
  }

  taskStore.setStatus(taskId, "running", {
    message: `Running ${agent.name}`
  });

  const openai = getOpenAIClient();
  const toolDefinitions = await agent.buildTools(document);
  const toolMap = new Map(
    toolDefinitions.map((tool) => [tool.definition.function.name, tool])
  );

  let documentContentPromise = null;
  const readDocumentContent = async () => {
    if (!documentContentPromise) {
      documentContentPromise = fileStore.readDocumentContent(document);
    }

    return documentContentPromise;
  };

  const messages = [
    {
      role: "system",
      content: buildSystemPrompt(agent, document, taskInput)
    },
    ...(await buildTaskMessages(taskInput, readDocumentContent))
  ];

  taskStore.appendEvent(taskId, "agent.started", {
    agentId,
    documentId,
    toolNames: toolDefinitions.map((tool) => tool.definition.function.name)
  });

  for (let round = 0; round < 8; round += 1) {
    taskStore.appendEvent(taskId, "agent.turn", {
      round: round + 1,
      status: "requesting-model-response"
    });

    const completion = await openai.chat.completions.create({
      model: config.openaiModel,
      messages,
      tools: toolDefinitions.map((tool) => tool.definition),
      tool_choice: "auto"
    });

    const assistantMessage = completion.choices?.[0]?.message;

    if (!assistantMessage) {
      throw new Error("The model returned an empty response.");
    }

    const assistantContent = normalizeAssistantContent(assistantMessage.content);

    if (assistantMessage.tool_calls?.length) {
      messages.push({
        role: "assistant",
        content: assistantContent,
        tool_calls: assistantMessage.tool_calls
      });

      for (const toolCall of assistantMessage.tool_calls) {
        const tool = toolMap.get(toolCall.function.name);
        if (!tool) {
          throw new Error(`The model requested unknown tool \"${toolCall.function.name}\".`);
        }

        let args;
        try {
          args = JSON.parse(toolCall.function.arguments || "{}");
        } catch {
          throw new Error(`Invalid JSON arguments for tool \"${toolCall.function.name}\".`);
        }

        taskStore.appendEvent(taskId, "tool.started", {
          name: toolCall.function.name,
          arguments: args
        });

        const result = await tool.execute(args);

        taskStore.appendEvent(taskId, "tool.completed", {
          name: toolCall.function.name,
          summary: summarizeToolResult(result),
          result
        });

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      }

      continue;
    }

    const finalAnswer = assistantContent || "The agent completed the task without additional commentary.";
    let streamedContent = "";

    for (const chunk of chunkAssistantResponse(finalAnswer)) {
      streamedContent += chunk;
      taskStore.appendEvent(taskId, "assistant.delta", {
        delta: chunk,
        content: streamedContent
      });
    }

    taskStore.appendEvent(taskId, "assistant.message", {
      content: finalAnswer
    });
    taskStore.setResult(taskId, finalAnswer);
    taskStore.completeTask(taskId, finalAnswer);
    return finalAnswer;
  }

  throw new Error("The agent exceeded the maximum number of tool rounds.");
}