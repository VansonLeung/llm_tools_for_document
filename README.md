# Mini Agentic Document Vetting

A small agentic document vetting scaffold built in `v1/`.
It includes a Node.js/Express backend and a React + Vite frontend for uploading documents, selecting an agent, and receiving streaming responses.

## Project overview

- `v1/backend` — Express backend with upload storage, agent/task management, SSE streaming, file/document history, and OpenAI integration.
- `v1/frontend` — React + Vite frontend with TypeScript for interacting with agents and displaying live task output.
- `_docs/` — planning notes and sample markdown documents used by the agents.

## Backend responsibilities

- manage multiple agents and their supported document kinds
- accept uploads for `markdown` and `paged-markdown` content
- create tasks and run agent processing asynchronously
- expose SSE streaming for live task progress
- store uploaded files under `v1/backend/storage/uploads`

## Frontend responsibilities

- let users upload files and choose an agent
- create tasks and poll for task metadata
- display streaming agent responses in real time
- support text/vetting workflows for markdown and paged markdown

## Getting started

### Backend

```bash
cd v1/backend
npm install
```

Create a `.env` file or set environment variables:

```bash
OPENAI_BASE_URL=https://api.qwen.com/v1
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=qwen/qwen3.5-35b-a3b
PORT=28118
```

Run the backend:

```bash
npm run dev
```

The backend serves API endpoints on `http://localhost:28118` by default.

### Frontend

```bash
cd ../frontend
npm install
npm run dev
```

Open the local Vite URL shown in the terminal.

## API summary

- `GET /api/health` — health check and model configuration state
- `GET /api/agents` — list available agents with capabilities and supported document kinds
- `GET /api/documents` — list uploaded documents
- `POST /api/documents/upload` — upload markdown or paged-markdown files
- `POST /api/agents/:agentId/tasks` — create a new agent task
- `GET /api/tasks/:taskId` — fetch task metadata
- `GET /api/tasks/:taskId/stream` — subscribe to task events via server-sent events

## Project structure

- `v1/backend/src` — backend source code
  - `agents/` — agent definitions
  - `lib/` — shared utilities such as SSE and task store
  - `services/` — file storage and agent runner logic
- `v1/frontend/src` — frontend source code
- `_docs/` — documentation, plan notes, and sample documents

## Notes

- The backend currently supports markdown and paged markdown vetting agents.
- Tools are implemented as modular functions so additional agent capabilities can be added easily.
- The frontend is designed to show streaming results while tasks execute.

## License

This repository does not include a license file. Add one if you want to open source the project.
