# FirstMate

FirstMate is a developer assistant dashboard that simplifies repository management. It helps developers triage issues, monitor pull request status, and generate release notes using language models.

The system contains a web-based frontend and a local Node.js backend. It interfaces with the Gemini API to analyze repository data and assist with common developer tasks.

## Key Capabilities

FirstMate includes several tools to assist with development workflows.

### Developer Assistant Chat
An interactive interface where you can ask questions about your code, search the repository, and receive guided assistance for code reviews and repository tasks.

### Duplicate Issue Detection
An automated issue scanner that compares open issues using text similarity and semantic analysis. It flags duplicate candidates and provides explanations for why they might overlap, allowing developers to close duplicates quickly.

### Pull Request Monitoring
A real-time overview of pull request health. It tracks statuses, checks, and approvals to help maintain a clear picture of active code integrations.

### Release Notes Generator
A tool that queries recent merged commits from the database and compiles them into a structured changelog. It groups changes into features, bug fixes, and contributor lists, saving time during releases.

## Getting Started

### Prerequisites
You need Node.js installed on your system to run the frontend and backend applications.

### Repository Setup
First, clone the repository and install the required dependencies for both parts of the application.

1. Install dependencies for the React frontend:
   npm install

2. Install dependencies for the Express backend:
   cd backend
   npm install

### Configuration
The backend requires a Gemini API key to run its analysis tasks.

1. Create a file named .env inside the backend directory.
2. Add your Gemini API key to the file:
   GEMINI_API_KEY=your_actual_api_key_here

Do not commit this .env file to public repositories. The repository is pre-configured to ignore it.

### Running the Application

To run the full application, you need to start both the backend server and the frontend development server.

1. Start the backend server:
   cd backend
   npm start

   The server runs on http://localhost:3001 by default.

2. Start the frontend development server in a separate terminal:
   npm run dev

   Open http://localhost:5173 in your browser to access the dashboard.
