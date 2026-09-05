/**
 * Multi-User Test Script
 *
 * Simulates a second user to test A2A object synchronization
 */

import { A2AClient } from './src/a2a-client.js';
import type { AgentCard, A2AMessage } from './src/types.js';

// Simulated user agent card
const testUserCard: Omit<AgentCard, 'registeredAt' | 'lastHeartbeat'> = {
  id: 'spatialos-test-user-simulator',
  name: 'Test User (Simulator)',
  capabilities: ['voice-commands', 'hand-tracking', 'object-placement', 'spatial-computing'],
  description: 'Simulated test user for multi-user sync testing',
  version: '1.0.0',
  metadata: {
    type: 'test-agent',
    userId: 'test-simulator-001',
  },
};

// Create client
const client = new A2AClient({
  agentCard: testUserCard,
  discoveryServerUrl: 'ws://localhost:3000',
});

async function main() {
  console.log('🧪 Multi-User Test Script');
  console.log('========================\n');

  // Connect to A2A server
  console.log('Connecting to A2A discovery server...');
  await client.connect();
  console.log('✅ Connected!\n');

  // Listen for incoming messages
  client.onMessage('object-add', (message: A2AMessage) => {
    console.log('📥 Received object-add from:', message.from);
    console.log('   Object:', JSON.stringify(message.payload.object, null, 2));
  });

  client.onMessage('object-update', (message: A2AMessage) => {
    console.log('📝 Received object-update from:', message.from);
    console.log('   ID:', message.payload.id);
    console.log('   Updates:', JSON.stringify(message.payload.updates, null, 2));
  });

  client.onMessage('object-delete', (message: A2AMessage) => {
    console.log('🗑️  Received object-delete from:', message.from);
    console.log('   ID:', message.payload.id);
  });

  console.log('👂 Listening for messages from other users...\n');

  // Wait a moment for any initial messages
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Send a test object
  console.log('📤 Sending test object to all users...');
  const testObject = {
    id: `test-object-${Date.now()}`,
    type: 'note',
    content: { text: '🧪 Test message from simulated user!' },
    position: [0.5, 1.5, -2],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    room: 'default',
    createdAt: Date.now(),
    createdBy: 'hand' as const,
    persistent: true,
    visible: true,
  };

  await client.sendMessage({
    type: 'object-add',
    payload: { object: testObject },
  });

  console.log('✅ Test object sent!');
  console.log('   Check Window 1 - you should see a new note appear!\n');

  // Interactive mode
  console.log('Commands:');
  console.log('  note <text>  - Send a note with custom text');
  console.log('  exit         - Disconnect and exit\n');

  // Keep running and listen for stdin
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async (data) => {
    const input = data.toString().trim();

    if (input === 'exit') {
      console.log('Disconnecting...');
      client.disconnect();
      process.exit(0);
    } else if (input.startsWith('note ')) {
      const text = input.substring(5);
      const noteObject = {
        id: `test-note-${Date.now()}`,
        type: 'note',
        content: { text },
        position: [Math.random() * 2 - 1, 1.5, -2],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
        room: 'default',
        createdAt: Date.now(),
        createdBy: 'hand' as const,
        persistent: true,
        visible: true,
      };

      await client.sendMessage({
        type: 'object-add',
        payload: { object: noteObject },
      });

      console.log(`✅ Sent note: "${text}"\n`);
    } else {
      console.log('Unknown command. Type "note <text>" or "exit"\n');
    }
  });
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
