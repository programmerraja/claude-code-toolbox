# Flow-Based Unit Tests

A unit test exists to catch a broken feature. If the feature breaks and the test still passes, the test is worthless. If the code is refactored without changing behavior and the test fails, the test is noise. Every rule below follows from that.

## Core principles

1. **Test the flow, not the function.** Run the real code path end to end (A → B → ... → H) through the entry point (service method, handler, use case).
2. **Mock boundaries only, never our own functions.** Mock the DB, third-party APIs, HTTP clients, queues, email/SMS, file system, clock and randomness. Everything we wrote runs for real.
3. **Assert outcomes, not calls.** Check what the flow produced: return value, thrown error, data written to the DB, payload sent to the third party, events emitted. Do not assert that internal helper X was called with Y.
4. **Every test must be able to fail for a real reason.** No tests written only to raise coverage.
5. **Every fixed bug gets a test that would have caught it.**

## Step 1: Map the flow before writing anything

Read the code and write down:

- The entry point and the steps it goes through (A → H).
- Every branch: validations, if/else, early returns, loops, retries, error handlers.
- Every boundary the flow touches (DB reads/writes, external APIs, queues, time).
- How each boundary can behave: success, empty, not found, error, timeout, slow, malformed data, duplicate.

Each meaningful path through this map becomes one test case.

## Step 2: Structure (it may vary by framework)

- One `describe` per flow (or per entry point).
- One `it` per scenario/path. The name states the situation and the expected outcome:
  - Good: `it('refunds the order and marks it REFUNDED when payment gateway confirms')`
  - Bad: `it('should call refundPayment')`
- Nested `describe` is fine for grouping (e.g. `describe('when payment gateway fails')`).
- Arrange / Act / Assert in every test, clearly separated.

Typical scenario list for a flow:

- Happy path(s)
- Each validation failure
- Each business-rule branch (status checks, permissions, limits)
- Each boundary failure mode that the code handles (or should handle)
- Idempotency / duplicates / retries if relevant
- Edge data: empty lists, nulls, zero, max values, unicode, time zones

## Step 3: Mocking rules

Mock at the outermost layer we do not own:

| Mock | Do not mock |
|---|---|
| DB client / repository driver (or use an in-memory/test DB) | Our services, helpers, mappers, validators |
| HTTP client / SDK of third party | Our business logic modules |
| Queue / pub-sub client | Our domain functions |
| Clock (`Date.now`, timers), random/UUID | Pure utility functions |
| Email / SMS / push providers | |

Prefer an in-memory or containerized test DB when cheap; it catches query and mapping bugs that a mocked repo hides.

Make mocks realistic: return the same shape the real dependency returns (copy from real responses, including optional/null fields).

## Step 4: What to assert

Assert, in order of value:

1. The returned result or thrown error (type + message/code).
2. Final state in the DB (what was inserted/updated/not touched).
3. What was sent across a boundary: the request payload to the third party, the message put on the queue. Asserting boundary calls is fine; they are the observable output of the flow.
4. Things that must NOT happen (no charge made, no email sent, no DB write) on failure paths.

Avoid:

- `expect(internalHelper).toHaveBeenCalledWith(...)`
- Snapshot of huge objects nobody reads
- Asserting only that "no error was thrown"

## Step 5: When a separate focused test is OK

Write a standalone test for a function only when:

- It has complex logic with many input combinations (calculations, parsers, rule engines) that would explode the flow test count.
- A branch cannot reasonably be reached through the flow but still matters.

Even then, test it through its real inputs/outputs, not through mocks of its collaborators.

## Step 6: Skip tests that make no sense

Do not write tests for:

- Trivial getters/setters, plain DTOs, constant files
- Framework wiring with no logic
- Code paths that just pass through to a mock and assert the mock was called

If a coverage gap remains, either the code is dead (delete it) or a real scenario is missing (add that scenario).

## Bug-fix workflow (mandatory when fixing a bug)

1. **Reproduce in a test first.** Write the failing test in the relevant flow `describe` before touching the fix.
2. **Ask: why did existing tests not catch it?** Classify the reason:
   - Scenario never tested (missing branch / edge data)
   - Over-mocking: our own function was mocked, so the bug was hidden
   - Boundary failure mode never simulated (third party failed in a specific way)
   - Unrealistic mock data (shape differed from real response)
   - Timing / ordering / concurrency issue
   - Genuinely not catchable by a unit test (then note why, and consider an integration test)
3. **Simulate the real-world cause.** Make the boundary behave exactly as it did in production, for example:
   - Third party returns 500, 429 (rate limit), 4xx with an unusual body
   - Timeout or very slow response
   - Success status but malformed / partial / missing-field body
   - Webhook or message delivered twice or out of order
   - DB returns empty, duplicate key error, or a stale record
   - Clock at month end, DST change, different time zone
   - Partial failure: step D succeeds, step E fails (is state left consistent?)
4. **Confirm the test fails without the fix and passes with it.** A test that passes both ways does not protect anything.
5. **Fix the weak spot, not just the case.** If over-mocking hid the bug, remove the mock in related tests too. If mock data was unrealistic, fix the shared fixture.
6. **Name it clearly**, optionally referencing the ticket: `it('does not double-charge when gateway webhook is delivered twice (BUG-1234)')`.

## Boundary failure-mode checklist

For each external dependency in the flow, consider:

- [ ] success
- [ ] not found / empty
- [ ] error response (4xx, 5xx)
- [ ] timeout / network error
- [ ] malformed or partial data
- [ ] duplicate / repeated delivery
- [ ] rate limiting / retry exhausted

Only write the ones the code handles or should handle. If the code does not handle one that can realistically happen, flag it.

## Test hygiene

- Deterministic: freeze time, seed randomness, no real network.
- Independent: each test sets up its own data; reset mocks/DB between tests.
- Use small data builders/factories with sensible defaults; override only what the test cares about.
- Keep setup readable: someone should understand the scenario from the `it` name and the Arrange block.
- Fast: if the suite is slow, fix the slow boundary, do not start mocking our own code.

## Example (Jest / TypeScript)

```ts
describe('refundOrder flow', () => {
  let db: TestDb;
  let paymentGateway: jest.Mocked<PaymentGatewayClient>;
  let service: OrderService; // real service, real helpers

  beforeEach(async () => {
    db = await createTestDb();
    paymentGateway = { refund: jest.fn() } as any;
    service = new OrderService(db, paymentGateway);
  });

  it('refunds and marks order REFUNDED when gateway confirms', async () => {
    const order = await db.orders.insert(buildOrder({ status: 'PAID', amount: 500 }));
    paymentGateway.refund.mockResolvedValue({ id: 'rf_1', status: 'succeeded' });

    const result = await service.refundOrder(order.id);

    expect(result.status).toBe('REFUNDED');
    expect((await db.orders.find(order.id)).status).toBe('REFUNDED');
    expect(paymentGateway.refund).toHaveBeenCalledWith({ chargeId: order.chargeId, amount: 500 });
  });

  it('rejects refund for an order that is not PAID and does not call gateway', async () => {
    const order = await db.orders.insert(buildOrder({ status: 'PENDING' }));

    await expect(service.refundOrder(order.id)).rejects.toThrow('ORDER_NOT_REFUNDABLE');
    expect(paymentGateway.refund).not.toHaveBeenCalled();
  });

  describe('when payment gateway fails', () => {
    it('keeps order PAID and records failure on timeout', async () => {
      const order = await db.orders.insert(buildOrder({ status: 'PAID' }));
      paymentGateway.refund.mockRejectedValue(new TimeoutError());

      await expect(service.refundOrder(order.id)).rejects.toThrow('REFUND_FAILED');
      expect((await db.orders.find(order.id)).status).toBe('PAID');
    });

    // Regression: gateway returned 200 with status 'pending', we marked REFUNDED (BUG-1234)
    it('marks order REFUND_PENDING when gateway returns pending status', async () => {
      const order = await db.orders.insert(buildOrder({ status: 'PAID' }));
      paymentGateway.refund.mockResolvedValue({ id: 'rf_2', status: 'pending' });

      await service.refundOrder(order.id);

      expect((await db.orders.find(order.id)).status).toBe('REFUND_PENDING');
    });
  });
});
```

## Review checklist before finishing

- [ ] Flow mapped; every meaningful branch has a scenario
- [ ] Only DB / third-party / time / randomness mocked
- [ ] Assertions are on outcomes and boundary payloads, not internal calls
- [ ] Failure paths assert what must NOT happen
- [ ] Mock data matches real response shapes
- [ ] No coverage-only tests
- [ ] For bug fixes: test fails without fix, passes with it, and the reason the bug slipped through is addressed