'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { AdminShell } from '../components/AdminShell';
import {
  fetchAllPmMessages,
  fetchPmMessagesByPm,
  fetchPropertyManagers,
  createPmMessage,
  deletePmMessage,
  markPmMessagesAsRead,
  deletePmMessagesByPm,
} from '@/lib/api/admin';
import type { PropertyManager } from '@/types/database';
import styles from './messages.module.css';

interface PmMessage {
  id: string;
  pm_id: string;
  sender: string;
  sender_name: string;
  message: string;
  read_at: string | null;
  created_at: string;
}

interface PmConversation extends PropertyManager {
  lastMessage: string;
  unreadCount: number;
}

export default function MessagesPage() {
  const [propertyManagers, setPropertyManagers] = useState<PropertyManager[]>([]);
  const [conversations, setConversations] = useState<PmConversation[]>([]);
  const [selectedPM, setSelectedPM] = useState<PropertyManager | null>(null);
  const [messages, setMessages] = useState<PmMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load all conversations (PMs with messages)
  const loadConversations = useCallback(async () => {
    try {
      const [pms, allMessages] = await Promise.all([
        fetchPropertyManagers(),
        fetchAllPmMessages(),
      ]);

      setPropertyManagers(pms);

      if (allMessages && allMessages.length > 0) {
        // Sort by created_at descending
        allMessages.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        // Get unique PM IDs with latest message time and unread count
        const pmMap = new Map<string, { lastMessage: string; unreadCount: number }>();
        allMessages.forEach((msg) => {
          if (!pmMap.has(msg.pm_id)) {
            pmMap.set(msg.pm_id, { lastMessage: msg.created_at, unreadCount: 0 });
          }
          // Count unread messages from PM (not admin)
          if (msg.sender === 'pm' && !msg.read_at) {
            const current = pmMap.get(msg.pm_id);
            if (current) current.unreadCount++;
          }
        });

        // Match with property managers
        const convos: PmConversation[] = [];
        pmMap.forEach((info, pmId) => {
          const pm = pms.find((p) => p.id === pmId);
          if (pm) {
            convos.push({ ...pm, lastMessage: info.lastMessage, unreadCount: info.unreadCount });
          }
        });

        // Sort by last message
        convos.sort((a, b) => new Date(b.lastMessage).getTime() - new Date(a.lastMessage).getTime());
        setConversations(convos);
      } else {
        setConversations([]);
      }
    } catch (err) {
      console.error('Error loading conversations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load messages for a specific PM
  const loadMessages = useCallback(async (pmId: string) => {
    try {
      const data = await fetchPmMessagesByPm(pmId);
      if (data) {
        // Sort by created_at ascending for display
        data.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        setMessages(data);
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  }, []);

  // Initial load and polling
  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, 30000);
    return () => clearInterval(interval);
  }, [loadConversations]);

  // Load messages when PM selected
  useEffect(() => {
    if (selectedPM) {
      loadMessages(selectedPM.id);
      markAsRead(selectedPM.id);
    }
  }, [selectedPM, loadMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function markAsRead(pmId: string) {
    try {
      await markPmMessagesAsRead(pmId);
      // Refresh conversations to update unread counts
      loadConversations();
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  }

  async function handleSend() {
    if (!newMessage.trim() || !selectedPM) return;

    setSending(true);
    try {
      await createPmMessage({
        pm_id: selectedPM.id,
        sender: 'admin',
        sender_name: 'Raptor Vending',
        message: newMessage.trim(),
      });

      setNewMessage('');
      loadMessages(selectedPM.id);
      loadConversations();
    } catch (err) {
      console.error('Error sending message:', err);
      alert('Failed to send message: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(msgId: string) {
    if (!window.confirm('Delete this message?')) return;

    try {
      await deletePmMessage(msgId);
      if (selectedPM) loadMessages(selectedPM.id);
      loadConversations();
    } catch (err) {
      console.error('Error deleting message:', err);
      alert('Failed to delete message: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  async function handleDeleteConversation(pmId: string) {
    if (!window.confirm('Delete ALL messages with this property manager?')) return;

    try {
      await deletePmMessagesByPm(pmId);
      setSelectedPM(null);
      setMessages([]);
      loadConversations();
    } catch (err) {
      console.error('Error deleting conversation:', err);
      alert('Failed to delete conversation: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  // Filter PMs not already in conversations for "New Message" dropdown
  const availablePMs = propertyManagers.filter((pm) => !conversations.find((c) => c.id === pm.id));

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

  return (
    <AdminShell title="Messages">
      <div className={styles.messagesPage}>
        <div className={styles.pageHeader}>
          {totalUnread > 0 && <span className={styles.unreadIndicator}>({totalUnread} unread)</span>}
          <div className={styles.headerActions}>
            <select
              className={styles.newConvoSelect}
              value=""
              onChange={(e) => {
                const pm = propertyManagers.find((p) => p.id === e.target.value);
                if (pm) setSelectedPM(pm);
              }}
            >
              <option value="">+ New Message</option>
              {availablePMs.map((pm) => (
                <option key={pm.id} value={pm.id}>
                  {pm.name}
                </option>
              ))}
            </select>
            <button
              className={styles.refreshButton}
              onClick={() => {
                loadConversations();
                if (selectedPM) loadMessages(selectedPM.id);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        <div className={styles.messagesContainer}>
          {/* Conversations List */}
          <div className={styles.conversationsList}>
            <div className={styles.conversationsHeader}>
              <h3>Conversations</h3>
            </div>
            <div className={styles.conversationsBody}>
              {conversations.length === 0 ? (
                <div className={styles.emptyConversations}>
                  <div className={styles.emptyIcon}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <h4>No messages yet</h4>
                  <p>Start a new conversation with a PM</p>
                </div>
              ) : (
                conversations.map((pm) => (
                  <div
                    key={pm.id}
                    className={`${styles.conversationItem} ${selectedPM?.id === pm.id ? styles.active : ''} ${pm.unreadCount > 0 ? styles.unread : ''}`}
                    onClick={() => setSelectedPM(pm)}
                  >
                    <div className={styles.conversationHeader}>
                      <div className={styles.conversationName}>{pm.name}</div>
                      {pm.unreadCount > 0 && <span className={styles.unreadBadge}>{pm.unreadCount}</span>}
                    </div>
                    <div className={styles.conversationCompany}>{pm.company}</div>
                    <div className={styles.conversationTime}>{formatTime(pm.lastMessage)}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Messages Panel */}
          <div className={styles.messagesPanel}>
            {!selectedPM ? (
              <div className={styles.selectConversation}>
                <div className={styles.emptyIcon}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <h3>Select a conversation</h3>
                <p>Choose a conversation from the list to view messages</p>
              </div>
            ) : (
              <>
                <div className={styles.messagesPanelHeader}>
                  <div className={styles.headerInfo}>
                    <h3>{selectedPM.name}</h3>
                    <span>{selectedPM.company}</span>
                  </div>
                  <button className={styles.deleteConvoBtn} onClick={() => handleDeleteConversation(selectedPM.id)}>
                    Delete All
                  </button>
                </div>

                <div className={styles.messagesBody}>
                  {messages.map((msg) => (
                    <div key={msg.id} className={`${styles.messageGroup} ${msg.sender === 'admin' ? styles.outgoing : styles.incoming}`}>
                      <div className={styles.messageBubble}>
                        <div className={styles.messageText}>{msg.message}</div>
                        <div className={styles.messageTime}>{formatTime(msg.created_at)}</div>
                      </div>
                      <div className={styles.messageFooter}>
                        <span className={styles.messageSender}>
                          {msg.sender === 'admin' ? 'Raptor Vending' : msg.sender_name || 'Property Manager'}
                        </span>
                        <button className={styles.messageDelete} onClick={() => handleDelete(msg.id)} title="Delete message">
                          &times;
                        </button>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                <div className={styles.composeArea}>
                  <textarea
                    className={styles.composeInput}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your reply..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                  />
                  <button className={styles.sendButton} onClick={handleSend} disabled={sending || !newMessage.trim()}>
                    {sending ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
