import React from 'react';

// Enhanced renderer to handle Headers, Lists, and Code blocks
// Removes raw markdown symbols (*, #, ---) from output
export const MarkdownText: React.FC<{ content: string }> = ({ content }) => {
  // Split by code blocks first to preserve them
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="text-base break-words">
      {parts.map((part, index) => {
        // Handle Code Blocks
        if (part.startsWith('```')) {
          const match = part.match(/```(\w+)?\n([\s\S]*?)```/);
          const lang = match ? match[1] : '';
          const code = match ? match[2] : part.slice(3, -3);

          return (
            <div key={index} className="my-4 rounded-lg overflow-hidden border border-zinc-700 bg-zinc-950/50">
              {lang && (
                <div className="px-4 py-1.5 bg-zinc-800/50 text-zinc-400 text-xs font-mono border-b border-zinc-700 flex justify-between">
                  <span>{lang}</span>
                </div>
              )}
              <div className="p-4 overflow-x-auto">
                <code className="font-mono text-sm text-zinc-300 whitespace-pre">
                  {code}
                </code>
              </div>
            </div>
          );
        }

        // Process regular text (Headers, Lists, Bold, HR)
        return (
          <div key={index} className="whitespace-pre-wrap">
             {renderMarkdownText(part)}
          </div>
        );
      })}
    </div>
  );
};

// Helper to process line-by-line formatting
function renderMarkdownText(text: string) {
  const lines = text.split('\n');
  const renderedLines: React.ReactNode[] = [];
  let inList = false;

  lines.forEach((line, i) => {
    // Horizontal Rule
    if (line.match(/^---$/) || line.match(/^\*\*\*$/)) {
      renderedLines.push(<hr key={i} className="my-4 border-zinc-700" />);
      return;
    }

    // Headers
    const h1 = line.match(/^#\s+(.*)/);
    if (h1) {
      renderedLines.push(<h1 key={i} className="text-xl font-bold text-white mt-6 mb-3">{parseInline(h1[1])}</h1>);
      return;
    }
    const h2 = line.match(/^##\s+(.*)/);
    if (h2) {
      renderedLines.push(<h2 key={i} className="text-lg font-bold text-zinc-100 mt-5 mb-2">{parseInline(h2[1])}</h2>);
      return;
    }
    const h3 = line.match(/^###\s+(.*)/);
    if (h3) {
      renderedLines.push(<h3 key={i} className="text-base font-semibold text-zinc-200 mt-4 mb-2">{parseInline(h3[1])}</h3>);
      return;
    }

    // Unordered Lists
    const listMatch = line.match(/^[\*\-]\s+(.*)/);
    if (listMatch) {
      // Logic could be improved for nested lists, but this handles basic bullets
      renderedLines.push(
        <div key={i} className="flex gap-2 ml-1 mb-1">
          <span className="text-zinc-500 mt-1.5">•</span>
          <span className="text-zinc-200">{parseInline(listMatch[1])}</span>
        </div>
      );
      inList = true;
      return;
    }
    
    // Ordered Lists
    const orderedListMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (orderedListMatch) {
      renderedLines.push(
        <div key={i} className="flex gap-2 ml-1 mb-1">
           <span className="text-zinc-500 font-mono text-sm mt-0.5">{orderedListMatch[1]}.</span>
           <span className="text-zinc-200">{parseInline(orderedListMatch[2])}</span>
        </div>
      );
      return;
    }

    // Plain text (with potential inline formatting)
    // If line is empty, render a break, unless we are accumulating paragraphs
    if (line.trim() === '') {
       renderedLines.push(<div key={i} className="h-2" />); // small spacer
    } else {
       renderedLines.push(
         <p key={i} className={`mb-1 ${inList ? 'ml-4' : ''} text-zinc-300`}>
           {parseInline(line)}
         </p>
       );
       inList = false;
    }
  });

  return renderedLines;
}

// Helper to parse **bold** and `code` inside lines
function parseInline(text: string): React.ReactNode {
  // We split by standard markdown inline tokens
  // Order matters slightly.
  // This is a naive parser but sufficient for "minimalist" requirements without huge libraries.
  
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  
  return parts.map((part, index) => {
    // Bold
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    }
    // Inline Code
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={index} className="bg-zinc-800 text-zinc-200 px-1 py-0.5 rounded font-mono text-sm border border-zinc-700/50">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}