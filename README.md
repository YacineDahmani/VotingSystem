# Voting System

An immersive full-stack voting experience inspired by the "Analog Swiss" concept. The interface is built like a physical ceremony: a sliding voter strip, a gravity-style ballot drop, a pendulum waiting room, and a blueprint-like admin console.

## Overview

The app is split into two main journeys:

- Voter flow: enter identity details, submit a unique code, cast a ballot, then wait on the pendulum view while results settle.
- Admin flow: unlock the blueprint layer with a master key, tune influence, inject test votes when needed, and close polls to reveal the outcome.

## Project Structure

```text
VotingSystem/
├─ backend/
│  ├─ server.js
│  ├─ database.js
│  ├─ middleware/
│  ├─ routes/
│  └─ services/
├─ frontend/
│  ├─ src/
│  │  ├─ App.jsx
│  │  ├─ components/
│  │  ├─ features/
│  │  ├─ hooks/
│  │  ├─ lib/
│  │  └─ styles/
│  ├─ public/
│  └─ vite.config.js
├─ README.md
```

## Tech Stack

- Backend: Node.js, Express, Socket.IO, SQLite
- Frontend: React, Vite
- Authentication and election state are handled through the backend API and realtime events

## Setup

### 1. Configure the admin master key

The backend requires `ADMIN_MASTER_KEY` at startup. This value becomes the default admin password and is also stored in the database on first run.

Example for PowerShell:

```powershell
$env:ADMIN_MASTER_KEY='your-admin-code-here'
```

You can also set `JWT_SECRET` if you want to replace the development default token secret:

```powershell
$env:JWT_SECRET='your-jwt-secret'
```

### 2. Start the backend

```bash
cd backend
npm install
npm start
```

The API runs on `http://localhost:3000` by default.

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal, then verify the frontend can reach the backend API.

## Admin Code

The admin code is not hard-coded in the frontend. It is controlled by the `ADMIN_MASTER_KEY` environment variable on the backend.

- Set `ADMIN_MASTER_KEY` before launching the server.
- Use the same value whenever you want the default admin password to be created or refreshed in a clean database.
- If the variable is missing, the backend exits during startup with a clear error.

## Visual Direction

- User palette: eggshell white with strong black typography and inset paper-like depth.
- Admin palette: blueprint blue with technical grid lines and architectural controls.
- Motion language: horizontal strip slides, drag-and-drop ballot deposits, pendulum kicks, and an unfolding reveal for results.

## Notes

- The backend uses SQLite and creates its local database file on first run.
- Production builds can be served from the frontend dist output when present.
