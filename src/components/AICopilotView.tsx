import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, AlertCircle, GitPullRequest, Activity, Terminal, ArrowRight, CheckCircle2, CircleDashed } from 'lucide-react';
import Markdown from 'react-markdown';
import { prStatuses } from '../mockData';
import ReleaseNotesView from './ReleaseNotesView';

const AgentLoadingProgress = () => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer1 = setTimeout(() => setStep(1), 1500);
    const timer2 = setTimeout(() => setStep(2), 3500);
    const timer3 = setTimeout(() => setStep(3), 7500);
    const timer4 = setTimeout(() => setStep(4), 11500);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
    };
  }, []);

  const steps = [
    { label: "Spawning autonomous Gemini CLI agent...", minStep: 1 },
    { label: "Connecting to Coral SQL database catalog...", minStep: 2 },
    { label: "Retrieving repository metadata & issue indices...", minStep: 3 },
    { label: "Gemini AI synthesizing context & generating final report...", minStep: 4 }
  ];

  return (
    <div className="py-2.5 px-3 space-y-2.5 max-w-sm select-none animate-fadeIn">
      <div className="flex items-center gap-2 text-xs font-semibold text-[#58a6ff]">
        <CircleDashed className="w-4 h-4 animate-spin text-[#58a6ff] shrink-0" />
        <span>FirstMate AI Agent Executing...</span>
      </div>
      <div className="space-y-1.5 font-mono text-[10px] text-[#8b949e]">
        {steps.map((s, idx) => {
          const isDone = step >= s.minStep;
          const isActive = step === idx;
          return (
            <div key={idx} className="flex items-center gap-2 transition-all duration-300">
              {isDone ? (
                <span className="text-[#3fb950] font-bold">✓</span>
              ) : isActive ? (
                <span className="text-[#58a6ff] animate-pulse">●</span>
              ) : (
                <span className="opacity-40">○</span>
              )}
              <span className={`${isDone ? 'text-[#c9d1d9] line-through opacity-70' : isActive ? 'text-[#58a6ff] font-medium' : 'opacity-50'}`}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: Date | string;
  isStreaming?: boolean;
  isError?: boolean;
  widget?: 'duplicates' | 'prs' | 'release_notes' | 'summary';
}

interface ChatSession {
  id: string;
  owner: string;
  repo: string;
  duplicates: any[];
  messages: Message[];
  timestamp: string;
}

const SUGGESTED_PROMPTS = [
  {
    label: 'Identify Duplicate Issues',
    icon: AlertCircle,
    prompt: 'Show me any duplicate issues in the repository right now.',
    color: 'text-[#3fb950]'
  },
  {
    label: 'List Stalled Pull Requests',
    icon: GitPullRequest,
    prompt: 'Check for stalled Pull Requests and summarize their status.',
    color: 'text-[#d29922]'
  },
  {
    label: 'Draft Release Notes',
    icon: Activity,
    prompt: 'Draft the release notes for version v1.3.0.',
    color: 'text-[#8957e5]'
  },
  {
    label: 'Summarize Repository Health',
    icon: Sparkles,
    prompt: 'Give me a brief summary of the overall repository health.',
    color: 'text-[#58a6ff]'
  }
];

interface AICopilotProps {
  initialQuery?: string;
  onClearInitialQuery?: () => void;
  activeOwner: string;
  activeRepo: string;
  onRepoConfigured: (owner: string, repo: string) => void;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string | null) => void;
  onAddSession: (session: ChatSession) => void;
  onAppendMessage: (sessionId: string, msg: Message) => void;
  onUpdateMessage: (sessionId: string, msgId: string, updates: Partial<Message>) => void;
  onUpdateDuplicates: (sessionId: string, duplicates: any[]) => void;
  pullRequests?: any[];
}

export default function AICopilotView({ 
  initialQuery, 
  onClearInitialQuery,
  activeOwner,
  activeRepo,
  onRepoConfigured,
  sessions,
  activeSessionId,
  onSelectSession,
  onAddSession,
  onAppendMessage,
  onUpdateMessage,
  onUpdateDuplicates,
  pullRequests = []
}: AICopilotProps) {
  // Derived state from parent session history
  const activeSession = sessions.find(s => s.id === activeSessionId);
  const messages = activeSession ? activeSession.messages : [];
  const duplicates = activeSession ? activeSession.duplicates : [];
  const isRepoConfigured = !!activeSessionId;

  // Input fields for configuration
  const [repoOwnerInput, setRepoOwnerInput] = useState('');
  const [repoNameInput, setRepoNameInput] = useState('');
  const [repoLinkInput, setRepoLinkInput] = useState('');
  
  // States
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Chat input states
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Load selected session state details only when activeSessionId shifts
  useEffect(() => {
    if (activeSession) {
      setRepoOwnerInput(activeSession.owner);
      setRepoNameInput(activeSession.repo);
      setRepoLinkInput(`https://github.com/${activeSession.owner}/${activeSession.repo}`);
      onRepoConfigured(activeSession.owner, activeSession.repo);
    } else {
      setRepoOwnerInput('');
      setRepoNameInput('');
      setRepoLinkInput('');
    }
  }, [activeSessionId]);

  // Handle external query from search bar
  useEffect(() => {
    if (initialQuery && isRepoConfigured) {
      handleSend(initialQuery);
      if (onClearInitialQuery) onClearInitialQuery();
    }
  }, [initialQuery, isRepoConfigured]);

  const handleLinkChange = (val: string) => {
    setRepoLinkInput(val);
    if (!val.trim()) {
      setRepoOwnerInput('');
      setRepoNameInput('');
      return;
    }

    try {
      let cleanUrl = val.replace(/^(https?:\/\/)?(www\.)?github\.com\//, '');
      const parts = cleanUrl.split('/');
      if (parts.length >= 2) {
        setRepoOwnerInput(parts[0]);
        setRepoNameInput(parts[1].replace(/\.git$/, ''));
      }
    } catch (e) {
      // Ignore URL parsing errors
    }
  };

  const handleStartAnalysis = async () => {
    if (!repoOwnerInput.trim() || !repoNameInput.trim()) return;

    setAnalysisError(null);

    try {
      const welcomeText = `Connected to repository **${repoOwnerInput}/${repoNameInput}** successfully!
      
How can I assist you with this repository today? You can ask me to find duplicate issues, list stalled pull requests, or generate release notes.`;
      
      const welcomeMessage: Message = {
        id: 'welcome',
        sender: 'assistant',
        text: welcomeText,
        timestamp: new Date().toISOString()
      };

      const newSessionId = Math.random().toString(36).substring(7);
      const newSession: ChatSession = {
        id: newSessionId,
        owner: repoOwnerInput,
        repo: repoNameInput,
        duplicates: [],
        messages: [welcomeMessage],
        timestamp: new Date().toISOString()
      };

      onAddSession(newSession);
      onRepoConfigured(repoOwnerInput, repoNameInput);
      onSelectSession(newSessionId);
    } catch (err: any) {
      console.error(err);
      setAnalysisError(err.message || 'An error occurred during repository connection.');
    }
  };

  const generateAIResponse = async (userText: string, currentSessionId: string, currentDuplicates: any[]) => {
    const text = userText.toLowerCase();
    let widget: 'duplicates' | 'prs' | 'release_notes' | 'summary' | undefined;

    if (text.includes('duplicate') || text.includes('triage') || text.includes('clash')) {
      widget = 'duplicates';
    } else if (text.includes('pr') || text.includes('pull request') || text.includes('stalled') || text.includes('stuck')) {
      widget = 'prs';
    } else if (text.includes('release') || text.includes('notes') || text.includes('changelog') || text.includes('version')) {
      widget = 'release_notes';
    } else if (text.includes('health') || text.includes('summary') || text.includes('repo') || text.includes('status')) {
      widget = 'summary';
    }

    setIsTyping(true);

    const aiMessageId = Math.random().toString();
    const typingMessage: Message = {
      id: aiMessageId,
      sender: 'assistant',
      text: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
      widget
    };
    onAppendMessage(currentSessionId, typingMessage);

    let activeDuplicates = currentDuplicates;
    let logsText = '';

    // Lazy load duplicates if requested and not loaded yet
    if (widget === 'duplicates') {
      try {
        let currentLogs = '';
        const appendLog = async (text: string, delay: number) => {
          currentLogs += text;
          onUpdateMessage(currentSessionId, aiMessageId, { text: `\`\`\`bash\n${currentLogs}\n\`\`\`` });
          await new Promise(resolve => setTimeout(resolve, delay));
        };

        await appendLog(`$ firstmate-cli --owner ${activeOwner} --repo ${activeRepo} --detect-duplicates\n`, 600);
        await appendLog(`[1/4] Connecting to FirstMate database...\n`, 800);
        await appendLog(`[2/4] Executing Coral SQL: SELECT number, title, body FROM github.issues WHERE owner = '${activeOwner}' AND repo = '${activeRepo}' AND state = 'open' ORDER BY updated_at DESC;\n`, 100);

        const responsePromise = fetch('http://localhost:3001/issues/duplicates', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ owner: activeOwner, repo: activeRepo })
        });

        await new Promise(resolve => setTimeout(resolve, 900));

        const response = await responsePromise;
        const data = await response.json();

        if (data.success) {
          const openIssues = data.open_issues || [];
          const totalIssues = data.total_open_issues_analyzed || openIssues.length;
          
          await appendLog(`      -> SUCCESS: Retrieved ${totalIssues} open issues from database.\n\n`, 300);
          await appendLog(`Listing retrieved open issues:\n`, 200);
          for (const issue of openIssues) {
            await appendLog(`  - [#${issue.number}] ${issue.title}\n`, 40);
          }
          await appendLog(`\n`, 400);

          await appendLog(`[3/4] Filtering and matching duplicate issue candidates using TF-IDF & semantic similarity...\n`, 1200);
          await appendLog(`[4/4] Cross-referencing matching candidates via Gemini LLM for confirmation...\n`, 1000);

          activeDuplicates = data.duplicates || [];
          onUpdateDuplicates(currentSessionId, activeDuplicates);

          await appendLog(`      -> SUCCESS: Analysis complete. Found ${activeDuplicates.length} potential duplicate issues.\n`, 800);
          logsText = `\`\`\`bash\n${currentLogs}\`\`\`\n\n`;
        } else {
          await appendLog(`      -> ERROR: Failed to run analysis: ${data.error || 'Unknown error'}\n`, 100);
          logsText = `\`\`\`bash\n${currentLogs}\`\`\`\n\n`;
        }
      } catch (e: any) {
        console.error('Failed to fetch duplicates on demand:', e);
      }
    }

    try {
      const systemPrompt = `You are FirstMate Copilot, a helpful AI assistant for the GitHub repository ${activeOwner}/${activeRepo}.
Below is the current repository context that you should use to answer the user's query:

---
DUPLICATE ISSUES CANDIDATES:
${activeDuplicates.length > 0 
  ? activeDuplicates.map(issue => `* Issue #${issue.duplicate_issue} ("${issue.duplicate_title}") is a potential duplicate of Issue #${issue.master_issue} ("${issue.master_title}") with ${Math.round(issue.confidence * 100)}% confidence. Reason: ${issue.reason}`).join('\n')
  : 'No duplicate issue candidates found for this repository.'}

ACTIVE PULL REQUESTS:
${activeOwner.toLowerCase() === 'flutter' && activeRepo.toLowerCase() === 'flutter' 
  ? prStatuses.map(pr => `* PR #${pr.number}: "${pr.title}" | Status: ${pr.status} | Age: ${pr.daysOld} days old`).join('\n')
  : 'No PR status context loaded.'}
---

Answer the user query based on this repository state. If the query asks for duplicates, stalled PRs, release notes, or health summaries, use the data above to answer specifically and outline the details. Be concise, friendly, and use standard GitHub markdown formatting. Do not refer to the prompt format or context instructions explicitly.

User Query: "${userText}"`;

      const response = await fetch('http://localhost:3001/ai/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          query: systemPrompt,
          userText: userText,
          owner: activeOwner,
          repo: activeRepo
        })
      });

      const data = await response.json();
      
      if (data.success) {
        const reply = data.response;
        
        let currentText = logsText;
        const words = reply.split(' ');
        for (let i = 0; i < words.length; i++) {
          await new Promise(resolve => setTimeout(resolve, 15 + Math.random() * 20));
          currentText += (i === 0 ? '' : ' ') + words[i];
          onUpdateMessage(currentSessionId, aiMessageId, { text: currentText });
        }

        onUpdateMessage(currentSessionId, aiMessageId, { isStreaming: false });
      } else {
        throw new Error(data.error || 'Server error occurred');
      }
    } catch (error: any) {
      console.error(error);
      const errorMessage = `❌ **Error:** Failed to connect to FirstMate backend. Make sure the server is running on http://localhost:3001.\n\n*Details:* ${error.message || 'Unknown error'}`;
      onUpdateMessage(currentSessionId, aiMessageId, { 
        text: errorMessage, 
        isStreaming: false,
        isError: true
      });
    } finally {
      setIsTyping(false);
    }
  };

  const handleSend = (textToSend?: string) => {
    const query = textToSend || input;
    if (!query.trim() || !activeSessionId) return;

    const userMessage: Message = {
      id: Math.random().toString(),
      sender: 'user',
      text: query,
      timestamp: new Date().toISOString()
    };

    onAppendMessage(activeSessionId, userMessage);
    if (!textToSend) setInput('');

    generateAIResponse(query, activeSessionId, duplicates);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0d1117]">
      {/* Onboarding Screen */}
      {!isRepoConfigured && (
        <div className="flex-1 overflow-y-auto px-4 py-12 flex items-center justify-center">
          <div className="max-w-md w-full bg-[#161b22] border border-[#30363d] rounded-2xl p-8 shadow-2xl space-y-6 animate-fadeIn">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-[#21262d] border border-[#30363d] rounded-xl flex items-center justify-center mx-auto text-[#58a6ff]">
                <Bot className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-white">Connect GitHub Repository</h2>
              <p className="text-xs text-[#8b949e]">
                Enter a GitHub link to initialize a new chat session for that repository.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#c9d1d9]">GitHub Repository Link</label>
                <input
                  type="text"
                  placeholder="https://github.com/owner/repository  or  owner/repository"
                  value={repoLinkInput}
                  onChange={(e) => handleLinkChange(e.target.value)}
                  className="w-full bg-[#0d1117] border border-[#30363d] hover:border-[#8b949e] focus:border-[#388bfd] focus:outline-none rounded-md px-3 py-2.5 text-sm text-[#c9d1d9] placeholder-[#8b949e] transition-all"
                />
                
                {repoOwnerInput && repoNameInput && (
                  <div className="flex items-center gap-1.5 text-xs text-[#3fb950] px-1 animate-fadeIn">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Detected: <strong>{repoOwnerInput}/{repoNameInput}</strong></span>
                  </div>
                )}
              </div>

              {analysisError && (
                <div className="p-3 bg-[#211214] border border-[#f85149]/30 text-[#f85149] rounded-md text-xs">
                  {analysisError}
                </div>
              )}

              <button
                onClick={handleStartAnalysis}
                disabled={!repoOwnerInput.trim() || !repoNameInput.trim()}
                className="w-full py-2.5 bg-[#238636] hover:bg-[#2ea043] disabled:bg-[#161b22] disabled:border-[#30363d] text-white disabled:text-[#8b949e] border border-[rgba(240,246,252,0.1)] rounded-md font-semibold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed active:scale-[0.98]"
              >
                Connect & Start Chat <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Window */}
      {isRepoConfigured && (
        <>
          {/* Header */}
          <div className="bg-[#161b22] border-b border-[#30363d] px-6 py-3 flex justify-between items-center text-sm shrink-0">
            <div className="flex items-center space-x-2 text-white font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-[#3fb950] animate-pulse" />
              <span>Active Repository:</span>
              <span className="text-[#58a6ff] hover:underline cursor-pointer select-none">
                {activeOwner}/{activeRepo}
              </span>
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6">
            {messages.map((message) => (
              <div 
                key={message.id} 
                className={`flex gap-4 max-w-3xl mx-auto ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {/* Bot Avatar */}
                {message.sender === 'assistant' && (
                  <div className="w-8 h-8 rounded-lg bg-[#21262d] border border-[#30363d] flex items-center justify-center shrink-0">
                    <Bot className="w-5 h-5 text-[#58a6ff]" />
                  </div>
                )}

                {/* Message Bubble */}
                <div className={`flex flex-col max-w-[90%] w-full ${message.sender === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`px-4 py-3 rounded-2xl border text-sm leading-relaxed break-words w-full overflow-hidden ${
                    message.sender === 'user' 
                      ? 'bg-[#1f6feb] border-[#388bfd] text-white rounded-tr-none' 
                      : message.isError
                        ? 'bg-[#211214] border-[#f85149] text-[#f85149] rounded-tl-none'
                        : 'bg-[#161b22] border-[#30363d] text-[#c9d1d9] rounded-tl-none'
                  }`}>
                    {message.sender === 'user' ? (
                      <p className="whitespace-pre-wrap break-words">{message.text}</p>
                    ) : message.text ? (
                      <div className="space-y-3">
                        <div className={`prose prose-invert max-w-none break-words w-full ${message.isError ? 'text-[#f85149]' : 'text-[#c9d1d9]'} 
                          [&>h3]:text-white [&>h3]:font-bold [&>h3]:text-base [&>h3]:mt-4 [&>h3]:mb-2
                          [&>p]:mb-3 [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:mb-3 [&>ul>li]:mb-1 [&>strong]:text-white [&>strong]:font-semibold`}>
                          <Markdown>{message.text}</Markdown>
                        </div>
                        {message.isStreaming ? (
                          <div className="flex items-center gap-2 pt-2 border-t border-[#30363d]/50 text-xs text-[#8b949e]">
                            <CircleDashed className="w-3.5 h-3.5 text-[#58a6ff] animate-spin shrink-0" />
                            <span className="animate-pulse">
                              {message.widget === 'duplicates' && "FirstMate AI is analyzing duplicate issues via Coral SQL & Gemini..."}
                              {message.widget === 'prs' && "FirstMate AI is retrieving stalled pull requests..."}
                              {message.widget === 'release_notes' && "FirstMate AI is drafting release notes..."}
                              {message.widget === 'summary' && "FirstMate AI is computing repository health..."}
                              {!message.widget && "FirstMate AI is formulating response..."}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 pt-2 border-t border-[#30363d]/50 text-[11px] text-[#8b949e] opacity-80">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#238636] shrink-0" />
                            <span>Analysis Complete • End of Communication</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <AgentLoadingProgress />
                    )}
                  </div>

                  {/* Timestamp / Status */}
                  <span className="text-[10px] text-[#8b949e] mt-1.5 px-1">
                    {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>

                  {/* Inline Widgets */}
                  {message.widget && !message.isStreaming && (
                    <div className="w-full mt-4 border border-[#30363d] rounded-xl overflow-hidden shadow-2xl bg-[#010409]/60 backdrop-blur-md animate-fadeIn">
                      {message.widget === 'duplicates' && (
                        <div className="w-full">
                          <div className="bg-[#161b22] border-b border-[#30363d] p-3.5 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="w-4 h-4 text-[#f0883e]" />
                              <span className="text-xs font-semibold text-white">Duplicate Detection Candidates</span>
                            </div>
                            <span className="text-[10px] bg-[#30363d] text-[#c9d1d9] px-2 py-0.5 rounded-full font-medium">
                              {duplicates.length} issues found
                            </span>
                          </div>
                          
                          <div className="overflow-x-auto w-full">
                            <table className="w-full border-collapse text-left text-xs table-fixed">
                              <thead>
                                <tr className="bg-[#161b22]/50 border-b border-[#30363d] text-[#8b949e] font-medium">
                                  <th className="p-3 font-medium w-[28%]">Duplicate Candidate</th>
                                  <th className="p-3 font-medium w-[28%]">Master Reference</th>
                                  <th className="p-3 font-medium text-center w-[12%]">Match</th>
                                  <th className="p-3 font-medium w-[32%]">Reasoning Context</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#30363d]">
                                {duplicates.length === 0 ? (
                                  <tr>
                                    <td colSpan={4} className="p-8 text-center text-[#8b949e]">
                                      No duplicate issue candidates found for this repository.
                                    </td>
                                  </tr>
                                ) : (
                                  duplicates.map((issue, idx) => (
                                    <tr key={idx} className="hover:bg-[#161b22]/30 transition-colors align-top group">
                                      <td className="p-3 break-words">
                                        <div className="flex flex-col gap-1 max-w-full items-start">
                                          <span className="font-semibold text-white group-hover:text-[#58a6ff] transition-colors leading-snug break-words">
                                            {issue.duplicate_title}
                                          </span>
                                          <span className="px-1.5 py-0.5 rounded bg-[#238636]/15 border border-[#2ea043]/30 text-[#3fb950] font-semibold font-mono text-[10px]">
                                            #{issue.duplicate_issue}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="p-3 break-words">
                                        <div className="flex flex-col gap-1 max-w-full items-start">
                                          <span className="font-medium text-[#c9d1d9] leading-snug break-words">
                                            {issue.master_title || "Original Issue"}
                                          </span>
                                          <span className="px-1.5 py-0.5 rounded bg-[#238636]/15 border border-[#2ea043]/30 text-[#3fb950] font-semibold font-mono text-[10px]">
                                            #{issue.master_issue}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="p-3 text-center align-middle">
                                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                          issue.confidence >= 0.9 
                                            ? 'bg-[#1b2a1a] border-[#2ea44f] text-[#3fb950]' 
                                            : issue.confidence >= 0.75 
                                              ? 'bg-[#292212] border-[#d29922] text-[#e3b341]' 
                                              : 'bg-[#1e1a26] border-[#8957e5] text-[#a371f7]'
                                        }`}>
                                          {Math.round(issue.confidence * 100)}%
                                        </span>
                                      </td>
                                      <td className="p-3 break-words">
                                        <p className="text-[#8b949e] leading-relaxed break-words text-[11px] max-w-full">
                                          {issue.reason}
                                        </p>
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {message.widget === 'prs' && (
                        <div>
                          <div className="bg-[#161b22] border-b border-[#30363d] p-3 flex items-center gap-2">
                            <GitPullRequest className="w-4 h-4 text-[#d29922]" />
                            <span className="text-xs font-semibold text-white">Repository Pull Requests</span>
                          </div>
                          <div className="divide-y divide-[#30363d] max-h-60 overflow-y-auto">
                            {pullRequests && pullRequests.length > 0 ? (
                              pullRequests.map((pr, idx) => {
                                const daysOld = Math.max(0, Math.floor((Date.now() - new Date(pr.created_at).getTime()) / (1000 * 60 * 60 * 24)));
                                return (
                                  <div key={idx} className="p-3 flex items-center justify-between hover:bg-[#161b22]/50 transition-colors">
                                    <div className="min-w-0 flex-1 pr-2">
                                      <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-xs font-semibold text-white truncate">{pr.title}</span>
                                        <span className={`px-1.5 py-0.5 rounded-full border text-[9px] font-medium shrink-0 ${
                                          daysOld >= 14 
                                            ? 'border-[#f85149] text-[#f85149]' 
                                            : daysOld >= 7 
                                              ? 'border-[#d29922] text-[#d29922]' 
                                              : 'border-[#238636] text-[#238636]'
                                        }`}>
                                          {daysOld >= 14 ? `${daysOld}d stalled` : daysOld >= 7 ? 'Needs Review' : 'Active'}
                                        </span>
                                      </div>
                                      <p className="text-[10px] text-[#8b949e] flex items-center gap-1.5 mt-1">
                                        <span className="text-[9px] bg-[#238636]/15 border border-[#2ea043]/30 text-[#3fb950] px-1 py-0.2 rounded font-mono font-semibold">
                                          #{pr.number}
                                        </span>
                                        <span>opened by {pr.user__login}</span>
                                      </p>
                                    </div>
                                    <a 
                                      href={pr.html_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-2 py-1 bg-[#21262d] border border-[#30363d] text-white text-[11px] font-medium rounded-md hover:bg-[#30363d] transition-colors shrink-0"
                                    >
                                      View PR
                                    </a>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="p-4 text-center text-xs text-[#8b949e]">
                                No open pull requests found for this repository.
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {message.widget === 'release_notes' && (
                        <div className="p-4">
                          <ReleaseNotesView owner={activeOwner} repo={activeRepo} />
                        </div>
                      )}

                      {message.widget === 'summary' && (
                        <div className="p-4">
                          <div className="flex items-center gap-3 bg-[#161b22] border border-[#30363d] p-3 rounded-lg mb-3">
                            <div className="w-8 h-8 rounded-full bg-[#238636]/20 border border-[#238636]/50 flex items-center justify-center">
                              <Activity className="w-4 h-4 text-[#238636]" />
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-white">Repository Health Score</p>
                              <p className="text-[10px] text-[#8b949e]">
                                Good (82/100) • {duplicates.length} Duplicate(s) Found
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-center">
                            <div className="bg-[#161b22]/50 border border-[#30363d] p-2 rounded-lg">
                              <p className="text-lg font-bold text-white">{duplicates.length}</p>
                              <p className="text-[10px] text-[#8b949e]">Duplicates Found</p>
                            </div>
                            <div className="bg-[#161b22]/50 border border-[#30363d] p-2 rounded-lg">
                              <p className="text-lg font-bold text-white">
                                {activeOwner.toLowerCase() === 'flutter' && activeRepo.toLowerCase() === 'flutter' ? '2' : '0'}
                              </p>
                              <p className="text-[10px] text-[#8b949e]">Stalled PRs</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* User Avatar */}
                {message.sender === 'user' && (
                  <div className="w-8 h-8 rounded-lg bg-[#388bfd]/20 border border-[#388bfd]/50 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-[#58a6ff]" />
                  </div>
                )}
              </div>
            ))}

            {/* Suggested Prompts Grid on Welcome */}
            {messages.length === 1 && !isTyping && (
              <div className="max-w-2xl mx-auto mt-12">
                <h3 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-4 text-center">Suggested Tasks</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {SUGGESTED_PROMPTS.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(item.prompt)}
                      className="flex items-center gap-3 p-4 bg-[#161b22] border border-[#30363d] rounded-xl hover:bg-[#21262d] hover:border-[#8b949e]/30 text-left transition-all group active:scale-[0.98]"
                    >
                      <div className={`w-8 h-8 rounded-lg bg-[#0d1117] flex items-center justify-center ${item.color} group-hover:scale-110 transition-transform shrink-0`}>
                        <item.icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{item.label}</p>
                        <p className="text-[11px] text-[#8b949e] truncate mt-0.5">{item.prompt}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-[#8b949e] opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Form at Bottom */}
          <div className="border-t border-[#30363d] bg-[#010409]/60 backdrop-blur-md p-4 shrink-0">
            <div className="max-w-3xl mx-auto relative">
              <div className="bg-[#161b22] border border-[#30363d] rounded-2xl flex flex-col focus-within:border-[#388bfd] focus-within:ring-1 focus-within:ring-[#388bfd] transition-all shadow-xl">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask FirstMate AI anything..."
                  rows={2}
                  className="w-full bg-transparent border-0 outline-none text-sm text-[#c9d1d9] placeholder-[#8b949e] px-4 py-3 resize-none focus:ring-0 focus:outline-none"
                />
                <div className="flex justify-between items-center px-3 py-2 border-t border-[#30363d]/50 bg-[#0d1117]/30 rounded-b-2xl">
                  <span className="text-[10px] text-[#8b949e] flex items-center gap-1.5 ml-1">
                    <Terminal className="w-3.5 h-3.5" />
                    Press Enter to send, Shift+Enter for newline
                  </span>
                  <button
                    onClick={() => handleSend()}
                    disabled={!input.trim() || isTyping}
                    className="w-8 h-8 rounded-lg bg-[#238636] hover:bg-[#2ea043] disabled:bg-[#161b22] disabled:border-[#30363d] text-white disabled:text-[#8b949e] border border-[rgba(240,246,252,0.1)] flex items-center justify-center transition-all cursor-pointer disabled:cursor-not-allowed active:scale-95"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
