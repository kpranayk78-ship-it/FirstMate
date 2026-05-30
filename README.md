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

## Local Laptop Setup Guide

Follow these steps to install, configure, and run FirstMate on your local machine.

### Prerequisites

Make sure you have the following software installed on your laptop before proceeding:

1. Node.js (version 18.0.0 or higher) and npm package manager.
2. Git command line utility.
3. Coral SQL CLI. This is the database query tool used to fetch issue, commit, and release data.
4. Gemini CLI. This is the command line utility used by the backend to execute autonomous agent operations.

---

### Step 1: Install and Configure the Coral SQL CLI

Coral is a single SQL interface for APIs, files, and other data sources. It allows AI agents to query multiple live sources through SQL, answer cross-source questions, and avoid repeated auth, pagination, or brittle glue code.

Follow these steps to install and connect Coral to your workspace:

1. Install Coral CLI on your laptop. On macOS, run:
```bash
brew install withcoral/tap/coral
```
For other operating systems, follow the installation instructions on the official website to download the Coral executable.

2. Verify that the coral command is working and accessible in your terminal:
```bash
coral --version
```

3. Add GitHub as a bundled data source to your local Coral workspace:
```bash
coral source add --interactive github
```
Follow the interactive prompts to authenticate Coral with your GitHub account (which will require entering a GitHub Personal Access Token).

4. Verify that you can query your repository tables directly. Coral maps GitHub data into SQL tables, including github.issues, github.pulls, github.commits, and github.releases. Test the query using:
```bash
coral sql "SELECT number, title FROM github.issues WHERE owner = 'sivajisnehith' AND repo = 'FirstMate' LIMIT 5"
```

---

### Step 2: Install and Configure the Gemini CLI

The backend assistant uses the Gemini CLI at a fixed system path to run autonomous reasoning agent tasks.

1. Download and install the Gemini CLI globally:
```bash
npm install -g @google/gemini-cli
```

2. Locate where the gemini binary was installed on your system:
```bash
which gemini
```

3. The FirstMate backend server is configured to look for the Gemini executable at /usr/bin/gemini. Copy or link the installed binary to this path so the server can run it:
```bash
sudo cp $(which gemini) /usr/bin/gemini
```
If you downloaded the standalone gemini binary directly from the releases page instead, move it to the bin folder and make it executable:
```bash
sudo mv gemini /usr/bin/gemini
sudo chmod +x /usr/bin/gemini
```

4. Verify that the Gemini binary works correctly at the expected path:
```bash
/usr/bin/gemini --version
```

---

### Step 3: Clone the Repository

Clone the project repository to your laptop and navigate to the project directory:
```bash
git clone https://github.com/sivajisnehith/FirstMate.git
cd FirstMate
```

### Step 4: Install Node Dependencies

You must install dependencies for both the frontend application and the backend server.

1. Install frontend dependencies in the root directory:
```bash
npm install
```

2. Navigate to the backend directory and install backend dependencies:
```bash
cd backend
npm install
cd ..
```

### Step 5: Configure Environment Variables

The backend server requires access to the Gemini API.

1. Create a file named .env inside the backend directory:
```bash
touch backend/.env
```

2. Open backend/.env in a text editor and add your API credentials:
```env
GEMINI_API_KEY=your_actual_gemini_api_key_here
```

Replace your_actual_gemini_api_key_here with a valid API key obtained from the Google AI Studio console.

### Step 6: Verify Database and Tool Integrations

Before launching, verify that both tools are configured properly:

1. Coral SQL Integration:
   The backend server will execute the coral command. Double check that running "coral sql" works directly from your terminal.

2. Gemini CLI Integration:
   Confirm that your GEMINI_API_KEY is active and that /usr/bin/gemini has executable permissions.

### Step 7: Start the Application

You can start both the frontend and backend servers simultaneously using the unified start script.

Run the following command in the root project directory:
```bash
npm start
```

Alternatively, run the script directly:
```bash
./start-servers.sh
```

The script will automatically verify port availability, launch both servers, and stream the colored logs into your terminal.

- Frontend web interface: http://localhost:3000
- Backend server API: http://localhost:3001

To stop both servers and release the ports, press Ctrl+C in your terminal.
