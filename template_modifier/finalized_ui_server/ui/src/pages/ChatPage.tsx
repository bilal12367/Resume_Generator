import React, { useState, useEffect, useRef } from 'react';
import { CentrifugoClient } from '../services/CentrifugoClient';
import type { ChatSession, ChatMessage, AgentTraces, TokenUsage } from '../types';

interface ChatPageProps {
  activeSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onOpenJobModal: (jobId: string) => void;
  API_BASE_URL: string;
}

export const ChatPage: React.FC<ChatPageProps> = ({
  activeSessionId,
  onSelectSession,
  onOpenJobModal,
  API_BASE_URL
}) => {
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([
    {
      id: 'job_agent_session_01',
      title: 'Python Remote Job Search',
      time: '10:42 AM',
      messages: [
        {
          id: 'msg-1',
          sender: 'agent',
          text: 'Hello! I am your AI Job Search Agent. Tell me what jobs you are looking for and I will search LinkedIn and present Job IDs for you.',
          timestamp: '10:42 AM'
        }
      ]
    }
  ]);

  const [chatInput, setChatInput] = useState<string>('');
  const [isAgentThinking, setIsAgentThinking] = useState<boolean>(false);
  const [expandedTraceMsgIds, setExpandedTraceMsgIds] = useState<Record<string, boolean>>({});

  const centrifugoRef = useRef<CentrifugoClient | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const activeSession = chatSessions.find(s => s.id === activeSessionId) || chatSessions[0];

  const toggleTraces = (msgId: string) => {
    setExpandedTraceMsgIds(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Fetch Session History from Backend MySQL Database
  const loadSessionHistory = async (sessionId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/linkedin/agent/history/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        const cachedJobIds: string[] = data.job_ids || (data.cached_jobs ? data.cached_jobs.map((j: any) => j.job_id) : []);

        const sessionEvents: any[] = data.events || [];
        const thinkingSteps = sessionEvents.filter(e => e.event_type === 'thinking').map(e => e.data?.text || e.data?.state).filter(Boolean);
        const actionSteps = sessionEvents.filter(e => e.event_type === 'action' || e.event_type === 'tool_calling').map(e => e.data?.text || (e.data?.tool_name ? `Executing tool: ${e.data.tool_name}` : null)).filter(Boolean);
        const observationSteps = sessionEvents.filter(e => e.event_type === 'observation' || e.event_type === 'tool_result').map(e => e.data?.text).filter(Boolean);
        const fetchedTokenUsage: TokenUsage = data.token_usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

        if (data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
          const loadedMessages: ChatMessage[] = data.messages.map((m: any) => {
            const extractedJobIds: string[] = [];
            const regex = /\b4?\d{9}\b|\b\d{8,12}\b/g;
            let match;
            while ((match = regex.exec(m.content)) !== null) {
              if (!extractedJobIds.includes(match[0])) {
                extractedJobIds.push(match[0]);
              }
            }

            if (m.role !== 'user' && cachedJobIds.length > 0) {
              cachedJobIds.forEach(id => {
                if (!extractedJobIds.includes(id)) {
                  extractedJobIds.push(id);
                }
              });
            }

            return {
              id: `msg-${m.id || Date.now()}`,
              sender: m.role === 'user' ? 'user' : 'agent',
              text: m.content,
              timestamp: m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
              jobIds: extractedJobIds.length > 0 ? extractedJobIds : undefined,
              isStreaming: false,
              traces: m.role !== 'user' ? {
                thinking: thinkingSteps.length > 0 ? thinkingSteps : ['Analyzed job preferences & LinkedIn query.'],
                action: actionSteps,
                observation: observationSteps,
                answering: m.content
              } : undefined
            };
          });

          setChatSessions((prevSessions) => {
            const exists = prevSessions.some((s) => s.id === sessionId);
            if (exists) {
              return prevSessions.map((s) => s.id === sessionId ? { ...s, messages: loadedMessages, tokenUsage: fetchedTokenUsage } : s);
            } else {
              return [
                {
                  id: sessionId,
                  title: sessionId === 'job_agent_session_01' ? 'Python Remote Job Search' : `Job Search (${sessionId.slice(-6)})`,
                  time: 'Recent',
                  messages: loadedMessages,
                  tokenUsage: fetchedTokenUsage
                },
                ...prevSessions
              ];
            }
          });
        }
      }
    } catch (err) {
      console.warn(`[Fetch Session History Error]: ${sessionId}`, err);
    }
  };

  // Fetch All Sessions List from Backend MySQL DB
  const fetchAllSessions = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/linkedin/agent/sessions`);
      if (res.ok) {
        const data = await res.json();
        if (data.sessions && Array.isArray(data.sessions) && data.sessions.length > 0) {
          setChatSessions((prev) => {
            const existingMap = new Map(prev.map((s) => [s.id, s]));
            const fetchedSessions: ChatSession[] = data.sessions.map((s: any) => {
              const existing = existingMap.get(s.session_id);
              return {
                id: s.session_id,
                title: existing?.title || (s.session_id === 'job_agent_session_01' ? 'Python Remote Job Search' : `Job Search (${s.session_id.slice(-6)})`),
                time: s.last_activity ? new Date(s.last_activity).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent',
                messages: existing?.messages || []
              };
            });

            prev.forEach((s) => {
              if (!fetchedSessions.some((fs) => fs.id === s.id)) {
                fetchedSessions.push(s);
              }
            });

            return fetchedSessions;
          });
        }
      }
    } catch (err) {
      console.warn('[Fetch Agent Sessions Error]:', err);
    }
  };

  useEffect(() => {
    fetchAllSessions();
  }, []);

  useEffect(() => {
    if (activeSessionId) {
      loadSessionHistory(activeSessionId);
    }
  }, [activeSessionId]);

  useEffect(() => {
    scrollToBottom();
  }, [activeSession?.messages, isAgentThinking]);

  // Centrifugo Connection & Real-time Event Listener per activeSessionId
  useEffect(() => {
    const cfClient = new CentrifugoClient({
      wsUrl: 'ws://localhost:8008/connection/websocket',
      userId: 'user_demo',
      autoReconnect: true,
    });
    centrifugoRef.current = cfClient;

    let unsubscribeFn: (() => void) | null = null;

    async function initCentrifugo() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/linkedin/centrifugo/token?user_id=user_demo`);
        if (res.ok) {
          const data = await res.json();
          if (data.token) {
            await cfClient.connect(data.token);
            const channelName = `agent:${activeSessionId}`;

            unsubscribeFn = cfClient.subscribe(channelName, (eventRecord) => {
              if (!eventRecord) return;
              console.log(`⚡ [Centrifugo Sub Received] Channel: ${channelName}`, eventRecord);

              const eventType = eventRecord.event_type || (eventRecord.data && eventRecord.data.event_type);
              const eventData = eventRecord.data || eventRecord;

              if (!eventType) return;

              setChatSessions((prevSessions) => prevSessions.map((s) => {
                if (s.id !== activeSessionId) return s;

                let messagesCopy = [...s.messages];

                let agentMsgIndex = -1;
                for (let i = messagesCopy.length - 1; i >= 0; i--) {
                  if (messagesCopy[i].sender === 'agent' && (messagesCopy[i].isStreaming || messagesCopy[i].id.startsWith('agent-stream-'))) {
                    agentMsgIndex = i;
                    break;
                  }
                }

                if (agentMsgIndex === -1) {
                  const newMsg: ChatMessage = {
                    id: `agent-stream-${Date.now()}`,
                    sender: 'agent',
                    text: '',
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    isStreaming: true,
                    traces: { thinking: [], action: [], observation: [], answering: '' }
                  };
                  messagesCopy.push(newMsg);
                  agentMsgIndex = messagesCopy.length - 1;
                }

                const targetMsg = { ...messagesCopy[agentMsgIndex] };
                const traces: AgentTraces = targetMsg.traces
                  ? {
                      thinking: [...targetMsg.traces.thinking],
                      action: [...targetMsg.traces.action],
                      observation: [...targetMsg.traces.observation],
                      answering: targetMsg.traces.answering || ''
                    }
                  : { thinking: [], action: [], observation: [], answering: '' };

                let sessionTokenUsage = s.tokenUsage;
                if (eventType === 'token_utilization' && eventData) {
                  const p = eventData.prompt_tokens || 0;
                  const c = eventData.completion_tokens || 0;
                  const t = eventData.total_tokens || (p + c);
                  sessionTokenUsage = { prompt_tokens: p, completion_tokens: c, total_tokens: t };
                } else if (eventType === 'thinking') {
                  const text = eventData.text || eventData.state || eventData.user_input;
                  if (text && !traces.thinking.includes(text)) {
                    traces.thinking.push(text);
                  }
                  targetMsg.isStreaming = true;
                } else if (eventType === 'action' || eventType === 'tool_calling') {
                  const text = eventData.text || (eventData.tool_name ? `Executing tool: ${eventData.tool_name}(${JSON.stringify(eventData.params || {})})` : 'Executing tool action...');
                  if (text && !traces.action.includes(text)) {
                    traces.action.push(text);
                  }
                  targetMsg.isStreaming = true;
                } else if (eventType === 'observation' || eventType === 'tool_result') {
                  const text = eventData.text || (eventData.count !== undefined ? `Observed ${eventData.count} result(s)` : 'Observation returned');
                  if (text && !traces.observation.includes(text)) {
                    traces.observation.push(text);
                  }
                  targetMsg.isStreaming = true;
                } else if (eventType === 'hitl_prompt') {
                  if (eventData.job_ids && Array.isArray(eventData.job_ids)) {
                    const existing = targetMsg.jobIds || [];
                    targetMsg.jobIds = Array.from(new Set([...existing, ...eventData.job_ids]));
                  }
                  const promptText = eventData.question || 'Human-In-The-Loop Selection Required';
                  if (!traces.action.includes(promptText)) {
                    traces.action.push(promptText);
                  }
                  targetMsg.isStreaming = true;
                } else if (eventType === 'answering' || eventType === 'answering_chunk') {
                  const text = eventData.response || eventData.text || '';
                  traces.answering = text;
                  targetMsg.text = text;
                  targetMsg.isStreaming = true;
                } else if (eventType === 'completed') {
                  targetMsg.isStreaming = false;
                  if (eventData.response) {
                    targetMsg.text = eventData.response;
                    traces.answering = eventData.response;
                  }
                  if (eventData.job_ids && Array.isArray(eventData.job_ids)) {
                    const existing = targetMsg.jobIds || [];
                    targetMsg.jobIds = Array.from(new Set([...existing, ...eventData.job_ids]));
                  }
                }

                targetMsg.traces = traces;
                messagesCopy[agentMsgIndex] = targetMsg;
                return { ...s, messages: messagesCopy, tokenUsage: sessionTokenUsage };
              }));
            });
          }
        }
      } catch (err) {
        console.warn('[Centrifugo Setup Error]:', err);
      }
    }

    initCentrifugo();

    return () => {
      if (unsubscribeFn) unsubscribeFn();
      cfClient.disconnect();
    };
  }, [activeSessionId, API_BASE_URL]);

  const handleCreateNewChat = () => {
    const newId = `session_${Date.now()}`;
    const newSession: ChatSession = {
      id: newId,
      title: `Job Search (${newId.slice(-4)})`,
      time: 'Just now',
      messages: [
        {
          id: `msg-${Date.now()}`,
          sender: 'agent',
          text: 'Hello! Tell me what jobs you are looking for (e.g. "Python Remote jobs") and I will search LinkedIn and present Job IDs for you.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]
    };
    setChatSessions(prev => [newSession, ...prev]);
    onSelectSession(newId);
  };

  const handleDeleteChatSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`${API_BASE_URL}/api/linkedin/agent/session/${id}`, {
        method: 'DELETE'
      });
    } catch (err) {
      console.warn(`[Delete Session Error] Failed to delete session '${id}' from backend:`, err);
    }

    setChatSessions(prev => {
      const filtered = prev.filter(s => s.id !== id);
      if (filtered.length > 0 && activeSessionId === id) {
        onSelectSession(filtered[0].id);
      } else if (filtered.length === 0) {
        const newId = `session_${Date.now()}`;
        const defaultSession: ChatSession = {
          id: newId,
          title: 'New Job Search',
          time: 'Just now',
          messages: [
            {
              id: `msg-${Date.now()}`,
              sender: 'agent',
              text: 'Hello! Tell me what jobs you are looking for (e.g. "Python Remote jobs") and I will search LinkedIn and present Job IDs for you.',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          ]
        };
        onSelectSession(newId);
        return [defaultSession];
      }
      return filtered;
    });
  };

  const handleSendChatMessage = async () => {
    if (!chatInput.trim() || isAgentThinking) return;

    const userText = chatInput.trim();
    setChatInput('');

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const streamingAgentMsg: ChatMessage = {
      id: `agent-stream-${Date.now()}`,
      sender: 'agent',
      text: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isStreaming: true,
      traces: {
        thinking: ['Analyzing user message and preparing LinkedIn search...'],
        action: [],
        observation: [],
        answering: ''
      }
    };

    setChatSessions(prev => prev.map(s => {
      if (s.id === activeSessionId) {
        return {
          ...s,
          messages: [...s.messages, userMsg, streamingAgentMsg],
          time: 'Just now'
        };
      }
      return s;
    }));

    setIsAgentThinking(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/linkedin/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: activeSessionId,
          message: userText
        })
      });

      if (res.ok) {
        const data = await res.json();
        const responseText = data.response || 'Agent search completed.';
        const responseTokenUsage = data.token_usage;

        // Parse events returned from HTTP response payload (safeguard sync)
        const apiEvents: any[] = data.events || [];
        const thinkingSteps = apiEvents.filter(e => e.event_type === 'thinking').map(e => e.data?.text || e.data?.state).filter(Boolean);
        const actionSteps = apiEvents.filter(e => e.event_type === 'action' || e.event_type === 'tool_calling').map(e => e.data?.text || (e.data?.tool_name ? `Executing tool: ${e.data.tool_name}` : null)).filter(Boolean);
        const observationSteps = apiEvents.filter(e => e.event_type === 'observation' || e.event_type === 'tool_result').map(e => e.data?.text).filter(Boolean);

        const extractedJobIds: string[] = [];
        const regex = /\b4?\d{9}\b|\b\d{8,12}\b/g;
        let match;
        while ((match = regex.exec(responseText)) !== null) {
          if (!extractedJobIds.includes(match[0])) {
            extractedJobIds.push(match[0]);
          }
        }

        apiEvents.filter(e => e.event_type === 'hitl_prompt' || e.event_type === 'completed').forEach(e => {
          if (e.data?.job_ids && Array.isArray(e.data.job_ids)) {
            e.data.job_ids.forEach((id: string) => {
              if (!extractedJobIds.includes(id)) extractedJobIds.push(id);
            });
          }
        });

        setChatSessions(prev => prev.map(s => {
          if (s.id !== activeSessionId) return s;
          const msgs = s.messages.map(m => {
            if (m.isStreaming || m.id.startsWith('agent-stream-')) {
              const currentTraces = m.traces || { thinking: [], action: [], observation: [], answering: '' };
              const mergedThinking = Array.from(new Set([...currentTraces.thinking, ...thinkingSteps]));
              const mergedAction = Array.from(new Set([...currentTraces.action, ...actionSteps]));
              const mergedObs = Array.from(new Set([...currentTraces.observation, ...observationSteps]));

              return {
                ...m,
                isStreaming: false,
                text: responseText,
                jobIds: extractedJobIds.length > 0 ? extractedJobIds : m.jobIds,
                traces: {
                  thinking: mergedThinking.length > 0 ? mergedThinking : ['Analyzed user input and query.'],
                  action: mergedAction,
                  observation: mergedObs,
                  answering: responseText
                }
              };
            }
            return m;
          });
          return {
            ...s,
            messages: msgs,
            tokenUsage: responseTokenUsage || s.tokenUsage
          };
        }));
      } else {
        const errData = await res.json();
        const errMsgText = `Error from agent: ${errData.detail || 'Failed to complete job search.'}`;
        setChatSessions(prev => prev.map(s => {
          if (s.id !== activeSessionId) return s;
          const msgs = s.messages.map(m => {
            if (m.isStreaming || m.id.startsWith('agent-stream-')) {
              return {
                ...m,
                isStreaming: false,
                text: errMsgText
              };
            }
            return m;
          });
          return { ...s, messages: msgs };
        }));
      }
    } catch (err) {
      console.warn('[Chat POST Error]:', err);
      setChatSessions(prev => prev.map(s => {
        if (s.id !== activeSessionId) return s;
        const msgs = s.messages.map(m => {
          if (m.isStreaming || m.id.startsWith('agent-stream-')) {
            return {
              ...m,
              isStreaming: false,
              text: 'Network error communicating with AI agent backend.'
            };
          }
          return m;
        });
        return { ...s, messages: msgs };
      }));
    } finally {
      setIsAgentThinking(false);
    }
  };

  return (
    <div className="d-flex w-100 h-100 overflow-hidden" style={{ height: 'calc(100vh - 65px)', maxHeight: 'calc(100vh - 65px)' }}>
      {/* Session Conversations Sidebar (Fixed 300px) */}
      <div className="bg-light border-end d-flex flex-column" style={{ width: '300px', flexShrink: 0 }}>
        <div className="p-3 border-bottom d-flex justify-content-between align-items-center bg-white">
          <h6 className="fw-bold text-dark mb-0">Chat Sessions</h6>
          <button
            onClick={handleCreateNewChat}
            className="btn btn-sm btn-purple d-flex align-items-center gap-1"
          >
            <i className="bi bi-plus-lg"></i>
            <span>New Chat</span>
          </button>
        </div>

        <div className="overflow-auto no-scrollbar flex-grow-1 p-2 d-flex flex-column gap-2">
          {chatSessions.map((session) => (
            <div
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              className={`p-3 rounded-3 cursor-pointer transition-all border ${
                activeSessionId === session.id
                  ? 'bg-white shadow-sm border-purple-light'
                  : 'bg-transparent border-transparent hover-bg-white'
              }`}
            >
              <div className="d-flex justify-content-between align-items-center mb-1">
                <strong className="text-purple fs-7 text-truncate me-2" style={{ maxWidth: '160px' }}>
                  {session.title}
                </strong>
                <div className="d-flex align-items-center gap-1">
                  <small className="text-muted fs-8">{session.time}</small>
                  <button
                    onClick={(e) => handleDeleteChatSession(session.id, e)}
                    className="btn btn-sm text-danger p-0 border-0 ms-1"
                    title="Delete Session"
                  >
                    <i className="bi bi-trash"></i>
                  </button>
                </div>
              </div>

              <p className="text-muted fs-7 mb-0 text-truncate" style={{ maxWidth: '260px' }}>
                {session.messages.length > 0
                  ? session.messages[session.messages.length - 1].text
                  : 'Start a new conversation...'}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Active Agent Chat Stream Section (Flex 1) */}
      <div className="d-flex flex-column h-100 bg-white overflow-hidden" style={{ flex: 1, minWidth: 0 }}>
        {activeSession ? (
          <>
            {/* Chat Header */}
            <div className="p-3 border-bottom bg-white d-flex justify-content-between align-items-center">
              <div className="d-flex align-items-center gap-2 min-w-0">
                <div className="avatar-purple rounded-circle p-2 d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: 38, height: 38 }}>
                  <i className="bi bi-robot text-purple fs-5"></i>
                </div>
                <div className="text-truncate">
                  <h6 className="fw-bold text-dark mb-0 text-truncate">{activeSession.title}</h6>
                  <small className="text-muted fs-8 text-truncate d-block">Session ID: {activeSession.id}</small>
                </div>
              </div>

              <div className="d-flex align-items-center gap-2">
                {activeSession.tokenUsage && activeSession.tokenUsage.total_tokens > 0 && (
                  <div className="badge bg-purple-subtle border border-purple-light text-purple p-2 d-flex align-items-center gap-2" style={{ fontSize: '0.775rem' }}>
                    <i className="bi bi-coin text-warning fs-6"></i>
                    <span><strong>Tokens Used:</strong> {activeSession.tokenUsage.total_tokens.toLocaleString()}</span>
                    <span className="text-muted border-start ps-2 d-none d-sm-inline">Prompt: {activeSession.tokenUsage.prompt_tokens.toLocaleString()}</span>
                    <span className="text-muted border-start ps-2 d-none d-sm-inline">Completion: {activeSession.tokenUsage.completion_tokens.toLocaleString()}</span>
                  </div>
                )}
                <button onClick={(e) => handleDeleteChatSession(activeSession.id, e)} className="btn btn-sm btn-outline-danger flex-shrink-0">
                  <i className="bi bi-trash me-1"></i> End Session
                </button>
              </div>
            </div>

            {/* Chat Messages Stream */}
            <div className="p-4 flex-grow-1 overflow-auto no-scrollbar bg-light d-flex flex-column gap-3" style={{ minWidth: 0 }}>
              {activeSession.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`d-flex flex-column ${
                    msg.sender === 'user' ? 'align-items-end' : 'align-items-start'
                  }`}
                  style={{ minWidth: 0, maxWidth: '100%' }}
                >
                  <div
                    className={`p-3 rounded-4 shadow-sm ${
                      msg.sender === 'user'
                        ? 'bg-purple text-white'
                        : 'bg-white border text-dark'
                    }`}
                    style={{ maxWidth: '85%', wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                  >
                    {/* Live Delta Stream Card when Agent is actively streaming */}
                    {msg.sender === 'agent' && msg.isStreaming ? (
                      <div className="d-flex flex-column gap-2">
                        <div className="d-flex align-items-center gap-2 pb-2 border-bottom">
                          <div className="spinner-grow spinner-grow-sm text-purple" role="status"></div>
                          <span className="fw-bold text-purple fs-7">Agent Execution Live Stream</span>
                          <span className="badge badge-purple ms-auto fs-8">Updating message...</span>
                        </div>

                        {/* Thinking Delta */}
                        {msg.traces?.thinking && msg.traces.thinking.length > 0 && (
                          <div className="p-2 bg-light rounded border-start border-3 border-purple">
                            <small className="fw-bold text-purple d-block mb-1">🧠 Thinking Delta:</small>
                            {msg.traces.thinking.map((t, i) => (
                              <div key={i} className="text-muted fs-8 font-monospace">{t}</div>
                            ))}
                          </div>
                        )}

                        {/* Action Delta */}
                        {msg.traces?.action && msg.traces.action.length > 0 && (
                          <div className="p-2 bg-light rounded border-start border-3 border-warning">
                            <small className="fw-bold text-warning d-block mb-1">⚡ Action Delta (Tool Execution):</small>
                            {msg.traces.action.map((a, i) => (
                              <div key={i} className="text-muted fs-8 font-monospace">{a}</div>
                            ))}
                          </div>
                        )}

                        {/* Observation Delta */}
                        {msg.traces?.observation && msg.traces.observation.length > 0 && (
                          <div className="p-2 bg-light rounded border-start border-3 border-info">
                            <small className="fw-bold text-info d-block mb-1">👁️ Observation Delta (Tool Result):</small>
                            {msg.traces.observation.map((o, i) => (
                              <div key={i} className="text-muted fs-8 font-monospace">{o}</div>
                            ))}
                          </div>
                        )}

                        {/* Answering Delta */}
                        {(msg.traces?.answering || msg.text) && (
                          <div className="p-2 bg-light rounded border-start border-3 border-success">
                            <small className="fw-bold text-success d-block mb-1">💬 Answering Delta:</small>
                            <div className="text-dark fs-7" style={{ whiteSpace: 'pre-wrap' }}>
                              {msg.traces?.answering || msg.text}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Standard Completed Message Text */
                      <p className="mb-0 fs-7" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                        {msg.text || (msg.sender === 'agent' ? 'Processing search results...' : '')}
                      </p>
                    )}

                    {/* Interactive HITL Job Selection Card */}
                    {msg.jobIds && msg.jobIds.length > 0 && (
                      <div className="mt-3 p-3 bg-purple-subtle border border-purple-light rounded-3 shadow-sm">
                        <div className="d-flex align-items-center gap-2 mb-2">
                          <i className="bi bi-person-check-fill text-purple fs-5"></i>
                          <strong className="text-purple fs-7">HITL Action: Select Job to Inspect Live Description</strong>
                        </div>
                        <p className="text-secondary fs-8 mb-2">
                          Click any Job ID pill below to view full LinkedIn job description, matched keywords, and extracted skills:
                        </p>
                        <div className="d-flex flex-wrap gap-2">
                          {msg.jobIds.map((jobId) => (
                            <button
                              key={jobId}
                              onClick={() => onOpenJobModal(jobId)}
                              className="btn btn-sm btn-purple d-flex align-items-center gap-1 shadow-sm px-3 py-1.5 rounded-pill font-monospace"
                            >
                              <i className="bi bi-briefcase-fill me-1"></i>
                              <span>Job ID: {jobId}</span>
                              <i className="bi bi-eye-fill ms-1"></i>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Accordion Traces for Completed Agent Message */}
                    {msg.sender === 'agent' && !msg.isStreaming && (
                      <div className="mt-2 pt-2 border-top">
                        <button
                          onClick={() => toggleTraces(msg.id)}
                          className="btn btn-sm btn-light border text-purple d-flex align-items-center gap-2 w-100 justify-content-between"
                          style={{ fontSize: '0.8rem', borderRadius: '8px' }}
                        >
                          <span className="d-flex align-items-center gap-1">
                            <i className="bi bi-diagram-3-fill text-purple"></i>
                            <span>Agent Traces (Thinking | Action | Observation)</span>
                          </span>
                          <i className={`bi bi-chevron-${expandedTraceMsgIds[msg.id] ? 'up' : 'down'}`}></i>
                        </button>

                        {expandedTraceMsgIds[msg.id] && msg.traces && (
                          <div className="mt-2 p-2 bg-light rounded-3 border d-flex flex-column gap-2" style={{ fontSize: '0.825rem' }}>
                            {msg.traces.thinking.length > 0 && (
                              <div className="p-2 bg-white rounded border-start border-3 border-purple">
                                <small className="fw-bold text-purple d-block mb-1">🧠 Thinking Steps:</small>
                                {msg.traces.thinking.map((t, i) => (
                                  <div key={i} className="text-muted fs-8 font-monospace mb-1">{t}</div>
                                ))}
                              </div>
                            )}
                            {msg.traces.action.length > 0 && (
                              <div className="p-2 bg-white rounded border-start border-3 border-warning">
                                <small className="fw-bold text-warning d-block mb-1">⚡ Actions (Tool Executions):</small>
                                {msg.traces.action.map((a, i) => (
                                  <div key={i} className="text-muted fs-8 font-monospace mb-1">{a}</div>
                                ))}
                              </div>
                            )}
                            {msg.traces.observation.length > 0 && (
                              <div className="p-2 bg-white rounded border-start border-3 border-info">
                                <small className="fw-bold text-info d-block mb-1">👁️ Observations (Tool Results):</small>
                                {msg.traces.observation.map((o, i) => (
                                  <div key={i} className="text-muted fs-8 font-monospace mb-1">{o}</div>
                                ))}
                              </div>
                            )}
                            {msg.traces.answering && (
                              <div className="p-2 bg-white rounded border-start border-3 border-success">
                                <small className="fw-bold text-success d-block mb-1">💬 Final Answer:</small>
                                <div className="text-dark fs-7" style={{ whiteSpace: 'pre-wrap' }}>{msg.traces.answering}</div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <small className="text-muted fs-8 mt-1 px-1">{msg.timestamp}</small>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input Footer */}
            <div className="p-3 border-top bg-white">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendChatMessage();
                }}
                className="d-flex gap-2"
              >
                <input
                  type="text"
                  className="form-control rounded-3 p-2.5 fs-7"
                  placeholder="Ask agent (e.g. 'Search Python Remote jobs')..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={isAgentThinking}
                />
                <button
                  type="submit"
                  className="btn btn-purple px-4 rounded-3 fw-bold d-flex align-items-center gap-2"
                  disabled={isAgentThinking || !chatInput.trim()}
                >
                  {isAgentThinking ? (
                    <>
                      <div className="spinner-border spinner-border-sm text-white" role="status"></div>
                      <span>Agent Searching...</span>
                    </>
                  ) : (
                    <>
                      <span>Send</span>
                      <i className="bi bi-send-fill fs-7"></i>
                    </>
                  )}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="d-flex align-items-center justify-content-center h-100 text-muted">
            Select or create a chat session to start chatting with the agent.
          </div>
        )}
      </div>
    </div>
  );
};
