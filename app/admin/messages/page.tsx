'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { AdminShell } from '../components/AdminShell';
import styles from './messages.module.css';

interface Message {
  id: string;
  project_id: string;
  sender_type: 'admin' | 'pm';
  sender_name: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface RawProject {
  id: string;
  project_number: string | null;
  property_id: string;
  location_id: string | null;
  property_manager_id: string | null;
}

interface Property {
  id: string;
  name: string;
  property_manager_id: string | null;
}

interface Location {
  id: string;
  name: string;
  property_id: string;
}

interface PropertyManager {
  id: string;
  name: string;
}

interface EnrichedProject {
  id: string;
  project_number: string;
  property_name: string;
  location_name: string;
  pm_name: string;
}

interface Conversation {
  project: EnrichedProject;
  messages: Message[];
  unreadCount: number;
  lastMessage: Message | null;
}

// Get auth headers for API calls
function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('adminToken') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    try {
      // Load all data in parallel
      const [projectsRes, propertiesRes, locationsRes, managersRes, messagesRes] = await Promise.all([
        fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ table: 'projects', action: 'read' }),
        }),
        fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ table: 'properties', action: 'read' }),
        }),
        fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ table: 'locations', action: 'read' }),
        }),
        fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ table: 'property_managers', action: 'read' }),
        }),
        fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ table: 'messages', action: 'read' }),
        }),
      ]);

      const [projectsData, propertiesData, locationsData, managersData, messagesData] = await Promise.all([
        projectsRes.json(),
        propertiesRes.json(),
        locationsRes.json(),
        managersRes.json(),
        messagesRes.json(),
      ]);

      const rawProjects: RawProject[] = projectsData.data || [];
      const properties: Property[] = propertiesData.data || [];
      const locations: Location[] = locationsData.data || [];
      const managers: PropertyManager[] = managersData.data || [];
      const messages: Message[] = messagesData.data || [];

      // Enrich projects with related data
      const enrichedProjects: EnrichedProject[] = rawProjects.map((project) => {
        const location = locations.find((l) => l.id === project.location_id);
        const property = location
          ? properties.find((p) => p.id === location.property_id)
          : properties.find((p) => p.id === project.property_id);
        const manager = property
          ? managers.find((m) => m.id === property.property_manager_id)
          : project.property_manager_id
          ? managers.find((m) => m.id === project.property_manager_id)
          : null;

        return {
          id: project.id,
          project_number: project.project_number || 'N/A',
          property_name: property?.name || 'Unknown Property',
          location_name: location?.name || 'Unknown Location',
          pm_name: manager?.name || 'Unknown PM',
        };
      });

      // Group messages by project
      const conversationsMap = new Map<string, Conversation>();

      enrichedProjects.forEach((project) => {
        const projectMessages = messages
          .filter((m) => m.project_id === project.id)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        const unreadCount = projectMessages.filter((m) => !m.is_read && m.sender_type === 'pm').length;

        if (projectMessages.length > 0) {
          conversationsMap.set(project.id, {
            project,
            messages: projectMessages,
            unreadCount,
            lastMessage: projectMessages[projectMessages.length - 1] || null,
          });
        }
      });

      // Sort by last message time
      const sortedConversations = Array.from(conversationsMap.values()).sort((a, b) => {
        const aTime = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0;
        const bTime = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0;
        return bTime - aTime;
      });

      setConversations(sortedConversations);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Poll for new messages every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedProjectId, conversations]);

  const selectedConversation = conversations.find((c) => c.project.id === selectedProjectId);

  const filteredConversations = conversations.filter((conv) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      conv.project.property_name.toLowerCase().includes(searchLower) ||
      conv.project.location_name.toLowerCase().includes(searchLower) ||
      conv.project.pm_name.toLowerCase().includes(searchLower)
    );
  });

  async function handleSendMessage() {
    if (!newMessage.trim() || !selectedProjectId) return;

    setSending(true);
    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'messages',
          action: 'create',
          data: {
            project_id: selectedProjectId,
            sender_type: 'admin',
            sender_name: 'Admin',
            message: newMessage.trim(),
            is_read: false,
          },
        }),
      });
      setNewMessage('');
      await loadData();
    } catch (err) {
      alert('Error sending message: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setSending(false);
    }
  }

  async function handleMarkAsRead(projectId: string) {
    const conv = conversations.find((c) => c.project.id === projectId);
    if (!conv) return;

    const unreadMessages = conv.messages.filter((m) => !m.is_read && m.sender_type === 'pm');
    for (const msg of unreadMessages) {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'messages',
          action: 'update',
          id: msg.id,
          data: { is_read: true },
        }),
      });
    }
    await loadData();
  }

  async function handleDeleteMessage(messageId: string) {
    if (!window.confirm('Delete this message?')) return;

    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'messages',
          action: 'delete',
          id: messageId,
        }),
      });
      await loadData();
    } catch (err) {
      alert('Error deleting message: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  function formatTime(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }

  function formatFullTime(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function getInitials(name: string) {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  function selectConversation(projectId: string) {
    setSelectedProjectId(projectId);
    handleMarkAsRead(projectId);
  }

  if (loading) {
    return (
      <AdminShell title="Messages">
        <div className={styles.messagesPage}>
          <div className={styles.loading}>
            <div className={styles.spinner} />
          </div>
        </div>
      </AdminShell>
    );
  }

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  return (
    <AdminShell title="Messages">
      <div className={styles.messagesPage}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>
            Messages
          {totalUnread > 0 && <span style={{ color: '#f97316', marginLeft: '8px' }}>({totalUnread} unread)</span>}
        </h1>
        <div className={styles.headerActions}>
          <button className={styles.refreshButton} onClick={loadData}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      <div className={styles.messagesContainer}>
        {/* Conversations List */}
        <div className={styles.conversationsList}>
          <div className={styles.conversationsHeader}>
            <input
              className={styles.searchInput}
              placeholder="Search conversations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className={styles.conversationsBody}>
            {filteredConversations.length === 0 ? (
              <div className={styles.emptyConversations}>
                <div className={styles.emptyIcon}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <h3>No conversations yet</h3>
                <p>Messages from PMs will appear here</p>
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <div
                  key={conv.project.id}
                  className={`${styles.conversationItem} ${
                    selectedProjectId === conv.project.id ? styles.active : ''
                  } ${conv.unreadCount > 0 ? styles.unread : ''}`}
                  onClick={() => selectConversation(conv.project.id)}
                >
                  <div className={styles.avatar}>{getInitials(conv.project.pm_name)}</div>
                  <div className={styles.conversationInfo}>
                    <div className={styles.conversationHeader}>
                      <span className={styles.conversationName}>{conv.project.pm_name}</span>
                      <span className={styles.conversationTime}>
                        {conv.lastMessage && formatTime(conv.lastMessage.created_at)}
                      </span>
                    </div>
                    <div className={styles.conversationProject}>
                      {conv.project.property_name} - {conv.project.location_name}
                    </div>
                    <div className={styles.conversationPreview}>
                      {conv.lastMessage?.message.slice(0, 50)}
                      {conv.lastMessage && conv.lastMessage.message.length > 50 ? '...' : ''}
                      {conv.unreadCount > 0 && <span className={styles.unreadBadge}>{conv.unreadCount}</span>}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Messages Panel */}
        <div className={styles.messagesPanel}>
          {selectedConversation ? (
            <>
              <div className={styles.messagesPanelHeader}>
                <div className={styles.headerInfo}>
                  <div className={styles.avatar}>{getInitials(selectedConversation.project.pm_name)}</div>
                  <div className={styles.headerText}>
                    <h3>{selectedConversation.project.pm_name}</h3>
                    <p>
                      {selectedConversation.project.property_name} - {selectedConversation.project.location_name}
                    </p>
                  </div>
                </div>
                <div className={styles.headerActions}>
                  <button onClick={() => window.open(`/admin/projects/${selectedConversation.project.id}`, '_blank')}>
                    View Project
                  </button>
                </div>
              </div>

              <div className={styles.messagesBody}>
                {selectedConversation.messages.map((msg) => (
                  <div key={msg.id} className={styles.messageGroup}>
                    <div className={`${styles.messageBubble} ${msg.sender_type === 'admin' ? styles.outgoing : styles.incoming}`}>
                      {msg.sender_type === 'pm' && <div className={styles.messageSender}>{msg.sender_name}</div>}
                      <div>{msg.message}</div>
                      <div className={styles.messageTime}>
                        {formatFullTime(msg.created_at)}
                        {msg.sender_type === 'admin' && (
                          <button
                            onClick={() => handleDeleteMessage(msg.id)}
                            style={{
                              marginLeft: '8px',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              opacity: 0.7,
                              fontSize: '11px',
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <div className={styles.composeArea}>
                <textarea
                  className={styles.composeInput}
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  rows={1}
                />
                <button className={styles.sendButton} onClick={handleSendMessage} disabled={sending || !newMessage.trim()}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
            </>
          ) : (
            <div className={styles.selectConversation}>
              <div className={styles.emptyIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <h3>Select a conversation</h3>
              <p>Choose a conversation from the list to view messages</p>
            </div>
          )}
        </div>
      </div>
    </div>
    </AdminShell>
  );
}
