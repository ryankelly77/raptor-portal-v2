'use client';

import { useState, useEffect } from 'react';

export default function TestAuthPage() {
  const [status, setStatus] = useState('Loading...');
  const [logs, setLogs] = useState<string[]>([]);

  const log = (msg: string) => {
    console.log(msg);
    setLogs(prev => [...prev, `${new Date().toISOString().slice(11, 19)} - ${msg}`]);
  };

  useEffect(() => {
    runTest();
  }, []);

  async function runTest() {
    log('Starting auth test...');

    // Check sessionStorage
    const token = sessionStorage.getItem('adminToken');
    log(`Token in sessionStorage: ${token ? token.substring(0, 30) + '...' : 'NULL'}`);

    if (!token) {
      setStatus('No token in sessionStorage. Please login first at /admin/login');
      return;
    }

    // Try to call the CRUD API
    log('Calling /api/admin/crud...');
    try {
      const response = await fetch('/api/admin/crud', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ table: 'projects', action: 'read' }),
      });

      log(`Response status: ${response.status}`);
      const data = await response.json();
      log(`Response body: ${JSON.stringify(data).substring(0, 200)}`);

      if (response.ok) {
        setStatus(`SUCCESS! Got ${data.data?.length || 0} projects`);
      } else {
        setStatus(`FAILED: ${response.status} - ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      log(`Fetch error: ${err}`);
      setStatus(`ERROR: ${err}`);
    }
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>Auth Test Page</h1>
      <h2 style={{ color: status.includes('SUCCESS') ? 'green' : status.includes('FAILED') || status.includes('ERROR') ? 'red' : 'black' }}>
        {status}
      </h2>
      <button onClick={runTest} style={{ padding: '10px 20px', marginBottom: '20px' }}>
        Run Test Again
      </button>
      <h3>Logs:</h3>
      <pre style={{ background: '#f0f0f0', padding: '10px', maxHeight: '400px', overflow: 'auto' }}>
        {logs.join('\n')}
      </pre>
    </div>
  );
}
