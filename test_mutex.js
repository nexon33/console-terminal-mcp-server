import * as lockfile from 'lockfile';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url'; // Added for ES module __filename

const __filename = fileURLToPath(import.meta.url); // Define __filename for ES module
const MUTEX_FILE = path.join(os.tmpdir(), 'electron-mcp-mutex.lock');
const MUTEX_DIR = os.tmpdir();

// Function to perform a single lock/unlock cycle
async function singleLockCycle() {
  const processId = process.pid;
  console.log(`Process ${processId} attempting to acquire mutex.`);

  // Ensure the directory exists (still good practice)
  try {
    if (!fs.existsSync(MUTEX_DIR)) {
      fs.mkdirSync(MUTEX_DIR, { recursive: true });
    }
  } catch (e) {
    console.error(`Process ${processId}: Error ensuring mutex directory ${MUTEX_DIR}: ${e.message}`);
    return;
  }

  const lock = promisify(lockfile.lock);
  const unlock = promisify(lockfile.unlock);

  try {
    const lockOptions = {
      wait: 10 * 1000,
      pollPeriod: 100,
      stale: 5 * 1000,
      retries: 100, // Increased retries for contention
      retryWait: 100
    };
    console.log(`Process ${processId} trying to lock with options: ${JSON.stringify(lockOptions)}`);
    await lock(MUTEX_FILE, lockOptions);
    console.log(`Process ${processId} acquired mutex.`);

    if (fs.existsSync(MUTEX_FILE)) {
      console.log(`Process ${processId}: Mutex file EXISTS immediately after lock acquisition.`);
    } else {
      console.log(`Process ${processId}: Mutex file does NOT exist immediately after lock acquisition.`);
    }

    // Simulate some work while holding the lock
    const workDuration = Math.random() * 1000 + 200; // 200ms to 1200ms
    console.log(`Process ${processId} working for ${workDuration.toFixed(0)}ms.`);
    await new Promise(resolve => setTimeout(resolve, workDuration));

    console.log(`Process ${processId} attempting to release mutex.`);
    if (fs.existsSync(MUTEX_FILE)) {
      console.log(`Process ${processId}: Mutex file exists before unlock.`);
      await unlock(MUTEX_FILE);
      console.log(`Process ${processId} released mutex.`);
    } else {
      console.log(`Process ${processId}: Mutex file does NOT exist before unlock. Cannot release.`);
    }
  } catch (error) {
    console.error(`Process ${processId} failed to acquire or release mutex: ${error.message}`);
    if (error.code === 'EEXIST') {
      console.error(`Process ${processId}: Lock file already exists (EEXIST) - this indicates contention.`);
    }
  }
}


// Simulate different scenarios based on command line arguments
const scenario = process.argv[2];

if (scenario === 'normal') {
  singleLockCycle();
} else if (scenario === 'single_run') { // New case for child processes
  singleLockCycle();
} else if (scenario === 'concurrent') {
  const numChildren = 3;
  console.log(`Main process ${process.pid} spawning ${numChildren} child processes for concurrent test...`);
  for (let i = 0; i < numChildren; i++) {
    const child = spawn('node', [__filename, 'single_run'], { stdio: 'inherit' });
    child.on('error', (err) => {
      console.error(`Failed to start child process ${i + 1}: ${err}`);
    });
    child.on('exit', (code, signal) => {
      console.log(`Child process ${i + 1} (PID: ${child.pid}) exited with code ${code}, signal ${signal}`);
    });
  }
  // Main process waits for a bit for children to run, then exits.
  // A more robust solution would wait for all children to complete.
  setTimeout(() => {
    console.log(`Main process ${process.pid} exiting after spawning children.`);
  }, numChildren * 2000 + 2000); // Wait roughly for children to finish

} else if (scenario === 'crash') {
  // Modified to crash while holding the lock
  (async () => {
    const processId = process.pid;
    console.log(`Process ${processId} attempting to acquire mutex for CRASH scenario.`);
    const lock = promisify(lockfile.lock);
    try {
      await lock(MUTEX_FILE, { stale: 5000, wait: 1000 }); // Short wait, rely on stale
      console.log(`Process ${processId} acquired mutex, working, then crashing...`);
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate work
      console.log(`Process ${processId} CRASHING NOW while holding lock.`);
      process.exit(1); // Crash before unlock
    } catch (error) {
      console.error(`Process ${processId} CRASH scenario: failed to acquire lock: ${error.message}`);
      process.exit(1); // Exit if lock not acquired
    }
  })();
} else if (scenario === 'terminate') {
    singleLockCycle().then(() => {
        console.log(`Process ${process.pid} acquired and released, now terminating normally.`);
        process.exit(0); // Simulate normal termination after releasing
    });
} else if (scenario === 'sigint') {
    const currentProcessId = process.pid; // Capture pid for the handler
    process.on('SIGINT', async () => {
        const unlockSignal = promisify(lockfile.unlock);
        console.log(`Process ${currentProcessId} received SIGINT, attempting to release mutex.`);
        // Check if lock file exists before attempting to unlock in signal handler
        if (fs.existsSync(MUTEX_FILE)) {
            await unlockSignal(MUTEX_FILE).catch(err => console.error(`Process ${currentProcessId} error releasing on SIGINT: ${err.message}`));
            console.log(`Process ${currentProcessId} released mutex on SIGINT.`);
        } else {
            console.log(`Process ${currentProcessId}: Mutex file not found on SIGINT, no release needed.`);
        }
        process.exit(0); // Exit after handling SIGINT
    });

    // For SIGINT test, acquire lock and hold it, relying on SIGINT handler to release
    (async () => {
      const lock = promisify(lockfile.lock);
      try {
        await lock(MUTEX_FILE, { stale: 5000, wait: 1000 }); // Acquire lock
        console.log(`Process ${currentProcessId} acquired lock for SIGINT test, holding...`);
        // Keep the process alive to receive signal
        console.log(`Process ${currentProcessId} running for SIGINT test. Send SIGINT (Ctrl+C) or wait for timeout.`);
        setTimeout(() => {
          console.log(`Process ${currentProcessId} SIGINT test timed out. Lock should still be held if no SIGINT.`);
          // If it times out, the lock is NOT released by this path, relying on staleness for next acquisition.
          // Or, we could attempt a release here if that's the desired timeout behavior.
          // For now, let timeout imply the lock remains, to test staleness if SIGINT isn't caught.
          // However, the SIGINT handler calls process.exit(0), so this timeout might not always be hit if SIGINT is sent.
          // Let's ensure the process exits cleanly on timeout.
          process.exit(0);
        }, 15000); // 15 seconds timeout
      } catch (error) {
        console.error(`Process ${currentProcessId} SIGINT scenario: failed to acquire lock: ${error.message}`);
        process.exit(1);
      }
    })();
} else if (scenario === 'rapid') {
    async function rapidCycles() {
        for (let i = 0; i < 5; i++) { // Reduced cycles for faster test
            console.log(`Rapid cycle ${i + 1} starting...`);
            await singleLockCycle();
            await new Promise(resolve => setTimeout(resolve, 20)); // Shorter delay
        }
        console.log('Rapid cycles complete.');
    }
    rapidCycles();
} else {
  console.log('Usage: node test_mutex.js [normal|single_run|concurrent|crash|terminate|sigint|rapid]');
}

// Clean up mutex file on exit for scenarios that don't handle it
process.on('exit', () => {
    if (fs.existsSync(MUTEX_FILE)) {
        // In a real scenario, proper-lockfile should handle this on clean exit
        // This is just for ensuring cleanup in test scenarios that might not exit cleanly
        // console.log(`Process ${process.pid} cleaning up mutex file on exit.`);
        // fs.unlinkSync(MUTEX_FILE);
    }
});

// Ensure the mutex is released on unexpected exits as well for testing
process.on('uncaughtException', async (err) => {
    // Promisify for signal handlers too
    const unlockSignal = promisify(lockfile.unlock);
    console.error(`Process ${process.pid} caught uncaught exception: ${err.message}`);
    // Check if lock file exists before attempting to unlock
    if (fs.existsSync(MUTEX_FILE)) {
        await unlockSignal(MUTEX_FILE).catch(e => console.error(`Process ${process.pid} error releasing on uncaughtException: ${e.message}`));
    }
    process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
    // Promisify for signal handlers too
    const unlockSignal = promisify(lockfile.unlock);
    console.error(`Process ${process.pid} caught unhandled rejection: ${reason}`);
    // Check if lock file exists before attempting to unlock
    if (fs.existsSync(MUTEX_FILE)) {
        await unlockSignal(MUTEX_FILE).catch(e => console.error(`Process ${process.pid} error releasing on unhandledRejection: ${e.message}`));
    }
    process.exit(1);
});