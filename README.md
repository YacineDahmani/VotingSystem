# Modern Voting System

A feature-rich, full-stack web application for managing and participating in secure elections. This project is a modern evolution of a classic voting system, rebuilt with a React frontend and a Node.js/SQLite backend.

## 🚀 Key Features

- **Election Management**: Create and manage multiple elections simultaneously.
- **Secure Access**: Per-election join codes for voters and admin-only dashboard access.
- **Automated Timers**: Schedule elections with precise start and end times.
- **Smart Runoffs**: Automated tie-breaking logic with runoff election support.
- **Interactive Results**: Real-time data visualization using Recharts.
- **Modern UI**: Fully responsive design built with React 19, Tailwind CSS, and Lucide icons.
- **Fraud Detection**: Admin tools to monitor and manage voting integrity.

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 19 (Vite)
- **Styling**: Tailwind CSS
- **Data Fetching**: TanStack Query (React Query)
- **Routing**: React Router 7
- **Visualization**: Recharts
- **Icons**: Lucide React

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: SQLite3
- **Communication**: REST API with CORS enabled

## 📂 Project Structure

- **`frontend/`**: React application source code, components, and assets.
- **`backend/`**: Node.js server, database schema, and API logic.

## 📥 Installation & Setup

### 1. Clone the repository
```bash
git clone <repository-url>
cd VotingSystem
```

### 2. Backend Setup
```bash
cd backend
npm install
npm start
```
The backend will run on `http://localhost:3000`.

### 3. Frontend Setup
```bash
cd ../frontend
npm install
npm run dev
```
The frontend will typically be available at `http://localhost:5173`.

## 🔐 Admin Access

Admin features are accessible via the `/admin` route or the "Admin Access" button on the landing page. 
- **Default Password**: `admin` (Can be configured via `ADMIN_PASSWORD` environment variable)

## 📝 Notes

- The system uses an SQLite database (`voting_v2.db`) which is automatically generated in the `backend` folder on the first run.
- Ensure both backend and frontend are running simultaneously for full functionality.
- The backend is configured to serve the production build of the frontend from the `frontend/dist` folder if available.