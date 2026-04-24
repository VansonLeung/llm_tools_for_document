Study "v1/backend" and "v1/frontend" for reference.

Make me a v1 miniature agentic inside "v1/":

- backend:
   - nodejs, express
   - support file upload storage
   - supports multiple LLM agents, each agent has its own set of tools and capabilities
     - supports streaming / SSE
     - supports tool use
     - agent 1: markdown vetting agent (study "_docs/samples/markdown")
       - capabilities:
         - [a set of tools that the agent can use to accomplish markdown vetting tasks, such as:  locating a target section's line range, word count by a given line range, word extraction by a given line range]

     - agent 2: paged markdown text vetting agent (study "_docs/samples/paged_markdown")
       - capabilities:
         - [a set of tools that the agent can use to accomplish paged markdown text vetting tasks, such as:  locating a target section's page range]

   - the tools are defined as functions that the agents can call to perform specific actions, such as processing text, analyzing data, or interacting with external APIs. Each tool has a defined input and output format, allowing the agents to use them effectively in their reasoning and decision-making processes.
   - the backend will handle the logic for managing the agents, processing user inputs, and coordinating the interactions between the agents and the tools. It will also be responsible for storing uploaded files and maintaining the state of ongoing tasks.
   - the tools will be designed to be modular and extensible, allowing for easy addition of new tools as needed to enhance the capabilities of the agents. The backend will also implement a mechanism for tracking the progress of tasks and providing real-time updates to the frontend, ensuring a responsive user experience.

- frontend:
   - React
   - vite
   - typescript
   - shadcn
   - allows users to interact with the agents, uploading files, inputting tasks and receiving responses in real-time
   - supports displaying streaming responses from the agents, allowing users to see the progress of their tasks as they are being processed



