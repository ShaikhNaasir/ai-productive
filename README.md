# AI-Powered Personal Productivity Assistant (Expert Level)

Full-stack app. Manage tasks, notes, schedules, reminders, daily priorities with AI.

Not plain to-do app. AI understand natural-language instructions, organize tasks, summarize notes, suggest priorities, plan day.

Combines web dev, AI, APIs, databases, auth, notifications, data viz.

## 🎯 Project Goal

Platform where users can:

- 👤 Register and log in
- ✅ Create and manage tasks
- 📝 Create notes
- 📅 Manage schedules
- 🔔 Set reminders
- 🤖 Interact with an AI assistant
- 📊 Track productivity
- 🔍 Search their information
- 📱 Use the application on any device

## ✅ Implemented Enhancements (post-launch)

Beyond the base spec below, these roadmap features are shipped. See
[`CHANGELOG.md`](CHANGELOG.md) for details and [`ROADMAP.md`](ROADMAP.md) for the
backlog.

| Feature | What it does | Key endpoints |
|---------|--------------|---------------|
| Recurring tasks & reminders (A2) | Daily/weekly/monthly repeat; completing one spawns the next occurrence | `tasks`, `reminders` `recurrence` field |
| Subtasks & AI breakdown (A1) | Nest subtasks under a task; AI splits a task into ordered subtasks | `POST /api/ai/tasks/:id/breakdown` |
| Pomodoro focus timer & time tracking (A3) | Start/stop focus sessions bound to a task; "Time Spent" analytics | `POST /api/focus/start`, `/api/focus/:id/stop`, `GET /api/focus/stats` |
| AI daily planner "Plan my day" (A4) | Time-blocked plan from open tasks + calendar; accept → schedule entries | `POST /api/ai/plan-day`, `POST /api/ai/plan-day/accept` |
| Document upload & AI summarization (B1) | Upload .txt/.md/.csv/.pdf → stored as a note + AI key points/summary | `POST /api/documents/upload` |
| Habit tracking (B2) | Daily habits with idempotent check-in, current + longest streaks, analytics tile | `GET/POST /api/habits`, `POST /api/habits/:id/check-in` |
| PWA — installable + offline shell (B3) | Installable app, offline app shell; service worker never caches API/private data | client `manifest.webmanifest` + `sw.js` |

## 🛠 Technologies Used

**Frontend**
- HTML5
- CSS3
- JavaScript
- React
- shadcn/ui

**Backend**
- Node.js
- Express.js

**Database**
- PostgreSQL or MongoDB

**AI Layer**
- Python
- FastAPI
- LLM API
- LangChain or LlamaIndex

**Authentication**
- JWT
- bcrypt

**Real-Time Features**
- Socket.IO

**Deployment**
- Vercel
- Render/Railway
- PostgreSQL/MongoDB Atlas

## 📂 Project Folder Structure

```
productivity-assistant/
│
├── client/
│ ├── components/
│ │ ├── TaskList.jsx
│ │ ├── Calendar.jsx
│ │ ├── ChatAssistant.jsx
│ │ └── Notes.jsx
│ │
│ ├── pages/
│ ├── dashboard/
│ ├── services/
│ ├── App.js
│ └── index.js
│
├── server/
│ ├── routes/
│ ├── controllers/
│ ├── models/
│ ├── middleware/
│ └── server.js
│
├── ai-service/
│ ├── assistant.py
│ ├── summarizer.py
│ ├── task_planner.py
│ └── main.py
│
└── README.md
```

## 🎨 Application Flow

Login → Dashboard → Tasks + Notes → AI Assistant → Plan / Organize → Reminders → Productivity Analytics

## 📌 Features

### ✅ User Authentication

Users can:
- Register
- Login
- Logout
- Update profile
- Change password

**Example API:**

```
POST /api/auth/register
POST /api/auth/login
```

### ✅ Task Management

Users can:
- Create tasks
- Edit tasks
- Delete tasks
- Mark tasks as completed
- Set priorities
- Set deadlines
- Add tags

**Example:**

```js
const task = {
  title: "Complete JavaScript project",
  priority: "High",
  status: "Pending",
  dueDate: "2026-08-15"
};
```

### 🤖 AI Task Creation

User type natural-language instructions.
Example: "Remind me to prepare for my interview next Friday."

AI extract:
- **Task:** Prepare for interview
- **Date:** Next Friday
- **Priority:** High

App create task automatically.

### 🧠 AI Task Prioritization

AI analyze:
- Deadline
- Importance
- Estimated effort
- Dependencies
- Existing workload

Then recommend:
- 🔥 High Priority — Prepare interview presentation
- 🟡 Medium Priority — Complete documentation
- 🟢 Low Priority — Organize project files

### 📝 Notes Application

Users create:
- Text notes
- Meeting notes
- Ideas
- Study notes
- Project notes

**Support:**
- Search
- Categories
- Tags
- Pinning
- Editing
- Deletion

### 🤖 AI Note Summarization

User paste long note, select summarize.

AI generate:

**Key Points**
- Project deadline is Friday
- API integration is pending
- Testing needs to be completed
- Final review is scheduled tomorrow

### 📅 Calendar

Display:
- Tasks
- Meetings
- Deadlines
- Reminders
- Events

**Example:**

```
Monday
09:00 Team Meeting
11:00 Complete API
15:00 Project Review
18:00 Study
```

### 🔔 Reminder System

User create reminders:
"Remind me about the project review tomorrow at 10 AM."
System schedule notification automatically.

### 💬 AI Assistant

Chatbot-style interface.
Users ask:
- "What do I need to finish today?"
- "Which tasks should I prioritize?"
- "Summarize my project notes."
- "Plan my day."
- "What deadlines are coming this week?"

AI retrieve relevant user data before responding.

### 🔎 Semantic Search

Search by meaning, not only exact keywords.
Example: "things related to my upcoming interview"

System find relevant:
- Notes
- Tasks
- Documents
- Reminders

Implement with embeddings and vector database.

### 📊 Productivity Dashboard

Display:
- Tasks Completed
- Pending Tasks
- Overdue Tasks
- Completion Rate
- Productivity Trend
- Time Spent
- Weekly Progress

**Example:**

```
Weekly Productivity
Mon ████████
Tue ██████
Wed █████████
Thu █████
Fri ████████
```

### 📈 Analytics

Charts for:
- Tasks completed per day
- Completion rate
- Overdue tasks
- Category-wise workload
- Weekly productivity
- Monthly productivity

**Example calculation:**

```js
const completionRate = (completedTasks / totalTasks) * 100;
```

### 🎨 CSS Example

```css
.task-card {
  padding: 16px;
  border: 1px solid #ddd;
  border-radius: 10px;
  margin-bottom: 12px;
}
.task-card.completed {
  text-decoration: line-through;
}
```

### 📱 Responsive Design

```css
@media(max-width:768px){
 .dashboard{
    display:block;
  }
 .task-card{
    width:100%;
  }
}
```

## 🌟 Bonus Features

Upgrade with:
- 🎙 Voice Commands
- 🤖 AI Daily Planner
- 📄 Document Upload
- 🧠 AI Document Summarization
- 🔍 Semantic Search
- 🌍 Multi-language Support
- 🌙 Dark Mode
- 📱 Progressive Web App
- 🔄 Calendar Synchronization
- 👥 Shared Tasks

## 💻 Skills You'll Learn

- React
- Node.js
- Express.js
- Python
- FastAPI
- PostgreSQL/MongoDB
- JWT Authentication
- REST APIs
- WebSockets
- LLM Integration
- Prompt Engineering
- Embeddings
- Vector Databases
- Data Visualization
- Responsive UI Design

## 📚 Challenges

1. Build natural-language task creation.
2. Convert AI responses into structured task data.
3. Implement reminders reliably.
4. Maintain user-specific AI context.
5. Build semantic search.
6. Protect private user information.
7. Prevent unauthorized access to tasks and notes.
8. Build accurate productivity analytics.
9. Handle AI failures gracefully.
10. Deploy the complete application.

## 🎯 Learning Outcome

After project, you understand how to:
- Build AI-powered productivity apps.
- Integrate LLMs with traditional web apps.
- Convert natural language into structured data.
- Implement semantic search.
- Work with embeddings and vector databases.
- Build notification systems.
- Create analytics dashboards.
- Design secure full-stack apps.

## 🚀 Project Enhancement Ideas

After basic version, add:
- AI-generated daily schedules.
- Automatic task breakdown.
- AI meeting summaries.
- Email-to-task conversion.
- AI-powered deadline prediction.
- Focus mode and Pomodoro timer.
- Habit tracking.
- Team collaboration.
- Productivity recommendations.
- AI usage and cost monitoring.

## 📁 Portfolio Value

Demonstrates:
- Full-stack development
- AI application development
- LLM integration
- Natural-language processing
- Semantic search
- Vector databases
- Authentication
- Notification systems
- Analytics dashboards
- Production deployment

Strong portfolio project. Combines traditional web dev with practical AI. Shows you build intelligent app that understand user input, work with structured data, provide useful automation — not just display static info.

---

## 🚀 Running & Deployment

This repository implements the project as three services. See `GETTING_STARTED.md` for full install + usage and `PLAN.md` for the phased build log.

### Local

```bash
# 1. Server (Express API) — http://localhost:4000
cd server && cp .env.example .env && npm install && npx prisma migrate dev && npm run dev

# 2. AI service (FastAPI) — http://localhost:8000
cd ai-service && cp .env.example .env && python -m venv .venv && .venv/Scripts/activate \
  && pip install -r requirements.txt && uvicorn main:app --reload --port 8000

# 3. Client (React) — http://localhost:5173
cd client && cp .env.example .env && npm install && npm run dev
```

### Tests

- Server: `cd server && npm test` (Jest + Supertest)
- AI service: `cd ai-service && .venv/Scripts/python -m pytest` (pytest)
- Client: `cd client && npm test` (Vitest) and `npm run build`

### Deployment

- **Client → Vercel**: `client/vercel.json` (Vite build, SPA rewrites). Set `VITE_API_URL` to the deployed API URL.
- **Server + AI service → Render**: `render.yaml` blueprint provisions both (Node + Python) with a shared `INTERNAL_API_KEY`. Dockerfiles are also provided for each service (Render/Railway/any container host).
- **Database → Supabase (PostgreSQL + pgvector)**: set `DATABASE_URL` / `DIRECT_URL`. After the first `prisma migrate deploy`, run `server/prisma/sql/pgvector_indexes.sql` to create the semantic-search HNSW indexes.

### Required secrets

| Variable | Service | Purpose |
|----------|---------|---------|
| `DATABASE_URL`, `DIRECT_URL` | server | Supabase/Postgres connection (pooled + direct) |
| `JWT_SECRET` | server | Sign auth tokens |
| `INTERNAL_API_KEY` | server + ai-service | Shared secret; only the server may call the AI service |
| `ANTHROPIC_API_KEY` | ai-service | LLM (task parsing, summarizing, chat, prioritization) |
| `VOYAGE_API_KEY` | ai-service | Embeddings for semantic search |
| `EMBEDDINGS_ENABLED=true` | server | Turn on embedding indexing + semantic search |

The app degrades gracefully: if the AI service or its keys are absent, core task/note/calendar/reminder features keep working and search falls back to keyword matching.