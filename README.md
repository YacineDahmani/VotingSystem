# Voting System

A full-stack voting experience built around the "Analog Swiss" The interface is designed as a tactile ceremony: a sliding voter strip, gravity-style ballot drop, a pendulum waiting room, and a blueprint-like admin surface.

## Overview

The app is split into two distinct journeys.

- Voter flow: enter identity details, submit a unique code, cast a ballot, then wait on the pendulum view while results settle.
- Admin flow: unlock the blueprint layer with a master key, tune influence, inject test votes when needed, and close polls to reveal the outcome.

## Visual Direction

- User palette: eggshell white with strong black typography and inset paper-like depth.
- Admin palette: blueprint blue with technical grid lines and architectural controls.
- Motion language: horizontal strip slides, drag-and-drop ballot deposits, pendulum kicks, and an unfolding reveal for results.

## Repository Layout

- [backend/](backend/) contains the Node.js server, routes, middleware, and realtime services.
- [frontend/](frontend/) contains the Vite React application, feature modules, hooks, and styles.
- [The Analog Swiss Voting System.txt](The%20Analog%20Swiss%20Voting%20System.txt) is the UX source spec for the current design direction.

## Local Setup

1. Install backend dependencies and start the API:

```bash
cd backend
npm install
npm start
```

2. Install frontend dependencies and start the UI:

```bash
cd frontend
npm install
npm run dev
```

3. Open the frontend in the browser, then verify the backend is available to the frontend API layer.

## GitHub Repository

This project is intended to live at [YacineDahmani/VotingSystem](https://github.com/YacineDahmani/VotingSystem).

## Notes

- The backend uses SQLite and creates its local database file on first run.
- Production builds can be served from the frontend dist output when present.
