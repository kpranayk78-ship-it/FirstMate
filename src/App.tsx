/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { prStatuses } from './mockData';
import { GitPullRequest, Copy, CheckCircle2, CircleDashed, AlertCircle, ExternalLink, Activity, Ship, Sparkles, Plus, Trash2, ArrowRight, Bot, Layers, Flame, Network, Database, RefreshCw, Search, ListTodo } from 'lucide-react';
import ReleaseNotesView from './components/ReleaseNotesView';
import AICopilotView from './components/AICopilotView';

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

export default function App() {
  const [activeTab, setActiveTab] = useState('copilot'); // Make AI Copilot active by default
  const [searchQuery, setSearchQuery] = useState('');
  const [initialChatQuery, setInitialChatQuery] = useState('');
  const [duplicateIssues, setDuplicateIssues] = useState<any[]>([]);
  const [openIssues, setOpenIssues] = useState<any[]>([]);
  const [issueSearchQuery, setIssueSearchQuery] = useState('');
  const [totalAnalyzed, setTotalAnalyzed] = useState<number>(0);
  const [shouldRefreshNext, setShouldRefreshNext] = useState(false);
  const [isFromDb, setIsFromDb] = useState(false);
  const [loadingDuplicates, setLoadingDuplicates] = useState(false);
  const [errorDuplicates, setErrorDuplicates] = useState<string | null>(null);
  const [pullRequests, setPullRequests] = useState<any[]>([]);
  const [loadingPRs, setLoadingPRs] = useState(false);
  const [errorPRs, setErrorPRs] = useState<string | null>(null);
  const [shouldRefreshPRs, setShouldRefreshPRs] = useState(false);
  const [repoOwner, setRepoOwner] = useState('flutter');
  const [repoName, setRepoName] = useState('flutter');
  const [cliLogs, setCliLogs] = useState('');

  // Lifted Chat Sessions state
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem('firstmate_sessions');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    return localStorage.getItem('firstmate_active_session_id');
  });

  // Keep repoOwner and repoName in sync with the active session
  useEffect(() => {
    if (activeSessionId) {
      const session = sessions.find(s => s.id === activeSessionId);
      if (session) {
        setRepoOwner(session.owner);
        setRepoName(session.repo);
      }
    }
  }, [activeSessionId, sessions]);

  // Functional Updaters to avoid stale async closures
  const addSession = (newSession: ChatSession) => {
    setSessions(prev => {
      const updated = [newSession, ...prev.filter(s => s.id !== newSession.id)];
      localStorage.setItem('firstmate_sessions', JSON.stringify(updated));
      return updated;
    });
  };

  const appendMessage = (sessionId: string, msg: Message) => {
    setSessions(prev => {
      const updated = prev.map(s => {
        if (s.id === sessionId) {
          return {
            ...s,
            messages: [...s.messages, msg],
            timestamp: new Date().toISOString()
          };
        }
        return s;
      });
      localStorage.setItem('firstmate_sessions', JSON.stringify(updated));
      return updated;
    });
  };

  const updateMessage = (sessionId: string, msgId: string, updates: Partial<Message>) => {
    setSessions(prev => {
      const updated = prev.map(s => {
        if (s.id === sessionId) {
          return {
            ...s,
            messages: s.messages.map(m => m.id === msgId ? { ...m, ...updates } : m)
          };
        }
        return s;
      });
      localStorage.setItem('firstmate_sessions', JSON.stringify(updated));
      return updated;
    });
  };

  const updateSessionDuplicates = (sessionId: string, duplicates: any[]) => {
    setSessions(prev => {
      const updated = prev.map(s => {
        if (s.id === sessionId) {
          return {
            ...s,
            duplicates
          };
        }
        return s;
      });
      localStorage.setItem('firstmate_sessions', JSON.stringify(updated));
      return updated;
    });
  };

  const deleteSession = (id: string) => {
    setSessions(prev => {
      const updated = prev.filter(x => x.id !== id);
      localStorage.setItem('firstmate_sessions', JSON.stringify(updated));
      return updated;
    });
    if (activeSessionId === id) {
      selectSession(null);
    }
  };

  const selectSession = (id: string | null) => {
    setActiveSessionId(id);
    if (id === null) {
      localStorage.removeItem('firstmate_active_session_id');
    } else {
      localStorage.setItem('firstmate_active_session_id', id);
      setActiveTab('copilot'); // Auto-switch to Copilot tab when selecting historical chats
    }
  };

  useEffect(() => {
    if (activeTab === 'duplicates') {
      let isCancelled = false;
      const fetchDuplicates = async () => {
        setLoadingDuplicates(true);
        setErrorDuplicates(null);
        setCliLogs('');
        
        let currentLogs = '';
        
        const appendLog = async (text: string, delay: number) => {
          if (isCancelled) return;
          currentLogs += text;
          setCliLogs(currentLogs);
          await new Promise(resolve => setTimeout(resolve, delay));
        };

        try {
          if (shouldRefreshNext) {
            await appendLog(`$ firstmate-cli --owner ${repoOwner} --repo ${repoName} --detect-duplicates --force-refresh\n`, 400);
            await appendLog(`[1/4] Connecting to FirstMate database...\n`, 600);
            await appendLog(`[2/4] Executing Coral SQL: SELECT number, title, body FROM github.issues WHERE owner = '${repoOwner}' AND repo = '${repoName}' AND state = 'open' ORDER BY updated_at DESC;\n`, 100);
          } else {
            await appendLog(`$ firstmate-cli --owner ${repoOwner} --repo ${repoName} --detect-duplicates\n`, 200);
            await appendLog(`[Static DB] Querying persistent database for existing analysis...\n`, 300);
          }

          if (isCancelled) return;
          
          const payload: any = { owner: repoOwner, repo: repoName };
          if (shouldRefreshNext) {
            payload.refresh = true;
          }

          const responsePromise = fetch('http://localhost:3001/issues/duplicates', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });

          await new Promise(resolve => setTimeout(resolve, 500));
          if (isCancelled) return;

          const response = await responsePromise;
          const data = await response.json();

          if (isCancelled) return;

          if (data.success) {
            const openIssues = data.open_issues || [];
            const totalIssues = data.total_open_issues_analyzed || openIssues.length;
            
            setIsFromDb(!!data.from_db);

            if (data.from_db) {
              await appendLog(`[Static DB] Found cached analysis in persistent database!\n`, 200);
              await appendLog(`      -> SUCCESS: Loaded ${totalIssues} analyzed issues instantly (0ms).\n\n`, 300);
            } else {
              await appendLog(`      -> SUCCESS: Retrieved ${totalIssues} open issues from database.\n\n`, 300);
              await appendLog(`Listing retrieved open issues:\n`, 150);
              for (const issue of openIssues) {
                await appendLog(`  - [#${issue.number}] ${issue.title}\n`, 25);
              }
              await appendLog('\n', 200);
              await appendLog(`[3/4] Filtering and matching duplicate issue candidates using TF-IDF & semantic similarity...\n`, 600);
              await appendLog(`[4/4] Cross-referencing matching candidates via Gemini LLM for confirmation...\n`, 500);
            }

            const duplicates = data.duplicates || [];
            setDuplicateIssues(duplicates);
            setTotalAnalyzed(totalIssues);
            setOpenIssues(openIssues);

            if (data.from_db) {
              await appendLog(`      -> SUCCESS: Loaded ${duplicates.length} duplicate issues from static DB cache.\n`, 400);
            } else {
              await appendLog(`      -> SUCCESS: Analysis complete. Found ${duplicates.length} potential duplicate issues.\n`, 400);
            }
          } else {
            await appendLog(`      -> ERROR: Failed to run analysis: ${data.error || 'Unknown error'}\n`, 100);
            setErrorDuplicates(data.error || 'Failed to fetch duplicates');
          }
        } catch (err: any) {
          if (!isCancelled) {
            currentLogs += `      -> ERROR: ${err.message || 'An error occurred'}\n`;
            setCliLogs(currentLogs);
            setErrorDuplicates(err.message || 'An error occurred while fetching duplicates');
          }
        } finally {
          if (!isCancelled) {
            setLoadingDuplicates(false);
            if (shouldRefreshNext) {
              setShouldRefreshNext(false);
            }
          }
        }
      };
      fetchDuplicates();
      return () => {
        isCancelled = true;
      };
    }
  }, [activeTab, repoOwner, repoName, shouldRefreshNext]);

  useEffect(() => {
    if (activeTab === 'pr_status') {
      let isCancelled = false;
      const fetchPRs = async () => {
        setLoadingPRs(true);
        setErrorPRs(null);
        try {
          const response = await fetch('http://localhost:3001/issues/pull-requests', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ owner: repoOwner, repo: repoName })
          });
          const data = await response.json();
          if (!isCancelled && data.success) {
            setPullRequests(data.pull_requests || []);
          } else if (!isCancelled) {
            setErrorPRs(data.error || 'Failed to fetch pull requests');
          }
        } catch (err: any) {
          if (!isCancelled) {
            setErrorPRs(err.message || 'An error occurred while fetching pull requests');
          }
        } finally {
          if (!isCancelled) {
            setLoadingPRs(false);
            if (shouldRefreshPRs) {
              setShouldRefreshPRs(false);
            }
          }
        }
      };
      fetchPRs();
      return () => {
        isCancelled = true;
      };
    }
  }, [activeTab, repoOwner, repoName, shouldRefreshPRs]);

  return (
    <div className="w-full h-screen bg-[#0d1117] text-[#c9d1d9] flex font-sans selection:bg-[#388bfd]/30 selection:text-white">
      {/* Left Navigation Rail (Unified Sidebar) */}
      <nav className="w-64 bg-[#010409] border-r border-[#30363d] flex flex-col justify-between py-6 shrink-0">
        <div className="flex flex-col w-full overflow-hidden">
          <div className="px-6 mb-6 flex items-center space-x-3 text-white shrink-0">
            <div className="w-8 h-8 bg-[#161b22] border border-[#30363d] p-1.5 rounded-lg flex items-center justify-center">
               <Ship className="w-full h-full text-[#c9d1d9]" />
            </div>
            <span className="font-semibold tracking-tight">FirstMate</span>
          </div>
          
          <div className="flex-1 overflow-y-auto px-3 space-y-1.5 scrollbar-thin">
            <div className="px-3 mb-1 text-[10px] font-bold text-[#8b949e] uppercase tracking-wider">AI Copilot</div>
            
            <button 
              onClick={() => {
                setActiveTab('copilot');
                selectSession(null); // Click to start a new chat
              }}
              className={`flex items-center w-full px-3 py-2 rounded-md transition-all text-sm font-semibold justify-between ${
                activeTab === 'copilot' && activeSessionId === null 
                  ? 'bg-[#161b22] text-white border border-[#30363d]' 
                  : 'text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9] border border-transparent'
              }`}
            >
              <span className="flex items-center">
                <Sparkles className="w-4 h-4 mr-3 text-[#58a6ff]" />
                FirstMate AI
              </span>
              <Plus className="w-3.5 h-3.5 hover:text-white shrink-0" />
            </button>

            {/* Chat History List directly in the single sidebar */}
            {sessions.length > 0 && (
              <div className="pl-4 pr-1 py-1 flex flex-col space-y-1 overflow-y-auto mt-1 border-l border-[#30363d]/50 ml-5">
                {sessions.map((s) => {
                  const isSessionActive = s.id === activeSessionId;
                  return (
                    <div key={s.id} className="flex flex-col space-y-1">
                      {/* Session Main Item */}
                      <div
                        className={`group flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors cursor-pointer select-none ${
                          isSessionActive && activeTab === 'copilot'
                            ? 'bg-[#21262d] text-white font-medium border border-[#30363d]'
                            : 'text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]'
                        }`}
                        onClick={() => {
                          selectSession(s.id);
                          setActiveTab('copilot');
                        }}
                      >
                        <span className="truncate flex-1 pr-1 font-semibold">{s.owner}/{s.repo}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession(s.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 hover:text-[#f85149] p-0.5 rounded transition-all shrink-0 ml-1"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Nested Subchats Tree */}
                      {isSessionActive && (
                        <div className="pl-3 flex flex-col space-y-0.5 border-l border-[#30363d]/80 ml-2 py-1">
                          <button
                            onClick={() => {
                              setActiveSessionId(s.id);
                              localStorage.setItem('firstmate_active_session_id', s.id);
                              setActiveTab('duplicates');
                            }}
                            className={`flex items-center w-full px-2 py-1 rounded text-[11px] transition-colors ${
                              activeTab === 'duplicates'
                                ? 'bg-[#1f6feb]/15 text-[#58a6ff] font-medium'
                                : 'text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]'
                            }`}
                          >
                            <AlertCircle className="w-3 h-3 mr-2 shrink-0" />
                            <span className="truncate">Duplicates</span>
                          </button>
                          
                          <button
                            onClick={() => {
                              setActiveSessionId(s.id);
                              localStorage.setItem('firstmate_active_session_id', s.id);
                              setActiveTab('pr_status');
                            }}
                            className={`flex items-center w-full px-2 py-1 rounded text-[11px] transition-colors ${
                              activeTab === 'pr_status'
                                ? 'bg-[#1f6feb]/15 text-[#58a6ff] font-medium'
                                : 'text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]'
                            }`}
                          >
                            <GitPullRequest className="w-3 h-3 mr-2 shrink-0" />
                            <span className="truncate">Pull Requests</span>
                          </button>
                          
                          <button
                            onClick={() => {
                              setActiveSessionId(s.id);
                              localStorage.setItem('firstmate_active_session_id', s.id);
                              setActiveTab('release');
                            }}
                            className={`flex items-center w-full px-2 py-1 rounded text-[11px] transition-colors ${
                              activeTab === 'release'
                                ? 'bg-[#1f6feb]/15 text-[#58a6ff] font-medium'
                                : 'text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]'
                            }`}
                          >
                            <Activity className="w-3 h-3 mr-2 shrink-0" />
                            <span className="truncate">Release Notes</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        
        <div className="px-6 shrink-0 pt-4 border-t border-[#30363d]/50">
          <div className="flex items-center space-x-2 text-xs text-[#8b949e]">
            <div className="w-2 h-2 rounded-full bg-[#238636]" />
            <span className="truncate">{repoOwner}/{repoName}</span>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-[#30363d] flex items-center justify-between px-8 shrink-0 bg-[#010409]">
          <h1 className="text-sm font-medium text-white flex items-center gap-2">
            {activeTab === 'duplicates' && 'Issue Triage'}
            {activeTab === 'pr_status' && 'Pull Request Health'}
            {activeTab === 'release' && 'Release Notes'}
            {activeTab === 'copilot' && (
              <span className="flex items-center gap-1.5 text-white">
                <Sparkles className="w-4 h-4 text-[#58a6ff] animate-pulse" />
                FirstMate AI Assistant
              </span>
            )}
          </h1>

          {/* Global Search Bar */}
          <div className="w-80 relative">
            <input
              type="text"
              placeholder="Search or ask AI anything..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchQuery.trim()) {
                  setInitialChatQuery(searchQuery);
                  setSearchQuery('');
                  setActiveTab('copilot');
                }
              }}
              className="w-full bg-[#0d1117] border border-[#30363d] hover:border-[#8b949e] focus:border-[#388bfd] focus:outline-none rounded-md px-3 py-1.5 text-xs text-[#c9d1d9] placeholder-[#8b949e] transition-all pr-8"
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none">
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[9px] font-sans font-semibold text-[#8b949e] bg-[#161b22] border border-[#30363d] rounded shadow-sm">
                ↵
              </kbd>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        {activeTab === 'copilot' ? (
          <div className="flex-1 overflow-hidden flex flex-col">
            <AICopilotView 
              initialQuery={initialChatQuery}
              onClearInitialQuery={() => setInitialChatQuery('')}
              activeOwner={repoOwner}
              activeRepo={repoName}
              onRepoConfigured={(owner, repo) => {
                setRepoOwner(owner);
                setRepoName(repo);
              }}
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelectSession={selectSession}
              onAddSession={addSession}
              onAppendMessage={appendMessage}
              onUpdateMessage={updateMessage}
              onUpdateDuplicates={updateSessionDuplicates}
              pullRequests={pullRequests}
            />
          </div>
        ) : (
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="max-w-[1216px] mx-auto">
              {activeTab === 'duplicates' && (
                <div className="space-y-6">
                  {/* Premium Visual Dashboard Header & KPIs */}
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between border-b border-[#30363d] pb-4">
                      <div>
                        <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                          <Network className="w-5 h-5 text-[#58a6ff] animate-pulse" />
                          Duplicate Issue Analysis
                        </h2>
                        <p className="text-xs text-[#8b949e] mt-1">
                          Semantic matching and graph connection workspace powered by Coral SQL & Gemini LLM
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setShouldRefreshNext(true)}
                          disabled={loadingDuplicates}
                          className="text-[10px] bg-[#21262d] border border-[#30363d] text-[#c9d1d9] hover:bg-[#30363d] hover:border-[#8b949e] px-2.5 py-1.5 rounded-md font-semibold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50 select-none cursor-pointer"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${loadingDuplicates ? 'animate-spin' : ''}`} />
                          Re-run Analysis (Force Sync)
                        </button>
                        {loadingDuplicates ? (
                          <span className="text-[10px] bg-[#30363d]/50 border border-[#30363d] text-[#8b949e] px-2.5 py-1.5 rounded-full font-semibold flex items-center gap-1.5 shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#8b949e] animate-pulse" />
                            Analyzing...
                          </span>
                        ) : isFromDb ? (
                          <span className="text-[10px] bg-[#238636]/15 border border-[#2ea043]/30 text-[#3fb950] px-2.5 py-1.5 rounded-full font-semibold flex items-center gap-1.5 shadow-sm">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#3fb950]" />
                            Static DB (Instant)
                          </span>
                        ) : (
                          <span className="text-[10px] bg-[#388bfd]/15 border border-[#388bfd]/30 text-[#58a6ff] px-2.5 py-1.5 rounded-full font-semibold flex items-center gap-1.5 shadow-sm animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#388bfd] animate-pulse" />
                            Freshly Synced
                          </span>
                        )}
                        <span className="text-[10px] bg-[#238636]/15 border border-[#238636]/30 text-[#2ea44f] px-2.5 py-1.5 rounded-full font-semibold flex items-center gap-1.5 shadow-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#238636] animate-ping" />
                          CLI Active Context
                        </span>
                      </div>
                    </div>

                    {!loadingDuplicates && !errorDuplicates && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fadeIn">
                        {/* Stat Card 1: Total Scanned */}
                        <div className="bg-[#161b22]/40 border border-[#30363d] rounded-xl p-4.5 flex items-center justify-between shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-[#388bfd] transition-all">
                          <div className="absolute right-[-10px] top-[-10px] opacity-[0.03] group-hover:scale-110 transition-transform duration-300">
                            <Database className="w-24 h-24 text-white" />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase text-[#8b949e] tracking-wider block">Scope Scanned</span>
                            <span className="text-2xl font-extrabold text-white mt-1 block">
                              {totalAnalyzed || 139}
                            </span>
                            <span className="text-[10px] text-[#8b949e] mt-1 block">Total open issues retrieved</span>
                          </div>
                          <div className="w-10 h-10 rounded-lg bg-[#388bfd]/10 border border-[#388bfd]/25 flex items-center justify-center text-[#58a6ff] shrink-0">
                            <Database className="w-5 h-5" />
                          </div>
                        </div>

                        {/* Stat Card 2: Total Matches */}
                        <div className="bg-[#161b22]/40 border border-[#30363d] rounded-xl p-4.5 flex items-center justify-between shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-[#f0883e] transition-all">
                          <div className="absolute right-[-10px] top-[-10px] opacity-[0.03] group-hover:scale-110 transition-transform duration-300">
                            <Network className="w-24 h-24 text-white" />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase text-[#8b949e] tracking-wider block">Duplicate Pairs</span>
                            <span className="text-2xl font-extrabold text-[#f0883e] mt-1 block">
                              {duplicateIssues.length}
                            </span>
                            <span className="text-[10px] text-[#8b949e] mt-1 block">Confirmed matches</span>
                          </div>
                          <div className="w-10 h-10 rounded-lg bg-[#f0883e]/10 border border-[#f0883e]/25 flex items-center justify-center text-[#f0883e] shrink-0">
                            <Network className="w-5 h-5" />
                          </div>
                        </div>

                        {/* Stat Card 3: High Similarity Matches */}
                        <div className="bg-[#161b22]/40 border border-[#30363d] rounded-xl p-4.5 flex items-center justify-between shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-[#8957e5] transition-all">
                          <div className="absolute right-[-10px] top-[-10px] opacity-[0.03] group-hover:scale-110 transition-transform duration-300">
                            <Flame className="w-24 h-24 text-white" />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase text-[#8b949e] tracking-wider block">High Match Risks</span>
                            <span className="text-2xl font-extrabold text-[#a371f7] mt-1 block">
                              {duplicateIssues.filter(issue => issue.confidence >= 0.9).length}
                            </span>
                            <span className="text-[10px] text-[#8b949e] mt-1 block">Confidence matching &gt;= 90%</span>
                          </div>
                          <div className="w-10 h-10 rounded-lg bg-[#8957e5]/10 border border-[#8957e5]/25 flex items-center justify-center text-[#a371f7] shrink-0">
                            <Flame className="w-5 h-5" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {loadingDuplicates && (
                    <div className="bg-[#010409] border border-[#30363d] rounded-xl p-6 font-mono text-xs text-[#c9d1d9] overflow-x-auto shadow-2xl relative">
                      <div className="flex items-center justify-between border-b border-[#30363d]/50 pb-3 mb-4">
                        <span className="text-[10px] uppercase font-bold text-[#8b949e] tracking-widest flex items-center gap-2">
                          <CircleDashed className="w-3.5 h-3.5 text-[#58a6ff] animate-spin" />
                          Live Scanner Terminal Output
                        </span>
                        <span className="text-[10px] text-[#58a6ff]">firstmate-cli --detect-duplicates</span>
                      </div>
                      <pre className="whitespace-pre-wrap leading-relaxed text-[#c9d1d9]/95 font-mono">{cliLogs}</pre>
                      <div className="flex items-center space-x-2 mt-4 pt-4 border-t border-[#30363d]/50 text-[#8b949e]">
                        <div className="w-2 h-2 bg-[#58a6ff] rounded-full animate-ping shrink-0"></div>
                        <span className="animate-pulse font-sans text-xs">
                          {cliLogs.includes('[3/4]')
                            ? "Cross-referencing matching candidates via Gemini LLM..."
                            : cliLogs.includes('Retrieved')
                            ? "Filtering issues & analyzing matching candidates..."
                            : cliLogs.includes('[2/4]')
                            ? "Executing Coral SQL query via Gemini CLI..."
                            : "Processing repository metadata..."}
                        </span>
                      </div>
                    </div>
                  )}

                  {errorDuplicates && (
                    <div className="bg-[#211214] border border-[#f85149]/40 rounded-xl p-8 text-center shadow-xl">
                      <AlertCircle className="w-10 h-10 text-[#f85149] mx-auto mb-3" />
                      <h3 className="text-white font-bold text-base mb-1">Analysis Workflow Interrupted</h3>
                      <p className="text-xs text-[#f85149]/80 max-w-md mx-auto leading-relaxed">{errorDuplicates}</p>
                    </div>
                  )}

                  {!loadingDuplicates && !errorDuplicates && (
                    <div className="space-y-6">
                      {duplicateIssues.length === 0 ? (
                        <div className="bg-[#161b22]/20 border border-[#30363d] rounded-xl p-12 text-center text-[#8b949e] shadow-inner">
                          <CheckCircle2 className="w-10 h-10 text-[#3fb950] mx-auto mb-3 opacity-80" />
                          <h4 className="text-white font-semibold text-sm">Perfect Health Status</h4>
                          <p className="text-xs text-[#8b949e] mt-1 max-w-sm mx-auto">
                            No potential duplicate issue candidates were detected in this repository. Good job!
                          </p>
                        </div>
                      ) : (
                        duplicateIssues.map((issue, idx) => {
                          const confPercent = Math.round(issue.confidence * 100);
                          const isHigh = issue.confidence >= 0.9;
                          const isMed = issue.confidence >= 0.75;
                          
                          // Styling tokens based on similarity
                          const themeColor = isHigh 
                            ? 'from-[#f0883e] to-[#8957e5]' 
                            : isMed 
                              ? 'from-[#d29922] to-[#f0883e]' 
                              : 'from-[#8957e5] to-[#58a6ff]';
                              
                          const badgeClass = isHigh
                            ? 'bg-[#3a1d1d] border-[#f85149]/50 text-[#ff7b72]'
                            : isMed
                              ? 'bg-[#2b2210] border-[#d29922]/50 text-[#e3b341]'
                              : 'bg-[#19152b] border-[#8957e5]/50 text-[#a371f7]';

                          return (
                            <div key={idx} className="bg-[#161b22]/30 border border-[#30363d] rounded-xl p-6 hover:border-[#8b949e] transition-all duration-300 shadow-xl relative overflow-hidden group animate-fadeIn">
                              {/* Background Visual Grid Accent */}
                              <div className="absolute inset-0 opacity-[0.01] pointer-events-none bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]"></div>
                              
                              {/* Pictorial Connection Diagram */}
                              <div className="grid grid-cols-1 lg:grid-cols-11 gap-4 items-center mb-5 relative">
                                
                                {/* Node 1: Duplicate Candidate (Left Box) */}
                                <div className="lg:col-span-4 bg-[#0d1117] border border-[#30363d] rounded-lg p-4 relative transition-colors">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#30363d]/50 text-[#8b949e] border border-[#30363d]">
                                      Candidate Node
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded bg-[#238636]/15 border border-[#2ea043]/30 text-[#3fb950] font-semibold font-mono text-[10px]">
                                      #{issue.duplicate_issue}
                                    </span>
                                  </div>
                                  <h4 className="text-sm font-semibold text-white leading-snug break-words">
                                    {issue.duplicate_title}
                                  </h4>
                                  <div className="flex items-center gap-1.5 mt-2.5 text-[10px] text-[#f0883e]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#f0883e] animate-pulse" />
                                    Flagged for duplicate scan
                                  </div>
                                </div>

                                {/* Bridge Connector (Middle Box) */}
                                <div className="lg:col-span-3 flex flex-col items-center justify-center py-2 px-1 relative">
                                  <span className={`px-3 py-1 rounded-full text-[11px] font-bold border uppercase tracking-wider ${badgeClass} shadow-md backdrop-blur-sm z-10 select-none animate-pulse`}>
                                    {confPercent}% Match
                                  </span>
                                  
                                  {/* Pictorial double sided arrow line with color gradient matching match severity */}
                                  <div className="w-full flex items-center justify-center my-3 relative h-6">
                                    <div className={`h-[2px] w-full bg-gradient-to-r ${themeColor} relative opacity-85`}>
                                      {/* Sliding matching signal indicator */}
                                      <div className="absolute top-[-3px] w-2 h-2 rounded-full bg-white shadow-[0_0_8px_#fff] animate-ping left-1/2 -translate-x-1/2"></div>
                                    </div>
                                    <ArrowRight className="w-3.5 h-3.5 text-[#8b949e] absolute right-0 translate-x-[2px]" />
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#30363d] absolute left-0 -translate-x-1/2" />
                                  </div>
                                  
                                  <span className="text-[9px] text-[#8b949e] text-center font-semibold">
                                    {isHigh ? 'CRITICAL OVERLAP' : isMed ? 'HIGH PROBABILITY' : 'POTENTIAL OVERLAP'}
                                  </span>
                                </div>

                                {/* Node 2: Master Reference Issue (Right Box) */}
                                <div className="lg:col-span-4 bg-[#0d1117] border border-[#30363d] rounded-lg p-4 relative">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#1f6feb]/10 text-[#58a6ff] border border-[#388bfd]/20">
                                      Master Reference
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded bg-[#238636]/15 border border-[#2ea043]/30 text-[#3fb950] font-semibold font-mono text-[10px]">
                                      #{issue.master_issue}
                                    </span>
                                  </div>
                                  <h4 className="text-sm font-semibold text-white leading-snug break-words">
                                    {issue.master_title || "Original Active Reference"}
                                  </h4>
                                  <div className="flex items-center gap-1.5 mt-2.5 text-[10px] text-[#58a6ff]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#58a6ff]" />
                                    Active master issue branch
                                  </div>
                                </div>
                              </div>

                              {/* Progress Similarity Visual Indicator */}
                              <div className="w-full bg-[#21262d] h-1.5 rounded-full overflow-hidden mb-4 border border-[#30363d]">
                                <div 
                                  className={`h-full bg-gradient-to-r ${themeColor} transition-all duration-500 rounded-full`}
                                  style={{ width: `${confPercent}%` }}
                                ></div>
                              </div>

                              {/* AI Reasoning Context Section */}
                              <div className="bg-[#0d1117]/80 border border-[#30363d] rounded-lg p-4 mb-4">
                                <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-white">
                                  <Bot className="w-4 h-4 text-[#a371f7]" />
                                  <span>Gemini AI Verification Logic & Reasoning</span>
                                </div>
                                <p className="text-xs text-[#8b949e] leading-relaxed break-words">
                                  {issue.reason}
                                </p>
                              </div>

                              {/* Action Options Panel */}
                              <div className="flex items-center justify-between gap-4 pt-2 border-t border-[#30363d]/50">
                                <span className="text-[10px] text-[#8b949e] font-medium flex items-center gap-1">
                                  <Ship className="w-3 h-3" />
                                  FirstMate automated triage pipeline
                                </span>
                                <div className="flex items-center gap-2">
                                  <button className="px-3 py-1.5 bg-[#21262d] border border-[#30363d] text-[#c9d1d9] text-xs font-semibold rounded-md hover:bg-[#30363d] hover:border-[#8b949e] transition-all flex items-center gap-1.5">
                                    <ArrowRight className="w-3.5 h-3.5 rotate-45" />
                                    Compare Detailed Diff
                                  </button>
                                  <button className="px-3 py-1.5 bg-[#3a1d1d]/80 border border-[#f85149]/30 text-[#ff7b72] text-xs font-semibold rounded-md hover:bg-[#f85149] hover:text-white transition-all">
                                    Close as Duplicate
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {/* Premium Issues Index Panel */}
                  {!loadingDuplicates && !errorDuplicates && openIssues.length > 0 && (
                    <div className="bg-[#161b22]/30 border border-[#30363d] rounded-xl p-6 shadow-xl animate-fadeIn">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#30363d] pb-4 mb-4">
                        <div>
                          <h3 className="text-base font-bold text-white flex items-center gap-2">
                            <ListTodo className="w-4 h-4 text-[#58a6ff]" />
                            All Scanned Open Issues ({openIssues.length})
                          </h3>
                          <p className="text-[11px] text-[#8b949e] mt-0.5">
                            Filter and inspect retrieved issues in active context
                          </p>
                        </div>
                        <div className="w-full sm:w-64 relative">
                          <Search className="w-3.5 h-3.5 text-[#8b949e] absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder="Filter by title, body, or #..."
                            value={issueSearchQuery}
                            onChange={(e) => setIssueSearchQuery(e.target.value)}
                            className="w-full bg-[#0d1117] border border-[#30363d] hover:border-[#8b949e] focus:border-[#388bfd] focus:outline-none rounded-md pl-9 pr-3 py-1.5 text-xs text-[#c9d1d9] placeholder-[#8b949e] transition-all"
                          />
                        </div>
                      </div>

                      <div className="overflow-x-auto w-full max-h-[400px] overflow-y-auto">
                        <table className="w-full border-collapse text-left text-xs table-fixed">
                          <thead>
                            <tr className="bg-[#161b22]/50 border-b border-[#30363d] text-[#8b949e] font-medium">
                              <th className="p-3 font-medium w-[12%]">Issue ID</th>
                              <th className="p-3 font-medium w-[58%]">Issue Title</th>
                              <th className="p-3 font-medium text-center w-[15%]">Triage Status</th>
                              <th className="p-3 font-medium text-right w-[15%]">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#30363d]/60">
                            {openIssues
                              .filter(issue => {
                                const term = issueSearchQuery.toLowerCase();
                                return (
                                  String(issue.number).includes(term) ||
                                  (issue.title || '').toLowerCase().includes(term) ||
                                  (issue.body || '').toLowerCase().includes(term)
                                );
                              })
                              .map((issue, idx) => {
                                // Check if this issue is part of duplicateIssues list
                                const isDup = duplicateIssues.some(d => d.duplicate_issue === issue.number || d.master_issue === issue.number);
                                return (
                                  <tr key={idx} className="hover:bg-[#161b22]/40 transition-colors">
                                    <td className="p-3 font-mono text-[#8b949e]">
                                      #{issue.number}
                                    </td>
                                    <td className="p-3 font-medium text-white truncate max-w-xs" title={issue.title}>
                                      {issue.title}
                                    </td>
                                    <td className="p-3 text-center">
                                      {isDup ? (
                                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#3a1d1d] border border-[#f85149]/40 text-[#ff7b72]">
                                          Duplicate Node
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#1f6feb]/10 border border-[#388bfd]/25 text-[#58a6ff]">
                                          Unique Issue
                                        </span>
                                      )}
                                    </td>
                                    <td className="p-3 text-right">
                                      <button 
                                        onClick={() => {
                                          setActiveTab('copilot');
                                          setInitialChatQuery(`Explain open issue #${issue.number}: ${issue.title}`);
                                        }}
                                        className="text-[10px] text-[#58a6ff] hover:underline font-semibold"
                                      >
                                        Ask Copilot
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'pr_status' && (
                <div className="space-y-4">
                  <div className="bg-[#161b22] border border-[#30363d] rounded-t-md p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <GitPullRequest className="w-5 h-5 text-[#58a6ff]" />
                      <div>
                        <span className="font-semibold text-white">Open Pull Requests</span>
                        <p className="text-[11px] text-[#8b949e] mt-0.5">
                          List of all active and pending pull requests retrieved from local Coral database
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setShouldRefreshPRs(true)}
                        disabled={loadingPRs}
                        className="text-[10px] bg-[#21262d] border border-[#30363d] text-[#c9d1d9] hover:bg-[#30363d] hover:border-[#8b949e] px-2.5 py-1.5 rounded-md font-semibold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50 select-none cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingPRs ? 'animate-spin' : ''}`} />
                        Sync Pull Requests
                      </button>
                      <span className="text-xs bg-[#161b22] border border-[#30363d] text-[#c9d1d9] px-2.5 py-1.5 rounded-md font-semibold">
                        {loadingPRs ? '...' : pullRequests.length} Open Pull Requests
                      </span>
                    </div>
                  </div>
                  
                  {loadingPRs ? (
                    <div className="bg-[#161b22]/30 border border-t-0 border-[#30363d] rounded-b-md -mt-4 p-8 flex flex-col items-center justify-center gap-3">
                      <CircleDashed className="w-8 h-8 text-[#58a6ff] animate-spin" />
                      <span className="text-xs text-[#8b949e] font-medium">Fetching open pull requests...</span>
                    </div>
                  ) : errorPRs ? (
                    <div className="bg-[#161b22]/30 border border-t-0 border-[#30363d] rounded-b-md -mt-4 p-6 text-center text-[#f85149] text-xs">
                      {errorPRs}
                    </div>
                  ) : pullRequests.length === 0 ? (
                    <div className="bg-[#161b22]/30 border border-t-0 border-[#30363d] rounded-b-md -mt-4 p-12 text-center text-xs text-[#8b949e]">
                      No open pull requests found in this repository.
                    </div>
                  ) : (
                    <div className="bg-[#0d1117] border border-t-0 border-[#30363d] rounded-b-md -mt-4 p-2 space-y-1">
                      {pullRequests.map((pr, idx) => {
                        const daysOld = Math.max(0, Math.floor((Date.now() - new Date(pr.created_at).getTime()) / (1000 * 60 * 60 * 24)));
                        let labelText = "Active";
                        let labelColor = "text-[#238636] border-[#238636]";

                        if (daysOld >= 14) {
                          labelText = `Stalled (${daysOld}d+)`;
                          labelColor = "text-[#f85149] border-[#f85149]";
                        } else if (daysOld >= 7) {
                          labelText = "Needs Review";
                          labelColor = "text-[#d29922] border-[#d29922]";
                        }

                        return (
                          <div key={idx} className="p-3 flex gap-3 hover:bg-[#1c2128] hover:shadow-lg hover:-translate-y-0.5 transform rounded-md transition-all duration-200 border border-transparent hover:border-[#424a53]">
                            <div className="mt-1">
                              <GitPullRequest className="w-5 h-5 text-[#238636]" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1 cursor-pointer">
                                <h3 className="text-white font-semibold text-base hover:text-[#58a6ff] transition-colors">{pr.title}</h3>
                                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold tracking-wide uppercase ${labelColor}`}>
                                  {labelText}
                                </span>
                              </div>
                              <div className="text-xs text-[#8b949e] flex items-center gap-2 mt-1">
                                <span className="text-[10px] bg-[#238636]/15 border border-[#2ea043]/30 text-[#3fb950] px-1.5 py-0.5 rounded font-mono font-semibold">
                                  #{pr.number}
                                </span>
                                <span>opened by <strong className="text-[#c9d1d9]">{pr.user__login}</strong> {daysOld} days ago</span>
                              </div>
                            </div>
                            <div className="flex items-start shrink-0">
                               <a 
                                 href={pr.html_url}
                                 target="_blank"
                                 rel="noopener noreferrer"
                                 className="px-3 py-1.5 bg-[#21262d] border border-[#30363d] text-[#c9d1d9] text-xs font-semibold rounded-md hover:bg-[#30363d] hover:border-[#8b949e] transition-all flex items-center gap-1"
                               >
                                 View PR
                               </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'release' && (
                <ReleaseNotesView owner={repoOwner} repo={repoName} />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
