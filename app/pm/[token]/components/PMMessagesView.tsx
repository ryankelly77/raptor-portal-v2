'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from '../pm-portal.module.css';

interface PMMessagesViewProps {
  pmId: string;
  pmName: string;
  onMessagesRead: () => void;
}

interface Message {
  id: string;
  pm_id: string;
  sender: 'pm' | 'admin';
  sender_name: string;
  message: string;
  created_at: string;
  read_at: string | null;
}

// Message icon
const MessageIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    width="48"
    height="48"
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

// Send icon
const SendIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    width="18"
    height="18"
  >
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

export function PMMessagesView({ pmId, pmName, onMessagesRead }: PMMessagesViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    if (!pmId) return;

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('pm_messages')
        .select('*')
        .eq('pm_id', pmId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setMessages(data as Message[]);
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    } finally {
      setLoading(false);
    }
  }, [pmId]);

  const markAsRead = useCallback(async () => {
    if (!pmId) return;

    try {
      const supabase = createClient();
      await supabase
        .from('pm_messages')
        .update({ read_at: new Date().toISOString() })
        .eq('pm_id', pmId)
        .eq('sender', 'admin')
        .is('read_at', null);

      onMessagesRead();
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  }, [pmId, onMessagesRead]);

  useEffect(() => {
    loadMessages();
    markAsRead();

    // Poll for new messages every 30 seconds
    const interval = setInterval(() => {
      loadMessages();
      markAsRead();
    }, 30000);

    return () => clearInterval(interval);
  }, [loadMessages, markAsRead]);

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !pmId) return;

    setSending(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from('pm_messages').insert([
        {
          pm_id: pmId,
          sender: 'pm',
          sender_name: pmName,
          message: newMessage.trim(),
        },
      ]);

      if (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message. Please try again.');
      } else {
        setNewMessage('');
        loadMessages();
      }
    } catch (err) {
      console.error('Error sending message:', err);
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={styles.pmMessagesContainer}>
      <div className={styles.pmMessagesHeader}>
        <h2>Messages with Raptor Vending</h2>
        <p>Send us a message and we&apos;ll respond as soon as possible.</p>
      </div>

      <div className={styles.pmMessagesList}>
        {loading ? (
          <div className={styles.pmMessagesLoading}>Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className={styles.pmMessagesEmpty}>
            <MessageIcon />
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`${styles.pmMessage} ${msg.sender === 'pm' ? styles.pmMessageOutgoing : styles.pmMessageIncoming}`}
            >
              <div className={styles.pmMessageBubble}>
                <div className={styles.pmMessageText}>{msg.message}</div>
                <div className={styles.pmMessageTime}>{formatTime(msg.created_at)}</div>
              </div>
              <div className={styles.pmMessageSender}>{msg.sender === 'pm' ? 'You' : 'Raptor Vending'}</div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className={styles.pmMessagesInput}>
        <textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type your message..."
          onKeyDown={handleKeyDown}
        />
        <button
          className={styles.pmMessageSendBtn}
          onClick={handleSend}
          disabled={sending || !newMessage.trim()}
        >
          <SendIcon />
          <span>{sending ? 'Sending...' : 'Send'}</span>
        </button>
      </div>
    </div>
  );
}
