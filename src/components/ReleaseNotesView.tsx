import React, { useState, useEffect } from 'react';
import Markdown from 'react-markdown';
import { Loader2, Copy, Check, AlertCircle, FileText, Tag, RefreshCw } from 'lucide-react';

interface ReleaseNotesViewProps {
  owner?: string;
  repo?: string;
}

export default function ReleaseNotesView({ owner = 'flutter', repo = 'flutter' }: ReleaseNotesViewProps) {
  const [version, setVersion] = useState('v1.3.0');
  const [releases, setReleases] = useState<any[]>([]);
  const [isLoadingReleases, setIsLoadingReleases] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notesGenerated, setNotesGenerated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mergedPRsCount, setMergedPRsCount] = useState<number | null>(null);
  const [isRefetching, setIsRefetching] = useState(false);

  // Fetch real releases when owner or repo shifts
  useEffect(() => {
    let isCancelled = false;
    const fetchReleases = async () => {
      setIsLoadingReleases(true);
      setError(null);
      try {
        const response = await fetch('http://localhost:3001/repos/releases', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ owner, repo })
        });
        const data = await response.json();
        if (!isCancelled && data.success) {
          const fetchedReleases = data.releases || [];
          setReleases(fetchedReleases);
          if (fetchedReleases.length > 0) {
            setVersion(fetchedReleases[0].tag_name);
          } else {
            setVersion('v1.0.0');
          }
        }
      } catch (err) {
        console.error('Failed to fetch releases:', err);
      } finally {
        if (!isCancelled) {
          setIsLoadingReleases(false);
        }
      }
    };
    fetchReleases();
    return () => {
      isCancelled = true;
    };
  }, [owner, repo]);

  // Fetch real merged pull requests count when owner or repo shifts
  useEffect(() => {
    let isCancelled = false;
    const fetchMergedPRs = async () => {
      try {
        const response = await fetch('http://localhost:3001/repos/merged-prs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ owner, repo })
        });
        const data = await response.json();
        if (!isCancelled && data.success) {
          setMergedPRsCount(data.pull_requests ? data.pull_requests.length : 0);
        }
      } catch (err) {
        console.error('Failed to fetch merged PRs count:', err);
      }
    };
    fetchMergedPRs();
    return () => {
      isCancelled = true;
    };
  }, [owner, repo]);

  const handleRefetch = async () => {
    setIsRefetching(true);
    setError(null);
    try {
      // 1. Fetch releases
      const relResponse = await fetch('http://localhost:3001/repos/releases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ owner, repo })
      });
      const relData = await relResponse.json();
      if (relData.success) {
        setReleases(relData.releases || []);
        if (relData.releases && relData.releases.length > 0) {
          setVersion(relData.releases[0].tag_name);
        }
      }

      // 2. Fetch merged PRs count
      const prResponse = await fetch('http://localhost:3001/repos/merged-prs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ owner, repo })
      });
      const prData = await prResponse.json();
      if (prData.success) {
        setMergedPRsCount(prData.pull_requests ? prData.pull_requests.length : 0);
      }
    } catch (err: any) {
      console.error('Failed to refetch:', err);
      setError('Refetch failed. Please try again.');
    } finally {
      setIsRefetching(false);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setNotesGenerated(false);
    setError(null);
    try {
      // 1. Fetch real commits from the backend
      const commitsResponse = await fetch('http://localhost:3001/repos/commits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ owner, repo, limit: 40 })
      });
      const commitsData = await commitsResponse.json();
      const commits = commitsData.success ? commitsData.commits || [] : [];

      if (commits.length === 0) {
        throw new Error('No recent merged commits or pull requests found in the database for this repository.');
      }

      // 2. Format commits for the Gemini system prompt
      const commitListStr = commits
        .map((c: any) => `- ${c.commit__message.split('\n')[0]} (by ${c.commit__author__name})`)
        .join('\n');

      const prompt = `Draft the release notes for version ${version} of the project ${owner}/${repo}. Here are the merged commits in this release boundary:
${commitListStr}

Please classify these changes dynamically into:
- 🚀 Features
- 🐛 Bug Fixes
- 👥 Contributors
In premium GitHub Markdown format. Make the tone highly professional, clean, and inspiring. Do not refer to the instructions or prompt boundaries explicitly.`;

      const response = await fetch('http://localhost:3001/ai/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: prompt })
      });

      const data = await response.json();
      if (data.success) {
        setNotes(data.response);
        setNotesGenerated(true);
      } else {
        throw new Error(data.error || 'Server error occurred');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to generate release notes.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(notes);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="flex flex-col h-full relative space-y-4">
      {/* Header matching GitHub box headers */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-t-md p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#58a6ff]" />
          <div>
            <span className="font-semibold text-white text-sm">Release Notes Generator</span>
            <p className="text-[10px] text-[#8b949e] mt-0.5">
              Draft official release changelogs using real merged commits from {owner}/{repo}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {mergedPRsCount !== null && (
            <span className="text-[10px] bg-[#238636]/15 border border-[#2ea043]/30 text-[#3fb950] px-2.5 py-1 rounded-md font-semibold font-mono">
              {mergedPRsCount} Merged PRs
            </span>
          )}
          <button
            onClick={handleRefetch}
            disabled={isRefetching}
            className="p-1.5 bg-[#21262d] border border-[#30363d] text-[#c9d1d9] rounded-md hover:bg-[#30363d] hover:border-[#8b949e] transition-all flex items-center gap-1.5 text-[10px] font-semibold disabled:opacity-50"
            title="Refetch Merged PRs & Releases"
          >
            <RefreshCw className={`w-3 h-3 ${isRefetching ? 'animate-spin text-[#58a6ff]' : 'text-[#8b949e]'}`} />
            Sync
          </button>
          <span className="text-[10px] bg-[#1f6feb]/15 border border-[#388bfd]/30 text-[#58a6ff] px-2.5 py-1 rounded-md font-semibold font-mono">
            AI Engine Active
          </span>
        </div>
      </div>

      <div className="bg-[#0d1117] border border-t-0 border-[#30363d] rounded-b-md p-6 -mt-4 text-[#c9d1d9]">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex flex-col space-y-2 flex-1">
            <div className="flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-[#8b949e]" />
              <label className="text-sm font-semibold text-[#c9d1d9]">Target Version Tag</label>
              {isLoadingReleases && <Loader2 className="w-3 h-3 animate-spin text-[#58a6ff]" />}
            </div>
            
            <div className="relative">
              {releases.length > 0 ? (
                <>
                  <select 
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    className="w-full appearance-none bg-[#0d1117] border border-[#30363d] text-[#c9d1d9] text-sm rounded-md pr-10 pl-3 py-1.5 focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff] transition-colors"
                    style={{ WebkitAppearance: 'none', MozAppearance: 'none' }}
                  >
                    {releases.map((rel, idx) => (
                      <option key={idx} value={rel.tag_name}>
                        {rel.tag_name} - {rel.name || 'Release'}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-[#8b949e]">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </>
              ) : (
                <input 
                  type="text" 
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="e.g. v1.3.0"
                  className="w-full bg-[#0d1117] border border-[#30363d] text-[#c9d1d9] text-sm rounded-md px-3 py-1.5 focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff] transition-colors font-mono"
                />
              )}
            </div>
          </div>
          
          <button 
            onClick={handleGenerate}
            disabled={loading || isLoadingReleases}
            className="bg-[#238636] hover:bg-[#2ea043] text-white text-sm font-medium py-1.5 px-4 rounded-md transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed border border-[rgba(240,246,252,0.1)] shrink-0"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing Commits...
              </>
            ) : (
              'Generate Release Notes'
            )}
          </button>
        </div>
        
        {error && (
          <div className="mt-4 p-4 bg-[#211214] border border-[#f85149] rounded-md text-[#f85149] text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        {loading && (
          <div className="mt-8 flex flex-col items-center justify-center text-[#8b949e] py-12">
            <RefreshCw className="w-8 h-8 mb-4 animate-spin text-[#58a6ff]" />
            <p className="text-sm font-medium">Gemini analyzing merged database commits...</p>
            <p className="text-[11px] text-[#8b949e] mt-1">Classifying additions, fixes, and author footprints</p>
          </div>
        )}
      </div>

      {notesGenerated && !loading && (
        <div className="bg-[#0d1117] border border-[#30363d] rounded-md overflow-hidden relative animate-fadeIn">
           <div className="bg-[#161b22] border-b border-[#30363d] p-3 flex justify-between items-center text-sm font-semibold text-[#c9d1d9]">
             <span>Changelog Preview ({version})</span>
             <button 
               onClick={handleCopy}
               className="p-1.5 bg-[#21262d] border border-[#f0f6fc1a] text-[#c9d1d9] rounded-md hover:bg-[#30363d] hover:border-[#8b949e] transition-colors"
               title="Copy Markdown"
             >
               {copied ? <Check className="w-4 h-4 text-[#3fb950]" /> : <Copy className="w-4 h-4" />}
             </button>
           </div>
           <div className="p-6">
            <div className="[&>h2]:text-[1.5em] [&>h2]:font-semibold [&>h2]:text-[#c9d1d9] [&>h2]:mt-6 [&>h2]:mb-4 [&>h2]:border-b [&>h2]:border-[#21262d] [&>h2]:pb-2 [&>h2:first-child]:mt-0 [&>ul]:list-disc [&>ul]:ml-6 [&>ul]:mb-4 [&>ul>li]:text-[#c9d1d9] [&>ul>li]:mb-1 [&>ul>li>strong]:text-white [&>ul>li>strong]:font-semibold">
              <Markdown>{notes}</Markdown>
            </div>
           </div>
        </div>
      )}

      {/* Snackbar / Toast */}
      <div 
        className={`fixed bottom-6 right-6 bg-[#238636] text-white text-sm py-3 px-4 rounded-md shadow-lg border border-[rgba(240,246,252,0.1)] transition-all duration-300 ${copied ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'}`}
      >
        <div className="flex items-center gap-2">
          <Check className="w-4 h-4" />
          Markdown copied to clipboard!
        </div>
      </div>
    </div>
  );
}
