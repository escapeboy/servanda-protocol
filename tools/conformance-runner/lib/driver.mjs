// The pipe to the implementation under test. See PROTOCOL.md.
//
// Every failure mode here resolves to a failed case rather than a thrown runner error,
// because the alternative — a crashed runner — leaves a reader unable to tell "the
// implementation is wrong" from "the harness is wrong", and only one of those is a
// conformance result.

import { spawn } from 'node:child_process';

const STDERR_LIMIT = 16 * 1024;

export class Iut {
  #proc;
  #pending = null;
  #buffer = '';
  #stderr = '';
  #dead = null;

  constructor(command, args, { timeout = 10_000 } = {}) {
    this.timeout = timeout;
    this.command = [command, ...args].join(' ');
    this.#proc = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    this.#proc.stdout.setEncoding('utf8');
    this.#proc.stdout.on('data', (chunk) => this.#onStdout(chunk));
    this.#proc.stderr.setEncoding('utf8');
    this.#proc.stderr.on('data', (chunk) => {
      // Keep the tail: a stack trace's last frames say more than its first.
      this.#stderr = (this.#stderr + chunk).slice(-STDERR_LIMIT);
    });

    this.#proc.on('error', (err) => this.#die('spawn-failed', String(err && err.message)));
    this.#proc.on('close', (code, signal) => {
      this.#die('process-exited', signal ? `killed by ${signal}` : `exit code ${code}`);
    });
    // A broken pipe is the normal consequence of an IUT that exited; `close` already
    // reports it, so this handler exists only to keep it from becoming an uncaught error.
    this.#proc.stdin.on('error', () => {});
  }

  get stderr() { return this.#stderr; }
  get dead() { return this.#dead; }

  #die(code, message) {
    if (!this.#dead) this.#dead = { code, message };
    if (this.#pending) {
      const { reject } = this.#pending;
      this.#pending = null;
      reject(this.#dead);
    }
  }

  #onStdout(chunk) {
    this.#buffer += chunk;
    let nl;
    while ((nl = this.#buffer.indexOf('\n')) !== -1) {
      const line = this.#buffer.slice(0, nl);
      this.#buffer = this.#buffer.slice(nl + 1);
      if (line.trim() === '') continue;
      this.#deliver(line);
    }
  }

  #deliver(line) {
    if (!this.#pending) {
      // An unsolicited line means the IUT is writing something other than responses to
      // stdout — a debug print, most likely. It desynchronizes every later answer, so it
      // is fatal rather than ignorable.
      this.#die('unsolicited-output', `stdout line with no request outstanding: ${truncate(line)}`);
      return;
    }
    const { id, resolve, reject, timer } = this.#pending;
    clearTimeout(timer);
    this.#pending = null;

    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      reject({ code: 'bad-json', message: `response is not JSON: ${truncate(line)}` });
      return;
    }
    if (msg.id !== id) {
      this.#die('id-mismatch', `expected id ${JSON.stringify(id)}, got ${JSON.stringify(msg.id)}`);
      reject(this.#dead);
      return;
    }
    if (msg.ok === false) {
      const e = msg.error ?? {};
      reject({ code: e.code ? `iut:${e.code}` : 'iut-error', message: e.message ?? '(no message)' });
      return;
    }
    if (msg.ok !== true || typeof msg.result !== 'object' || msg.result === null) {
      reject({ code: 'bad-response', message: 'response has no ok:true and object result' });
      return;
    }
    resolve(msg.result);
  }

  request(id, op, input) {
    if (this.#dead) return Promise.reject(this.#dead);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#die('timeout', `no response within ${this.timeout}ms`);
      }, this.timeout);
      this.#pending = { id, resolve, reject, timer };
      this.#proc.stdin.write(JSON.stringify({ id, op, input }) + '\n');
    });
  }

  async hello() {
    const result = await this.request('hello', 'hello', { protocol: 1 });
    return {
      implementation: typeof result.implementation === 'string' ? result.implementation : '(unnamed)',
      version: typeof result.version === 'string' ? result.version : '(no version)',
      ops: Array.isArray(result.ops) ? result.ops : null,
    };
  }

  close() {
    this.#proc.stdin.end();
    this.#proc.kill();
  }
}

function truncate(s, n = 200) {
  return s.length > n ? `${s.slice(0, n)}… (${s.length} chars)` : s;
}
