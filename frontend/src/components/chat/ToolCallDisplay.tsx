import { useState } from 'react';
import type { ToolCall } from '../../hooks/useChatStream';

interface ToolCallDisplayProps {
  tool: ToolCall;
}

export default function ToolCallDisplay({ tool }: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="my-1.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
      >
        <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-mono">{tool.name}</span>
        {tool.result && <span className="text-green-600 dark:text-green-400">done</span>}
        {!tool.result && <span className="animate-pulse">running...</span>}
      </button>
      {expanded && (
        <div className="mt-1 ml-4 text-xs font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 max-h-40 overflow-auto">
          <div className="text-gray-400 mb-1">Input:</div>
          <pre className="whitespace-pre-wrap text-gray-600 dark:text-gray-400">{JSON.stringify(tool.input, null, 2)}</pre>
          {tool.result && (
            <>
              <div className="text-gray-400 mt-2 mb-1">Result:</div>
              <pre className="whitespace-pre-wrap text-gray-600 dark:text-gray-400">{tool.result}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
