Here’s a **senior-level asyncio checklist** focused on the failure modes and performance traps that tend to appear in real services—not just syntax.

## 1. Start with the right execution model

- [ ] **Treat each event loop as a single-threaded scheduler.** A task runs until it returns, raises, or actually suspends at an `await`.
- [ ] **Don’t assume every `await` yields.** Awaiting an already-completed Future or coroutine can continue immediately. A loop with many “async” calls that complete synchronously can still starve other work.
- [ ] **Keep CPU-heavy work off the loop thread.** `async def` does not make CPU work non-blocking. Use a process pool for CPU-bound Python work when parallelism is needed; use threads for blocking I/O or APIs that release the GIL.
- [ ] **Find hidden blocking calls.** Common culprits include synchronous logging handlers, file access, DNS or database libraries, compression, and locks from `threading`.
- [ ] **Use one loop owner per thread.** Don’t call `asyncio.run()` inside a running loop, and don’t pass asyncio Futures or Tasks between loops. Use `asyncio.to_thread()` or `loop.call_soon_threadsafe()` when crossing the thread boundary.

A useful review question is: **“What precisely causes this operation to suspend, and what wakes it up?”** If there’s no convincing answer, it may block the loop or fail to yield.

## 2. Bound concurrency and memory

- [ ] **Bound work at admission, not only while processing.** Creating a million tasks and putting a semaphore inside each task still creates a million tasks.
- [ ] For large or unbounded input streams, use a **bounded `asyncio.Queue` and a fixed number of worker tasks**. The queue’s `maxsize` gives producers backpressure.
- [ ] Put explicit limits on:
  - concurrent requests,
  - connections per host,
  - queued work,
  - response/body sizes,
  - retries and total request duration.
- [ ] **Avoid unbounded `gather()` on user-controlled or large collections.** It eagerly schedules all supplied coroutines and can cause memory spikes, connection storms, or rate-limit violations.
- [ ] Reuse long-lived clients and connection pools. Creating a new HTTP/database client per operation often defeats pooling and adds setup overhead.
- [ ] Consider fairness and overload behavior: decide whether the system should queue, reject, shed load, or degrade when saturated.

**Important:** a semaphore limits entry to a section; it does not limit how many waiting Tasks you’ve already created.

## 3. Use structured concurrency and make failures visible

- [ ] Prefer **`asyncio.TaskGroup`** for related child tasks. It gives the parent a clear lifetime boundary and propagates child failures.
- [ ] Use `gather()` when its semantics are intended: by default, the first exception is propagated, but other child operations may continue running. Don’t assume it always cancels every sibling.
- [ ] Don’t fire-and-forget tasks without a lifecycle plan. Keep a strong reference, observe exceptions, and decide who cancels and joins them. Better, place background work under a TaskGroup or dedicated supervisor.
- [ ] Treat cancellation as normal control flow:
  - use `try/finally` for cleanup;
  - normally re-raise `CancelledError` after cleanup;
  - don’t catch and silently discard `BaseException`;
  - don’t use `shield()` casually—it changes who cancellation affects and can leave work running.
- [ ] Don’t swallow cancellation in a worker and then assume shutdown will be prompt. Every cancellation-resistant operation needs a deliberate reason and a bound on how long it may run.
- [ ] Log or surface exceptions from background tasks; “Task exception was never retrieved” is a production observability failure, not harmless noise.

## 4. Set deadlines and retries deliberately

- [ ] Give operations **deadlines**, not just per-step timeouts. A request may spend time in a queue, wait for a connection, perform I/O, and retry; each part consumes the same end-to-end budget.
- [ ] Prefer `asyncio.timeout()` / `timeout_at()` when you want a deadline around a block of work.
- [ ] Understand that `asyncio.wait_for()` cancels the awaited operation on timeout and waits for cancellation to finish. A coroutine that delays or suppresses cancellation can make the observed timeout exceed the requested duration.
- [ ] Make retries:
  - bounded by attempts **and** the overall deadline;
  - limited to transient failures;
  - jittered to avoid synchronized retry storms;
  - safe for the operation being retried (idempotency matters).
- [ ] Don’t retry cancellation, validation errors, or permanent failures.
- [ ] Avoid stacking independent timeouts without understanding which scope cancels which task.

## 5. Preserve backpressure in network code

- [ ] For Streams, pair writes with `await writer.drain()` when appropriate. `write()` can buffer data; skipping `drain()` in a sustained producer can grow memory without bound.
- [ ] Set and monitor transport or application-level buffer limits for high-volume connections.
- [ ] Don’t create a task for every message merely to parallelize handling. Bound the work queue and worker count.
- [ ] Use connection pools and sensible pool limits; a large number of coroutines waiting for a small pool is still a large number of tasks and retained request objects.
- [ ] Remember that DNS resolution can use the loop’s default executor. Saturating that executor with unrelated blocking work can make connection establishment unexpectedly slow.
- [ ] Account for slow consumers, partial writes, peer disconnects, and cancellation during reads/writes. Test these paths, not just the successful fast path.

## 6. Keep the loop responsive and fair

- [ ] Break long CPU loops into bounded chunks **only if** doing so is safe and necessary. `await asyncio.sleep(0)` can yield, but it’s not a substitute for moving substantial CPU work off-loop.
- [ ] Avoid callbacks or task steps that do large amounts of work before yielding.
- [ ] Check whether an awaited operation can complete immediately in a tight loop. If so, add an intentional scheduling boundary only when measurements or responsiveness requirements justify it.
- [ ] Keep synchronous work in callbacks short too; callbacks execute on the event-loop thread.
- [ ] Be cautious with locks held across long awaits. Sometimes that is required for correctness, but it can serialize unrelated work and amplify latency. Keep the protected region as narrow as the invariants allow.

## 7. Optimize only after measuring

- [ ] Establish a representative baseline: throughput, p50/p95/p99 latency, CPU, memory, queue depth, active tasks, connection-pool wait time, and error rate.
- [ ] Profile the actual workload. In async services, high latency often comes from blocking calls, queueing, connection-pool starvation, or downstream services—not the scheduler itself.
- [ ] Use `asyncio` debug mode in development and tests to catch slow callbacks, wrong-thread API use, and resource leaks. It adds overhead, so don’t treat debug-mode numbers as production performance.
- [ ] Add tracing/metrics around queue wait, pool wait, network time, processing time, and total deadline. “Request took 5 seconds” is not enough to identify where it waited.
- [ ] Don’t switch event loops or add task-level micro-optimizations without end-to-end benchmarks. Alternative loops such as `uvloop` can help particular workloads, but compatibility and the actual bottleneck matter.
- [ ] Avoid excessive task creation for tiny units of work. Task scheduling has overhead; batching small operations may outperform spawning a task for each one.
- [ ] Keep `contextvars` propagation in mind in very high-volume task/callback paths; context is useful for tracing and request metadata, but copying and managing context is not free. Measure before changing it.

## 8. Make shutdown and resource ownership explicit

- [ ] Close async clients, streams, and other resources with context managers or explicit `finally` cleanup.
- [ ] On shutdown, stop accepting new work first, then drain or reject queued work according to policy, cancel remaining tasks, and wait for them to finish.
- [ ] Give shutdown a deadline. “Cancel everything” is not sufficient if tasks block or suppress cancellation.
- [ ] Close asynchronous generators and executors when the application owns the loop. `asyncio.run()` handles this lifecycle; manually managed loops require more care.
- [ ] Handle signals at the application boundary and turn them into a controlled shutdown sequence rather than abrupt termination.
- [ ] Don’t keep using a loop after it has been closed, and don’t rely on garbage collection to close transports or clients.

## 9. Test the hard cases

- [ ] Test cancellation while waiting for a lock, queue item, socket read, and downstream response.
- [ ] Test a downstream that is slow, never responds, responds just before the deadline, or disconnects mid-operation.
- [ ] Test queue saturation, pool exhaustion, burst traffic, and shutdown with work in flight.
- [ ] Test that one failing child task produces the intended behavior for its siblings and parent.
- [ ] Turn on asyncio debug mode in at least some CI or test runs; check for pending-task and unclosed-resource warnings.
- [ ] Make tests deterministic where possible: avoid arbitrary sleeps as synchronization. Use Events, Queues, Futures, and explicit barriers.

## A compact code-review checklist

For every async operation, ask:

1. **Can any code on the loop thread block?**
2. **What bounds the number of tasks, queued items, open connections, and buffered bytes?**
3. **Who owns this task, and who observes its exception?**
4. **What happens if cancellation arrives here?**
5. **What is the end-to-end deadline, including queueing and retries?**
6. **Can the awaited operation complete immediately and starve other tasks?**
7. **Does this code propagate backpressure to its producer?**
8. **How does shutdown stop and join it?**
9. **Which metric or profile would prove this is the bottleneck?**

A good rule of thumb: **optimize for bounded work, visible ownership, and prompt cancellation first; optimize scheduler overhead only after profiling shows it matters.**