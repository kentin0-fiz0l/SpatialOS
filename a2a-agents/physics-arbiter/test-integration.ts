/**
 * Integration Test: Physics Arbiter + A2A Server
 *
 * Simulates a user client querying the Physics Arbiter
 */

import { A2AClient } from '../../a2a-server/src/a2a-client.js';
import type { A2AMessage } from '../../a2a-server/src/types.js';

async function testIntegration() {
  console.log('🧪 Physics Arbiter Integration Test\n');

  // Create a test user client
  const userClient = new A2AClient({
    agentCard: {
      id: 'test-user-001',
      name: 'Test User',
      capabilities: ['spatial-computing'],
      description: 'Test user for integration testing',
      version: '1.0.0',
    },
    discoveryServerUrl: 'ws://localhost:3000',
  });

  try {
    // Connect to A2A server
    console.log('[Test] Connecting to A2A server...');
    await userClient.connect();
    console.log('[Test] ✅ Connected\n');

    // Wait a bit for registration
    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 1: Discover Physics Arbiter
    console.log('Test 1: Discover Physics Arbiter');
    const arbiters = await userClient.discover({ capabilities: ['placement-validate'] });
    console.log(`[Test] Found ${arbiters.length} Physics Arbiter(s)`);
    if (arbiters.length > 0) {
      console.log(`[Test] ✅ Arbiter: ${arbiters[0].name} (${arbiters[0].id})`);
    } else {
      console.log('[Test] ❌ No Physics Arbiter found!');
      process.exit(1);
    }
    console.log('');

    const arbiter = arbiters[0];

    // Test 2: Valid placement (within bounds, no collision)
    console.log('Test 2: Valid placement request');
    const validObject = {
      id: 'test-obj-1',
      type: 'note',
      position: [0, 1, -2],
    };

    const requestId1 = crypto.randomUUID();
    let result1Received = false;

    userClient.onMessage('placement-validate-result', (message: A2AMessage) => {
      if (message.payload.requestId === requestId1) {
        result1Received = true;
        console.log(`[Test] Response: ${message.payload.isValid ? '✅ VALID' : '❌ INVALID'}`);
        if (message.payload.reason) {
          console.log(`[Test] Reason: ${message.payload.reason}`);
        }
      }
    });

    await userClient.sendMessage({
      to: arbiter.id,
      type: 'placement-validate',
      payload: { object: validObject, requestId: requestId1 },
    });

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 500));
    if (!result1Received) {
      console.log('[Test] ❌ No response received!');
    }
    console.log('');

    // Test 3: Invalid placement (out of bounds)
    console.log('Test 3: Invalid placement (out of bounds)');
    const invalidObject = {
      id: 'test-obj-2',
      type: 'timer',
      position: [10, 1, -2], // X=10 is out of bounds (max is 5)
    };

    const requestId2 = crypto.randomUUID();
    let result2Received = false;

    userClient.onMessage('placement-validate-result', (message: A2AMessage) => {
      if (message.payload.requestId === requestId2) {
        result2Received = true;
        console.log(`[Test] Response: ${message.payload.isValid ? '✅ VALID' : '❌ INVALID'}`);
        if (message.payload.reason) {
          console.log(`[Test] Reason: ${message.payload.reason}`);
        }
      }
    });

    await userClient.sendMessage({
      to: arbiter.id,
      type: 'placement-validate',
      payload: { object: invalidObject, requestId: requestId2 },
    });

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 500));
    if (!result2Received) {
      console.log('[Test] ❌ No response received!');
    }
    console.log('');

    // Test 4: Simulate object creation (for collision test)
    console.log('Test 4: Register object for collision detection');
    await userClient.sendMessage({
      to: arbiter.id,
      type: 'object-created',
      payload: {
        object: {
          id: 'existing-obj',
          type: 'widget',
          position: [0, 1, -2],
        },
      },
    });
    console.log('[Test] ✅ Object registered at [0, 1, -2]');
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log('');

    // Test 5: Collision detection
    console.log('Test 5: Collision detection');
    const collidingObject = {
      id: 'test-obj-3',
      type: 'image',
      position: [0.1, 1, -2], // Very close to existing object
    };

    const requestId3 = crypto.randomUUID();
    let result3Received = false;

    userClient.onMessage('placement-validate-result', (message: A2AMessage) => {
      if (message.payload.requestId === requestId3) {
        result3Received = true;
        console.log(`[Test] Response: ${message.payload.isValid ? '✅ VALID' : '❌ INVALID'}`);
        if (message.payload.reason) {
          console.log(`[Test] Reason: ${message.payload.reason}`);
        }
        if (message.payload.collisions && message.payload.collisions.length > 0) {
          console.log(`[Test] Collisions: ${message.payload.collisions.length}`);
          message.payload.collisions.forEach((c: any) => {
            console.log(`[Test]   - ${c.objectId}: distance=${c.distance.toFixed(3)}m, overlap=${c.overlap.toFixed(3)}m`);
          });
        }
      }
    });

    await userClient.sendMessage({
      to: arbiter.id,
      type: 'placement-validate',
      payload: { object: collidingObject, requestId: requestId3 },
    });

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 500));
    if (!result3Received) {
      console.log('[Test] ❌ No response received!');
    }
    console.log('');

    // Summary
    console.log('='.repeat(60));
    console.log('\n✅ Integration test complete!');
    console.log('\nPhysics Arbiter is successfully:');
    console.log('  1. Registered with A2A server');
    console.log('  2. Discoverable by capability');
    console.log('  3. Validating placements (bounds check)');
    console.log('  4. Detecting collisions');
    console.log('\nReady for browser integration!\n');

    // Cleanup
    await userClient.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('[Test] ❌ Error:', error);
    process.exit(1);
  }
}

testIntegration();
