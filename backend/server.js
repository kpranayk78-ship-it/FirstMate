import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { spawn, exec } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, ".env") });

const execPromise = promisify(exec);
const DB_FILE_PATH = join(__dirname, "duplicates_db.json");

// Helper to read static duplicates database
async function readStaticDb() {
  try {
    if (!fs.existsSync(DB_FILE_PATH)) {
      return {};
    }
    const content = await fs.promises.readFile(DB_FILE_PATH, "utf8");
    return JSON.parse(content || "{}");
  } catch (error) {
    console.error("Error reading static duplicates DB:", error);
    return {};
  }
}

// Helper to write static duplicates database
async function writeStaticDb(data) {
  try {
    await fs.promises.writeFile(DB_FILE_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Error writing static duplicates DB:", error);
  }
}

const app = express();

app.use(cors());
app.use(express.json());

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Executes a prompt using the autonomous Gemini CLI agent (Mode 1).
 * @param {string} prompt - Prompt to pass to the agent.
 * @returns {Promise<{response: string, stats: any}>} - The agent's response and execution stats.
 */
function queryGeminiAgent(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/gemini", [
      "-m",
      "gemini-2.5-flash",
      "-p",
      prompt,
      "-y",
      "--skip-trust",
      "--output-format",
      "json"
    ], {
      env: process.env
    });

    let stdoutData = "";
    let stderrData = "";

    child.stdout.on("data", (data) => {
      stdoutData += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderrData += data.toString();
    });

    child.on("close", (code) => {
      try {
        const firstBrace = stdoutData.indexOf('{');
        const lastBrace = stdoutData.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          const jsonStr = stdoutData.substring(firstBrace, lastBrace + 1);
          const parsed = JSON.parse(jsonStr);
          if (parsed.response) {
            return resolve({
              response: parsed.response,
              stats: parsed.stats
            });
          }
        }
      } catch (e) {
        console.error("Error parsing Gemini CLI output:", e);
      }

      if (stdoutData.trim()) {
        return resolve({
          response: stdoutData.trim(),
          stats: null
        });
      }

      if (code !== 0) {
        reject(new Error(stderrData.trim() || `Gemini CLI exited with code ${code}`));
      } else {
        reject(new Error("Gemini CLI returned an empty or invalid response"));
      }
    });
  });
}

async function generateContentWithRetry(query, modelName = "gemini-2.5-flash", retries = 3, delay = 1000) {
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(query);
    const response = await result.response;
    return response.text();
  } catch (error) {
    const isRateLimitOr503 = error.message.includes("503") || error.message.includes("429") || error.message.toLowerCase().includes("high demand");
    if (isRateLimitOr503 && retries > 0) {
      console.log(`Model ${modelName} returned temporary error: ${error.message}. Retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return generateContentWithRetry(query, modelName, retries - 1, delay * 2);
    }
    // If retries exhausted and model is gemini-2.5-flash, fall back to gemini-2.5-flash
    if (modelName === "gemini-2.5-flash") {
      console.log("gemini-2.5-flash failed or overloaded. Falling back to gemini-2.5-flash...");
      return generateContentWithRetry(query, "gemini-2.5-flash", 2, 1000);
    }
    throw error;
  }
}

app.post("/ai/query", async (req, res) => {
  try {
    const { query, userText = "", owner = "withcoral", repo = "coral" } = req.body;
    
    // Check if the query asks for list of issues, SQL, database tables, or repository actions
    const lowercaseUserText = userText.toLowerCase().trim();
    const needsAgent = 
      lowercaseUserText.includes("list") ||
      lowercaseUserText.includes("issues") ||
      lowercaseUserText.includes("show") ||
      lowercaseUserText.includes("find") ||
      lowercaseUserText.includes("pr") ||
      lowercaseUserText.includes("pull request") ||
      lowercaseUserText.includes("sql") ||
      lowercaseUserText.includes("run command") ||
      lowercaseUserText.includes("database") ||
      lowercaseUserText.includes("execute");

    if (needsAgent && userText) {
      console.log(`Routing query to autonomous Gemini CLI agent: "${userText}"`);
      
      let specificInstructions = "Please use your tools (like Coral SQL) to retrieve only the relevant data requested by the user in their active repository context.";
      
      // Strict isolation between Issues and PRs
      if (lowercaseUserText.includes("issue")) {
        specificInstructions = `Please use your tools (like Coral SQL) to retrieve only the regular issues. 
Note: In GitHub's database schema, both standard issues and pull requests are stored in the same 'issues' table. 
Please ensure your SQL query explicitly filters out pull requests (e.g. check for 'pull_request IS NULL' or similar indicators) so you return ONLY standard issues and DO NOT include pull requests in your response.`;
      } else if (lowercaseUserText.includes("pr") || lowercaseUserText.includes("pull request")) {
        specificInstructions = `Please use your tools (like Coral SQL) to retrieve only the pull request data. 
Ensure you DO NOT return general/standard issues unless explicitly requested.`;
      }

      const agentPrompt = `You are an autonomous repository manager with access to the Coral SQL tool for querying github repository tables.
The user wants you to perform this task: "${userText}"

${specificInstructions}

Please query the database tables for active repository context (Owner: ${owner}, Repo: ${repo}) and construct a friendly, precise, and completely accurate response. Do not say that you do not have access, as you DO have the Coral SQL tool.`;
      
      const agentResult = await queryGeminiAgent(agentPrompt);
      return res.json({
        success: true,
        response: agentResult.response
      });
    }

    // Default to fast direct model call
    const text = await generateContentWithRetry(query);

    res.json({
      success: true,
      response: text,
    });
  } catch (error) {
    console.error("AI Query Error:", error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.post("/issues/duplicates", async (req, res) => {
  console.time("Endpoint total duration");
  const requestStart = Date.now();
  try {
    const body = req.body || {};
    console.log("BODY:", req.body);

    const { owner = "withcoral", repo = "coral", refresh = false } = body;
    console.log("Repository:", owner, repo, "Refresh:", refresh);

    const cacheKey = `${owner}/${repo}`.toLowerCase();

    const db = await readStaticDb();

    if (refresh) {
      cache.delete(cacheKey);
      if (db[cacheKey]) {
        delete db[cacheKey];
        await writeStaticDb(db);
      }
      console.log(`Cache and static DB purged/cleared for repository: ${cacheKey}`);
    } else if (db[cacheKey]) {
      console.log(`[Static DB Hit] Returning cached duplicates for repository: ${cacheKey}`);
      console.timeEnd("Endpoint total duration");
      return res.json({
        success: true,
        from_db: true,
        ...db[cacheKey].data
      });
    } else if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`Cache hit for repository: ${cacheKey}`);
        console.timeEnd("Endpoint total duration");
        return res.json({
          success: true,
          from_db: false,
          ...cached.data
        });
      }
    }

    console.log(`Fresh fetch initiated for repository: ${cacheKey}`);

    // 1. Fetch raw open issues directly from database using Coral SQL CLI with JSON format
    // Strict isolation to exclude Pull Requests: AND html_url LIKE '%/issues/%'
    const sql = `SELECT number, title, body FROM github.issues WHERE owner = '${owner}' AND repo = '${repo}' AND state = 'open' AND html_url LIKE '%/issues/%' ORDER BY updated_at DESC;`;
    let openIssues = [];
    try {
      console.log("Fetching issues via direct Coral SQL query...");
      const { stdout } = await execPromise(`coral sql "${sql}" --format json`);
      // Parse the JSON array
      const firstBracket = stdout.indexOf('[');
      const lastBracket = stdout.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket !== -1) {
        const jsonStr = stdout.substring(firstBracket, lastBracket + 1);
        openIssues = JSON.parse(jsonStr);
      }
      console.log(`Successfully fetched ${openIssues.length} issues from Coral database.`);
    } catch (dbError) {
      console.error("Database query via Coral SQL failed:", dbError);
    }

    if (openIssues.length === 0) {
      console.log("No issues found in local database for repository:", owner, repo);
      console.timeEnd("Endpoint total duration");
      return res.json({
        success: true,
        total_open_issues_analyzed: 0,
        open_issues: [],
        duplicates: []
      });
    }

    // 2. Perform duplicate detection on the retrieved issues using the direct Gemini SDK
    const issuesPromptText = openIssues.map(issue => `Issue #${issue.number}: Title: "${issue.title}"\nBody: ${issue.body || "No description provided."}`).join("\n\n---\n\n");

    const analysisPrompt = `You are a senior repository triager and duplicate issue detector.
Below is the complete list of open issues in the ${owner}/${repo} repository, retrieved from the live database:

${issuesPromptText}

Analyze these issues to find likely duplicate pairs. A duplicate pair is a pair of issues where one issue covers the exact same problem, bug, feature request, or topic as another existing issue (the master reference).

Return a valid JSON object matching the schema below. Do not include markdown code fences, explanations, or backticks. Return ONLY the raw JSON string.

Schema:
{
  "duplicates": [
    {
      "master_issue": number,
      "master_title": string,
      "duplicate_issue": number,
      "duplicate_title": string,
      "confidence": number, // confidence percentage between 1 and 100
      "reason": string // brief, precise explanation of why it is a duplicate
    }
  ]
}`;

    console.log("Calling direct Gemini API for duplicate detection...");
    const directResponse = await generateContentWithRetry(analysisPrompt);
    console.log("Gemini direct API response:", directResponse);

    // Parse the duplicates list
    let duplicates = [];
    try {
      const trimmedResponse = directResponse.trim();
      const firstBrace = trimmedResponse.indexOf('{');
      const lastBrace = trimmedResponse.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        const jsonStr = trimmedResponse.substring(firstBrace, lastBrace + 1);
        const parsed = JSON.parse(jsonStr);
        duplicates = parsed.duplicates || [];
      }
    } catch (parseError) {
      console.error("Failed to parse Gemini duplicate response directly:", parseError);
      // Fallback parser: clean up markdown blocks
      try {
        const cleaned = directResponse
          .replace(/```json/g, "")
          .replace(/```/g, "")
          .trim();
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          const jsonStr = cleaned.substring(firstBrace, lastBrace + 1);
          const parsed = JSON.parse(jsonStr);
          duplicates = parsed.duplicates || [];
        }
      } catch (nestedError) {
        console.error("Both parse attempts failed for duplicate response.");
      }
    }

    const open_issues = openIssues.map(issue => ({
      number: issue.number,
      title: issue.title
    }));

    const total_open_issues_analyzed = open_issues.length;

    // Cache the result in-memory
    cache.set(cacheKey, {
      timestamp: Date.now(),
      data: {
        total_open_issues_analyzed,
        open_issues,
        duplicates
      }
    });

    // Save to the static DB (persistent)
    db[cacheKey] = {
      timestamp: Date.now(),
      data: {
        total_open_issues_analyzed,
        open_issues,
        duplicates
      }
    };
    await writeStaticDb(db);

    const totalDuration = Date.now() - requestStart;
    console.log(`Total duplicates endpoint request duration: ${totalDuration}ms`);

    console.timeEnd("Endpoint total duration");

    res.json({
      success: true,
      from_db: false,
      total_open_issues_analyzed,
      open_issues,
      duplicates
    });

  } catch (error) {
    console.error(error);
    try {
      console.timeEnd("Endpoint total duration");
    } catch (_) {}
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post("/issues/pull-requests", async (req, res) => {
  try {
    const { owner = "withcoral", repo = "coral" } = req.body || {};
    console.log(`Fetching open pull requests for ${owner}/${repo}...`);

    const sql = `SELECT number, title, created_at, updated_at, html_url, user__login FROM github.pulls WHERE owner = '${owner}' AND repo = '${repo}' AND state = 'open' ORDER BY updated_at DESC;`;
    
    let pullRequests = [];
    try {
      const { stdout } = await execPromise(`coral sql "${sql}" --format json`);
      const firstBracket = stdout.indexOf('[');
      const lastBracket = stdout.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket !== -1) {
        const jsonStr = stdout.substring(firstBracket, lastBracket + 1);
        pullRequests = JSON.parse(jsonStr);
      }
    } catch (dbError) {
      console.error("Database query for pull requests failed:", dbError);
    }

    res.json({
      success: true,
      pull_requests: pullRequests
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post("/repos/releases", async (req, res) => {
  try {
    const { owner = "withcoral", repo = "coral" } = req.body || {};
    console.log(`Fetching releases for ${owner}/${repo}...`);

    const sql = `SELECT tag_name, name, published_at FROM github.releases WHERE owner = '${owner}' AND repo = '${repo}' ORDER BY published_at DESC LIMIT 30;`;
    
    let releases = [];
    try {
      const { stdout } = await execPromise(`coral sql "${sql}" --format json`);
      const firstBracket = stdout.indexOf('[');
      const lastBracket = stdout.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket !== -1) {
        const jsonStr = stdout.substring(firstBracket, lastBracket + 1);
        releases = JSON.parse(jsonStr);
      }
    } catch (dbError) {
      console.error("Database query for releases failed:", dbError);
    }

    res.json({
      success: true,
      releases
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post("/repos/commits", async (req, res) => {
  try {
    const { owner = "withcoral", repo = "coral", limit = 50 } = req.body || {};
    console.log(`Fetching commits for ${owner}/${repo}...`);

    const sql = `SELECT sha, commit__message, commit__author__name, commit__author__date FROM github.commits WHERE owner = '${owner}' AND repo = '${repo}' ORDER BY commit__author__date DESC LIMIT ${limit};`;
    
    let commits = [];
    try {
      const { stdout } = await execPromise(`coral sql "${sql}" --format json`);
      const firstBracket = stdout.indexOf('[');
      const lastBracket = stdout.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket !== -1) {
        const jsonStr = stdout.substring(firstBracket, lastBracket + 1);
        commits = JSON.parse(jsonStr);
      }
    } catch (dbError) {
      console.error("Database query for commits failed:", dbError);
    }

    res.json({
      success: true,
      commits
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post("/repos/merged-prs", async (req, res) => {
  try {
    const { owner = "withcoral", repo = "coral" } = req.body || {};
    console.log(`Fetching merged pull requests count for ${owner}/${repo}...`);

    const sql = `SELECT number, title, merged_at, user__login FROM github.pulls WHERE owner = '${owner}' AND repo = '${repo}' AND state = 'closed' AND merged_at IS NOT NULL ORDER BY merged_at DESC LIMIT 50;`;
    
    let pullRequests = [];
    try {
      const { stdout } = await execPromise(`coral sql "${sql}" --format json`);
      const firstBracket = stdout.indexOf('[');
      const lastBracket = stdout.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket !== -1) {
        const jsonStr = stdout.substring(firstBracket, lastBracket + 1);
        pullRequests = JSON.parse(jsonStr);
      }
    } catch (dbError) {
      console.error("Database query for merged pull requests failed:", dbError);
    }

    res.json({
      success: true,
      pull_requests: pullRequests
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(3001, () => {
  console.log("Backend running on port 3001");
});

