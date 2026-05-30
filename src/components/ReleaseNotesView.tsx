import React, { useState, useEffect } from 'react';
import Markdown from 'react-markdown';
import { Loader2, Copy, Check, AlertCircle, FileText, RefreshCw, GitPullRequest, FileDown } from 'lucide-react';

interface ReleaseNotesViewProps {
  owner?: string;
  repo?: string;
}

export default function ReleaseNotesView({ owner = 'flutter', repo = 'flutter' }: ReleaseNotesViewProps) {
  const [error, setError] = useState<string | null>(null);
  const [mergedPRsCount, setMergedPRsCount] = useState<number | null>(null);
  const [isRefetching, setIsRefetching] = useState(false);

  // Per-PR Release Notes States
  const [mergedPRs, setMergedPRs] = useState<any[]>([]);
  const [generatingPrNumber, setGeneratingPrNumber] = useState<number | null>(null);
  const [prNotes, setPrNotes] = useState<{ [key: number]: string }>({});
  const [copiedPrNumber, setCopiedPrNumber] = useState<number | null>(null);

  // Fetch real merged pull requests when owner or repo shifts
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
          setMergedPRs(data.pull_requests || []);
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
        setMergedPRs(prData.pull_requests || []);
      }
    } catch (err: any) {
      console.error('Failed to refetch:', err);
      setError('Refetch failed. Please try again.');
    } finally {
      setIsRefetching(false);
    }
  };

  const handleGenerateForPR = async (pr: any) => {
    setGeneratingPrNumber(pr.number);
    setError(null);
    try {
      const prompt = `You are a senior software release engineer drafting a highly professional, technically precise, substantive release note entry for a single merged pull request.

Pull Request: PR #${pr.number}
Title: "${pr.title}"
Author: @${pr.user__login}

Please generate a single, highly detailed and substantive long paragraph (4-6 sentences) explaining the technical changes introduced by this pull request, how it works under the hood, and the absolute impact on the system. Be extremely specific and technical.

CRITICAL STYLE GUIDELINES:
1. STRICTLY NO SYMBOLS OR EMOJIS: Absolutely no emojis or non-standard icons (e.g. no 🚀, 🐛, 👥, star, checkmark, etc.). Use only standard alphanumeric text and markdown formatting.
2. NO MARKETING HYP OR FLOWERY LANGUAGE: Avoid grandiose claims, hyperbole, and fluff. Keep the tone strictly technical, objective, and business-focused.
3. Output ONLY the drafted paragraph note itself. Do not add any headings, titles, lists, or meta-commentary.`;

      const response = await fetch('http://localhost:3001/ai/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: prompt })
      });

      const data = await response.json();
      if (data.success) {
        setPrNotes(prev => ({
          ...prev,
          [pr.number]: data.response
        }));
      } else {
        throw new Error(data.error || 'Server error occurred');
      }
    } catch (err: any) {
      console.error(err);
      setError(`Failed to generate release notes for PR #${pr.number}: ${err.message}`);
    } finally {
      setGeneratingPrNumber(null);
    }
  };

  const handleCopyPrNote = (prNumber: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPrNumber(prNumber);
    setTimeout(() => setCopiedPrNumber(null), 3000);
  };

  const handleExportPDF = (title: string, content: string) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    let htmlContent = content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.*?)`/g, '<code style="background-color: rgba(175,184,193,0.2); padding: 2px 5px; border-radius: 6px; font-family: monospace;">$1</code>');

    htmlContent = `<p style="line-height: 1.6; font-size: 14px; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Helvetica, Arial, sans-serif; color: #24292f; margin-bottom: 16px;">${htmlContent}</p>`;

    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
              padding: 40px;
              color: #24292f;
              max-width: 800px;
              margin: 0 auto;
            }
            h1 {
              font-weight: 600;
              margin: 0; 
              font-size: 20px; 
              color: #24292f;
            }
            code {
              font-size: 85%;
            }
            @media print {
              body {
                padding: 20px;
              }
              .print-btn {
                display: none !important;
              }
            }
          </style>
        </head>
        <body>
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #d0d7de; padding-bottom: 16px; margin-bottom: 24px;">
            <div>
              <h1>${title}</h1>
              <p style="margin: 4px 0 0 0; font-size: 11px; color: #57606a;">Drafted by FirstMate AI Copilot</p>
            </div>
            <button class="print-btn" onclick="window.print()" style="background-color: #2da042; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 14px;">Print / Save as PDF</button>
          </div>
          <div>
            ${htmlContent}
          </div>
          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
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
              Draft comprehensive long-paragraph release changelogs for individual merged pull requests in {owner}/{repo}
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
            title="Refetch Merged PRs"
          >
            <RefreshCw className={`w-3 h-3 ${isRefetching ? 'animate-spin text-[#58a6ff]' : 'text-[#8b949e]'}`} />
            Sync
          </button>
          <span className="text-[10px] bg-[#1f6feb]/15 border border-[#388bfd]/30 text-[#58a6ff] px-2.5 py-1 rounded-md font-semibold font-mono">
            AI Engine Active
          </span>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-[#211214] border border-[#f85149] rounded-md text-[#f85149] text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      {/* Full-width Workspace Layout */}
      <div className="bg-[#0d1117] border border-[#30363d] rounded-md p-4">
        <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
          <GitPullRequest className="w-4 h-4 text-[#238636]" />
          Draft Individual Pull Request Notes
        </h3>
        
        {mergedPRs.length === 0 ? (
          <div className="text-center py-8 text-[#8b949e] text-xs">
            No recent closed or merged pull requests found.
          </div>
        ) : (
          <div className="divide-y divide-[#30363d] max-h-[600px] overflow-y-auto pr-1">
            {mergedPRs.map((pr) => {
              const hasPrNote = !!prNotes[pr.number];
              const isPrGenerating = generatingPrNumber === pr.number;
              const isPrCopied = copiedPrNumber === pr.number;
              
              return (
                <div key={pr.number} className="py-4 first:pt-0 last:pb-0 flex flex-col space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h4 className="text-white font-semibold text-sm hover:text-[#58a6ff] transition-colors">
                        {pr.title}
                      </h4>
                      <div className="text-xs text-[#8b949e] mt-1 flex items-center gap-2">
                        <span className="text-[10px] bg-[#238636]/15 border border-[#2ea043]/30 text-[#3fb950] px-1.5 py-0.5 rounded font-mono font-semibold">
                          #{pr.number}
                        </span>
                        <span>merged by <strong className="text-[#c9d1d9]">@{pr.user__login}</strong></span>
                        {pr.merged_at && (
                          <span className="text-[10px]">
                            on {new Date(pr.merged_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <button
                      onClick={() => handleGenerateForPR(pr)}
                      disabled={isPrGenerating || generatingPrNumber !== null}
                      className="bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-white text-xs font-semibold py-1.5 px-3 rounded-md transition-colors flex items-center justify-center shrink-0 disabled:opacity-50"
                    >
                      {isPrGenerating ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-1 animate-spin text-[#58a6ff]" />
                          Drafting...
                        </>
                      ) : hasPrNote ? (
                        'Re-draft Note'
                      ) : (
                        'Draft AI Note'
                      )}
                    </button>
                  </div>

                  {/* Display generated note for this single PR */}
                  {hasPrNote && (
                    <div className="bg-[#161b22] border border-[#30363d] rounded-md p-3.5 relative animate-fadeIn">
                      <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
                        <button
                          onClick={() => handleExportPDF(`PR #${pr.number} Release Note`, prNotes[pr.number])}
                          className="p-1 bg-[#21262d] border border-[#30363d] text-[#c9d1d9] rounded hover:bg-[#30363d] hover:border-[#8b949e] transition-colors"
                          title="Export PDF"
                        >
                          <FileDown className="w-3.5 h-3.5 text-[#58a6ff]" />
                        </button>
                        <button
                          onClick={() => handleCopyPrNote(pr.number, prNotes[pr.number])}
                          className="p-1 bg-[#21262d] border border-[#30363d] text-[#c9d1d9] rounded hover:bg-[#30363d] hover:border-[#8b949e] transition-colors"
                          title="Copy Markdown"
                        >
                          {isPrCopied ? <Check className="w-3.5 h-3.5 text-[#3fb950]" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <div className="text-xs text-[#c9d1d9] prose prose-invert max-w-none font-sans leading-relaxed pr-16">
                        <Markdown>{prNotes[pr.number]}</Markdown>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Toast Notifications */}
      <div 
        className={`fixed bottom-6 right-6 bg-[#238636] text-white text-sm py-3 px-4 rounded-md shadow-lg border border-[rgba(240,246,252,0.1)] transition-all duration-300 ${copiedPrNumber !== null ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'}`}
      >
        <div className="flex items-center gap-2">
          <Check className="w-4 h-4" />
          PR Release Note copied to clipboard!
        </div>
      </div>
    </div>
  );
}
