# p-graph

A local codebase intelligence tool that reads public TypeScript and JavaScript repositories and renders them as interactive dependency graphs. Every node, connection, and metric comes directly from Abstract Syntax Tree (AST) parsing. The AI never decides what is there—it only explains and answers questions using verified graph lookups.

---

## Video Introduction

<!-- Video walkthrough placeholder. Embed or link a demo recording here. -->

---

## Short Intro

Modern software teams increasingly inherit and ship code generated across dozens of AI agent sessions that no single person has read line-by-line. While the code works, it accumulates hidden structural complexity: deep re-export chains, heavily congested utilities, and dead code modules.

**p-graph** solves this by generating an exact, deterministic architectural map of any public GitHub repository.

### The Core Principle: Parsing First, AI Second

A dependency graph that is 90% accurate is worse than no graph at all, because developers cannot tell which 10% was hallucinated. In **p-graph**:

- **Every box and line comes from real syntax parsing.** The system parses real imports, dynamic imports, re-exports, and `require()` calls using `ts-morph`.
- **Zero invented relationships.** The AI is strictly barred from guessing connections, traversing graphs on intuition, or hallucinating files.
- **Arithmetic over data.** Blast radius calculations, fan-in/fan-out metrics, and dependency paths are computed as pure mathematical operations over the parsed edge list.
- **Team-first tenancy.** Analyses belong to organizations rather than individual users, secured at the database layer via PostgreSQL Row-Level Security (RLS).

---

## Technologies

### Application & UI

- **[Next.js 16](https://nextjs.org/)** (App Router) with React 19 and strict TypeScript.
- **[Tailwind CSS v4](https://tailwindcss.com/)** with custom semantic palettes (accent blue, incoming green, outgoing amber) and full dark/light theme persistence.
- **[Lucide React](https://lucide.dev/)** for clean developer tooling icons.

### Canvas & Graph Visualization

- **[@xyflow/react (React Flow)](https://reactflow.dev/)** for the interactive node-based canvas, directory grouping, zoom/pan controls, and mini-map.
- **[@dagrejs/dagre](https://github.com/dagrejs/dagre)** for deterministic, hierarchical directed graph layout computation.

### Code Parsing & Framework Adapters

- **[ts-morph](https://ts-morph.com/)** for TypeScript and JavaScript AST parsing, module resolution, and path alias mapping (`tsconfig.json`).
- **Pluggable Framework Adapters** for Next.js (App & Pages Router), NestJS, Express, and React to classify files into architectural roles and extract HTTP route tables.

### Authentication & Multi-Tenancy

- **[Clerk](https://clerk.com/)** for developer authentication, organization memberships, and role-based session claims.

### Database, Realtime & Security

- **[Supabase (PostgreSQL)](https://supabase.com/)** with Row-Level Security (RLS) enabled on all tables.
- **Supabase Realtime** broadcast channels for streaming live pipeline status updates during parsing.

### AI, Agents & Observability

- **[OpenAI SDK](https://github.com/openai/openai-node)** configured with OpenRouter / pinned model endpoints (`nvidia/nemotron-3-ultra-550b-a55b:free`).
- **[LangSmith](https://smith.langchain.com/)** for full tracing, latency tracking, token usage, and cache-hit auditing.
- **Managed Deep Agents Architecture** powering an autonomous repository QA agent with HMAC-signed scoped credentials and deterministic graph query tools.

---

## Features

- **Deterministic AST Parsing**: Parses TypeScript and JavaScript source files, resolving relative imports, path aliases (`@/*`), barrel re-exports, dynamic `import()`, and CommonJS `require()`.
- **Collapsible Canvas Map**: Hierarchical directory visualization where folders collapse into clean boxes or expand into individual files.
- **Directional Dependency Highlighting**: Selecting any file highlights its direct dependencies—green for inbound imports (dependents) and amber for outbound dependencies (dependencies).
- **Instant Blast Radius & Upstream Chains**: Pure-function graph calculations running in the browser to compute transitive blast radius (what breaks if this file changes) and upstream supplier chains.
- **Architectural Taxonomy Classification**: Categorizes files into architectural roles (pages, layouts, API routes, controllers, middleware, stores, components, services, utilities, configs, tests) using AST heuristics.
- **Grounded AI File Explanations**: Single-paragraph file explanations generated strictly from the file and its direct neighbours, validated against real repo paths, and backed by a database cache.
- **Interactive "Ask" Agent**: A conversational repository assistant that investigates codebase questions by invoking deterministic graph lookup tools and streaming its steps live in the UI.
- **Live Pipeline Streaming**: Real-time progress updates across archive extraction, AST parsing, edge resolution, taxonomy classification, and database persistence.
- **One-Click Re-Analysis**: Re-parse and update repositories to capture new commits while maintaining existing graph position state.
- **Rigorous Evaluation Suite**: Standalone evaluation scripts measuring prompt performance, role classification accuracy, and verifying zero invented file paths.

---

## The Process

```
Public GitHub URL
       │
       ▼
1. Fetch & Extract ───────► Downloads tarball archive without heavy git overhead
       │
       ▼
2. AST Parsing ───────────► ts-morph traverses files, resolving imports, aliases & require()
       │
       ▼
3. Taxonomy & Routes ─────► Framework adapters tag architectural roles & HTTP routes
       │
       ▼
4. Graph Calculation ─────► Computes fan-in, fan-out, blast radius & coverage report
       │
       ▼
5. Supabase Persistence ──► Stores analysis, files & edges under organization-scoped RLS
       │
       ▼
6. Interactive UI ────────► React Flow canvas + Grounded Explanations + "Ask" Agent
```

1. **Ingestion**: The user supplies a public GitHub repository URL (`https://github.com/owner/repo`).
2. **Download & Extraction**: The backend fetches a lightweight tarball archive of the repository, unpacking it into a temporary working directory.
3. **AST Traversal & Resolution**: The standalone parser scans all TypeScript/JavaScript files, builds an AST via `ts-morph`, and resolves relative paths and `tsconfig` aliases. Unresolved imports are recorded with reasons.
4. **Taxonomy & Adapter Inspection**: Pluggable adapters inspect AST declarations (e.g. Next.js server actions, NestJS controllers, Express routers) to assign architectural roles and build the route table.
5. **Graph Metrics & Persistence**: Fan-in, fan-out, and edge maps are computed and persisted in Supabase with organization isolation.
6. **Visualization & Interaction**: The web client renders the graph on a responsive canvas. Users click any file to view metrics and blast radius, request an AI explanation, or switch to the Ask panel to chat with the repo agent.

---

## How to Run the Project

### Prerequisites

- **Node.js**: v20.6.0 or higher (Node 22 recommended)
- **npm**: v10+
- **Git**: Installed locally
- Accounts for:
  - [Clerk](https://clerk.com/) (Authentication & Organizations)
  - [Supabase](https://supabase.com/) (Database & Realtime)
  - [OpenRouter](https://openrouter.ai/) or [OpenAI](https://platform.openai.com/) (AI model provider)
  - [LangSmith](https://smith.langchain.com/) (Optional, for LLM observability and tracing)

---

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/p-graph.git
cd p-graph
```

---

### 2. Environment Variables Configuration

Create a `.env.local` file in the root directory:

```bash
cp .env.example .env.local
```

Populate the required environment variables:

| Variable                                          | Description                                                                         |
| :------------------------------------------------ | :---------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`               | Clerk public key for client-side authentication.                                    |
| `CLERK_SECRET_KEY`                                | Clerk secret key for backend token verification.                                    |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`                   | Set to `/sign-in`.                                                                  |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL`                   | Set to `/sign-up`.                                                                  |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | Set to `/`.                                                                         |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | Set to `/`.                                                                         |
| `NEXT_PUBLIC_SUPABASE_URL`                        | Supabase project URL (e.g. `https://your-project.supabase.co`).                     |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`            | Supabase anon/publishable key.                                                      |
| `SUPABASE_SECRET_KEY`                             | Supabase service role key (for server-side pipeline writes & RLS bypass).           |
| `OPENROUTER_API_KEY`                              | API key from OpenRouter (used for explanation models).                              |
| `OPENROUTER_BASE_URL`                             | Optional, defaults to `https://openrouter.ai/api/v1`.                               |
| `LANGSMITH_TRACING`                               | Set to `true` to enable LangSmith tracing.                                          |
| `LANGSMITH_ENDPOINT`                              | LangSmith API endpoint (e.g. `https://api.smith.langchain.com` or APAC endpoint).   |
| `LANGSMITH_PROJECT`                               | LangSmith project name (e.g. `p-graph`).                                            |
| `LANGSMITH_API_KEY`                               | LangSmith API key for trace ingestion.                                              |
| `AGENT_URL`                                       | URL of the local Ask agent service (defaults to `http://127.0.0.1:2024`).           |
| `AGENT_SIGNING_SECRET`                            | Optional HMAC secret to sign agent credentials (defaults to Clerk or Supabase key). |

---

### 3. Database Setup (Supabase)

Apply the SQL migrations located in `supabase/migrations/` to your Supabase project:

Using the Supabase CLI:

```bash
supabase db push
```

Alternatively, run each migration file in order via the Supabase SQL Editor:

1. `supabase/migrations/20261003111653_init.sql`
2. `supabase/migrations/20261003111918_pin_rls_trigger_search_path.sql`
3. `supabase/migrations/20261007120000_pipeline_stages_and_realtime.sql`
4. `supabase/migrations/20261008120000_routes_and_roles_write_policies.sql`
5. `supabase/migrations/20261012120000_explanations_cache_and_write_policies.sql`

Ensure Realtime replication is enabled for `analyses` and `analysis_stages` tables in the Supabase Dashboard.

---

### 4. Install Dependencies & Start Web Application

```bash
# Install root dependencies
npm install

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

### 5. Start the "Ask" Agent Service (Optional for Repository QA)

The conversational Ask agent runs as a standalone service in `sandbox/p-graph-agent/`:

```bash
cd sandbox/p-graph-agent

# Configure environment
cp .env.example .env # Set OPENROUTER_API_KEY, MODEL_NAME, and LANGSMITH keys

# Install agent dependencies
npm install

# Start the agent server on port 2024
npm run dev
# or
node server.ts
```

When active, the **Ask** panel in the web interface will stream tool lookups and responses to codebase questions. If stopped, the rest of the application (graph canvas, blast radius, AI explanations) continues functioning normally.

---

### 6. Running Evaluations

The repository includes an evaluation suite to verify AI response fidelity and classification benchmarks:

```bash
# Check that explanations never invent non-existent file paths
npm run eval:paths

# Test framework role classification accuracy against ground truth
npm run eval:roles

# Run prompt comparison benchmarks against evaluation datasets
npm run eval:prompts

# Run the entire evaluation suite
npm run eval:all
```

---

## Contributing & Code Standards

- **Standalone Parsing**: Parser code must remain completely decoupled from Next.js, React, and Supabase.
- **Pure Functions**: Graph metrics and walks must remain pure functions over file and edge lists.
- **RLS Enforced**: Database access is governed strictly by Postgres RLS policies linked to organization claims.
- **No Hallucinated Edges**: Every graph connection must stem from verified AST imports.
