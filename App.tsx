import React, { useState, useRef, useEffect } from 'react';
import { MODEL_IDS, Icons } from './constants';
import { Message, Role, ChatSession } from './types';
import { streamCompletion } from './services/zhipuService';
import { MarkdownText } from './components/MarkdownText';

const App = () => {
  // State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isThinkingEnabled, setIsThinkingEnabled] = useState(false);

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [globalSystemPrompt, setGlobalSystemPrompt] = useState(''); // Global Prompt
  
  // Session Specific Prompt State
  const [sessionPrompt, setSessionPrompt] = useState(''); // Current Session Prompt
  const [isSessionPromptOpen, setIsSessionPromptOpen] = useState(false);

  // UI State
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sessionPromptRef = useRef<HTMLDivElement>(null);

  // Theme Logic
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  // Close session prompt popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sessionPromptRef.current && !sessionPromptRef.current.contains(event.target as Node)) {
        setIsSessionPromptOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  // Sync messages and session prompt to active session in history
  useEffect(() => {
    if (activeSessionId) {
      setSessions(prev => prev.map(session => 
        session.id === activeSessionId 
          ? { 
              ...session, 
              messages: messages, 
              systemPrompt: sessionPrompt, // Save session prompt to history
              title: messages.length > 0 ? (session.title === '新对话' ? messages[0].content.substring(0, 30) : session.title) : '新对话'
            }
          : session
      ));
    }
  }, [messages, activeSessionId, sessionPrompt]);

  const createNewSession = (initialMsg?: Message) => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: initialMsg ? initialMsg.content.substring(0, 30) : '新对话',
      messages: initialMsg ? [initialMsg] : [],
      createdAt: Date.now(),
      systemPrompt: '' // Reset session prompt for new chat
    };
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setMessages(newSession.messages);
    setSessionPrompt(''); // Reset input
    return newSession;
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: Role.User,
      content: input,
      timestamp: Date.now()
    };

    // Update UI immediately
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setIsLoading(true);

    // Handle History Logic
    let currentHistory = messages;
    let currentSessionId = activeSessionId;

    if (!currentSessionId) {
      // Create session implicitly if sending first message
      const session = createNewSession(userMsg);
      currentHistory = [userMsg];
      currentSessionId = session.id;
    } else {
      setMessages(prev => [...prev, userMsg]);
      currentHistory = [...messages, userMsg];
    }

    // Prepare API Messages
    // Logic: Combine Global Prompt + Session Prompt into System Messages
    let apiMessages = [...currentHistory];
    
    // Construct combined system prompt
    let finalSystemPrompt = "";
    if (globalSystemPrompt.trim()) {
      finalSystemPrompt += globalSystemPrompt;
    }
    if (sessionPrompt.trim()) {
      if (finalSystemPrompt) finalSystemPrompt += "\n\n";
      finalSystemPrompt += sessionPrompt;
    }

    if (finalSystemPrompt.trim()) {
       apiMessages = [
        { id: 'system', role: Role.System, content: finalSystemPrompt, timestamp: Date.now() },
        ...apiMessages
      ];
    }

    // Placeholder for AI response
    const aiMsgId = (Date.now() + 1).toString();
    const aiMsg: Message = {
      id: aiMsgId,
      role: Role.Assistant,
      content: '', 
      reasoning: '', 
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, aiMsg]);

    const modelId = isThinkingEnabled ? MODEL_IDS.THINKING : MODEL_IDS.DEFAULT;

    try {
      const stream = streamCompletion(apiMessages, modelId);

      for await (const chunk of stream) {
        setMessages(prev => 
          prev.map(msg => 
            msg.id === aiMsgId 
              ? { 
                  ...msg, 
                  content: msg.content + chunk.content,
                  reasoning: (msg.reasoning || '') + chunk.reasoning
                }
              : msg
          )
        );
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => 
        prev.map(msg => 
          msg.id === aiMsgId 
            ? { ...msg, content: msg.content + "\n\n**错误:** 生成响应失败，请检查网络。" }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setInput('');
    setSessionPrompt('');
    setIsMobileSidebarOpen(false); 
    if (window.innerWidth >= 1024) setIsDesktopSidebarOpen(true);
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const loadSession = (session: ChatSession) => {
    setActiveSessionId(session.id);
    setMessages(session.messages);
    setSessionPrompt(session.systemPrompt || '');
    setIsMobileSidebarOpen(false);
  };

  const toggleSidebar = () => {
    if (window.innerWidth >= 1024) {
      setIsDesktopSidebarOpen(!isDesktopSidebarOpen);
    } else {
      setIsMobileSidebarOpen(!isMobileSidebarOpen);
    }
  };

  return (
    <div className="flex h-screen bg-background text-primary overflow-hidden font-sans transition-colors duration-300">
      
      {/* Settings Modal (Global) */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Icons.Settings className="w-5 h-5" />
                系统设置
              </h3>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="p-1 hover:bg-surfaceHighlight rounded-lg transition-colors text-secondary hover:text-primary"
              >
                <Icons.Close className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Theme Toggle */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-secondary uppercase tracking-wider">外观</label>
                <div className="grid grid-cols-2 gap-2 bg-surfaceHighlight/50 p-1 rounded-lg border border-border">
                  <button
                    onClick={() => setTheme('light')}
                    className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${theme === 'light' ? 'bg-white text-black shadow-sm' : 'text-secondary hover:text-primary'}`}
                  >
                    <Icons.Sun className="w-4 h-4" />
                    浅色
                  </button>
                  <button
                    onClick={() => setTheme('dark')}
                    className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${theme === 'dark' ? 'bg-zinc-700 text-white shadow-sm' : 'text-secondary hover:text-primary'}`}
                  >
                    <Icons.Moon className="w-4 h-4" />
                    深色
                  </button>
                </div>
              </div>

              {/* Global System Prompt */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-secondary uppercase tracking-wider">全局系统提示词</label>
                  <span className="text-xs text-secondary bg-surfaceHighlight px-2 py-0.5 rounded">所有对话生效</span>
                </div>
                <textarea 
                  value={globalSystemPrompt}
                  onChange={(e) => setGlobalSystemPrompt(e.target.value)}
                  placeholder="例如：你是一个专业的Python程序员..."
                  className="w-full bg-surfaceHighlight border-border border rounded-lg p-3 text-sm focus:ring-1 focus:ring-secondary outline-none min-h-[120px] resize-none placeholder-zinc-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-30
        bg-surface transform transition-all duration-300 ease-in-out border-r border-border flex flex-col
        ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${isDesktopSidebarOpen ? 'lg:w-64' : 'lg:w-0 lg:border-r-0 lg:overflow-hidden'}
        w-64
      `}>
        <div className="p-4 flex flex-col h-full min-w-[16rem]">
          <button 
            onClick={handleNewChat}
            className="flex items-center gap-2 px-4 py-3 bg-surfaceHighlight hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-primary rounded-lg text-sm font-medium transition-colors border border-transparent shadow-sm"
          >
            <Icons.Plus className="w-4 h-4" />
            新对话
          </button>

          <div className="flex-1 mt-6 overflow-y-auto">
            <div className="px-2 text-xs font-medium text-secondary mb-2">历史记录</div>
             {sessions.length === 0 && (
               <div className="px-2 text-xs text-secondary italic">暂无历史记录</div>
             )}
             {sessions.map(session => (
                <div 
                  key={session.id}
                  onClick={() => loadSession(session)}
                  className={`
                    px-3 py-3 mb-1 text-sm rounded cursor-pointer truncate transition-colors
                    ${activeSessionId === session.id ? 'bg-surfaceHighlight text-primary' : 'text-secondary hover:text-primary hover:bg-surfaceHighlight/50'}
                  `}
                >
                  {session.title || '未命名对话'}
                </div>
             ))}
          </div>

          <div className="mt-auto border-t border-border pt-4">
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-3 px-2 py-2 w-full hover:bg-surfaceHighlight rounded-lg transition-colors group"
            >
              <div className="w-8 h-8 rounded-full bg-surfaceHighlight flex items-center justify-center border border-border group-hover:bg-zinc-200 dark:group-hover:bg-zinc-700 transition-colors">
                <Icons.Settings className="w-5 h-5 text-secondary group-hover:text-primary" />
              </div>
              <div className="text-sm font-medium text-secondary group-hover:text-primary">系统设置</div>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative w-full h-full min-w-0">
        {/* Header - Transparent overlay with toggle */}
        <header className="absolute top-0 left-0 right-0 z-10 h-14 flex items-center px-4 pointer-events-none">
          <button 
            onClick={toggleSidebar}
            className="pointer-events-auto p-2 hover:bg-surfaceHighlight rounded-md text-secondary transition-colors"
            title="切换侧边栏"
          >
            <Icons.SidebarLeft className="w-5 h-5" />
          </button>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto scroll-smooth pt-14">
          <div className="max-w-3xl mx-auto px-4 py-4 space-y-6">
            
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 animate-fadeIn">
                <div className="w-20 h-20 bg-surfaceHighlight rounded-2xl flex items-center justify-center shadow-lg ring-1 ring-border">
                   <Icons.Bot className="w-10 h-10 text-primary" />
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-primary">今天有什么可以帮您？</h1>
                {(globalSystemPrompt || sessionPrompt) && (
                   <div className="flex flex-col gap-1 items-center">
                     {globalSystemPrompt && (
                       <div className="bg-surfaceHighlight/50 px-3 py-1 rounded-md border border-border max-w-sm">
                          <p className="text-xs text-secondary font-mono">全局提示词已启用</p>
                       </div>
                     )}
                     {sessionPrompt && (
                       <div className="bg-indigo-500/10 px-3 py-1 rounded-md border border-indigo-500/20 max-w-sm">
                          <p className="text-xs text-indigo-500 font-mono">对话提示词已启用</p>
                       </div>
                     )}
                   </div>
                )}
              </div>
            )}

            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`group flex gap-4 ${msg.role === Role.User ? 'flex-row-reverse' : ''}`}
              >
                {/* Avatar */}
                <div className={`
                  w-8 h-8 rounded-full flex items-center justify-center shrink-0 border border-border mt-1
                  ${msg.role === Role.User ? 'bg-secondary/20 text-secondary' : 'bg-emerald-600/20 text-emerald-500'}
                `}>
                  {msg.role === Role.User ? <Icons.User className="w-5 h-5 opacity-80" /> : <Icons.Bot className="w-5 h-5" />}
                </div>

                {/* Bubble */}
                <div className={`
                  relative max-w-[85%] lg:max-w-[75%]
                  ${msg.role === Role.User ? 'bg-surfaceHighlight text-primary rounded-2xl rounded-tr-sm px-5 py-3.5 shadow-sm' : ''}
                `}>
                   {msg.role === Role.Assistant && (
                     <div className="flex flex-col gap-2">
                       {/* Thinking Block */}
                       {msg.reasoning && (
                         <details open className="mb-2 rounded-lg border border-indigo-500/20 bg-indigo-500/5 overflow-hidden">
                           <summary className="px-3 py-2 text-xs font-medium text-indigo-400 cursor-pointer hover:bg-indigo-500/10 transition-colors flex items-center gap-2 select-none">
                             <Icons.Brain className="w-3 h-3" />
                             思考过程
                           </summary>
                           <div className="px-3 py-2 text-xs text-indigo-400/80 font-mono whitespace-pre-wrap leading-relaxed border-t border-indigo-500/10">
                             {msg.reasoning}
                           </div>
                         </details>
                       )}
                       
                       {/* Main Content */}
                       <div className="text-primary leading-relaxed min-w-[200px]">
                          <MarkdownText content={msg.content} />
                       </div>
                     </div>
                   )}

                   {msg.role === Role.User && (
                     <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                   )}
                </div>
              </div>
            ))}
            
            {/* Loading Indicator */}
            {isLoading && messages[messages.length - 1]?.role === Role.User && (
               <div className="flex gap-4">
                 <div className="w-8 h-8 rounded-full bg-emerald-600/20 text-emerald-500 flex items-center justify-center shrink-0 border border-border">
                    <Icons.Bot className="w-5 h-5" />
                 </div>
                 <div className="flex items-center gap-1 h-8 px-2">
                   <div className="w-2 h-2 bg-secondary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                   <div className="w-2 h-2 bg-secondary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                   <div className="w-2 h-2 bg-secondary rounded-full animate-bounce"></div>
                 </div>
               </div>
            )}
            
            <div ref={messagesEndRef} className="h-4" />
          </div>
        </div>

        {/* Input Area */}
        <div className="p-4 bg-background z-20">
          <div className="max-w-3xl mx-auto relative">
            
            {/* Session Prompt Popover */}
            {isSessionPromptOpen && (
              <div 
                ref={sessionPromptRef}
                className="absolute bottom-full left-0 mb-2 w-full bg-surface border border-border rounded-xl shadow-xl p-3 z-30 animate-fadeIn"
              >
                 <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-medium text-secondary uppercase tracking-wider">当前对话提示词</span>
                    <button onClick={() => setIsSessionPromptOpen(false)} className="text-secondary hover:text-primary"><Icons.Close className="w-4 h-4"/></button>
                 </div>
                 <textarea 
                    value={sessionPrompt}
                    onChange={(e) => setSessionPrompt(e.target.value)}
                    placeholder="为此对话设定特定的规则或背景..."
                    className="w-full bg-surfaceHighlight border-border border rounded-lg p-2 text-sm focus:ring-1 focus:ring-secondary outline-none min-h-[80px] resize-none placeholder-zinc-500"
                 />
              </div>
            )}

            <div className={`
              relative flex items-end gap-2 bg-surfaceHighlight rounded-2xl border transition-colors duration-200
              ${input ? 'border-secondary' : 'border-border'}
              focus-within:border-primary/50
            `}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入消息..."
                className="w-full bg-transparent border-0 focus:ring-0 focus:outline-none resize-none py-3.5 pl-4 pr-32 max-h-[200px] text-primary placeholder-secondary leading-relaxed scrollbar-hide rounded-2xl outline-none ring-0"
                rows={1}
              />
              
              <div className="absolute right-2 bottom-2 flex items-center gap-2">
                
                {/* Session Prompt Toggle */}
                 <button
                  onClick={() => setIsSessionPromptOpen(!isSessionPromptOpen)}
                  className={`
                    p-2 rounded-xl transition-all duration-200 flex items-center justify-center group relative
                    ${isSessionPromptOpen || sessionPrompt ? 'bg-zinc-500/10 text-primary' : 'text-secondary hover:text-primary'}
                  `}
                  title="对话提示词"
                >
                  <Icons.FileText className={`w-5 h-5`} />
                  {sessionPrompt && (
                    <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-surface"></span>
                  )}
                </button>

                {/* Thinking Mode Toggle */}
                <button
                  onClick={() => setIsThinkingEnabled(!isThinkingEnabled)}
                  className={`
                    p-2 rounded-xl transition-all duration-200 flex items-center justify-center group relative
                    ${isThinkingEnabled ? 'bg-indigo-500/10 text-indigo-500' : 'text-secondary hover:text-primary'}
                  `}
                  title="切换思考模型"
                >
                  <Icons.Brain className={`w-5 h-5 ${isThinkingEnabled ? 'fill-indigo-500/20' : ''}`} />
                  {isThinkingEnabled && (
                    <span className="absolute -top-1 -right-1 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                    </span>
                  )}
                </button>

                {/* Send Button */}
                <button
                  onClick={handleSendMessage}
                  disabled={!input.trim() || isLoading}
                  className={`
                    p-2 rounded-xl transition-all duration-200 flex items-center justify-center
                    ${input.trim() && !isLoading
                      ? 'bg-primary text-background hover:bg-primary/90' 
                      : 'bg-surfaceHighlight text-secondary cursor-not-allowed'}
                  `}
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Icons.Send className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
            
            <div className="text-center mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
               <p className="text-[10px] text-secondary h-4">
                 {isThinkingEnabled ? '思考模型已启用' : ''}
               </p>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
};

export default App;