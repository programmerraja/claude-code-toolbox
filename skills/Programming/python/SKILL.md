## Python Efficiency Checklist

### 1. Start with correctness
- Use clear names and focused functions.
- Follow PEP 8 and type hints where they improve maintenance.
- Add tests before optimizing.
- Use `cProfile`, `time`, `tracemalloc`, or benchmark tools to find real bottlenecks.
- Don’t optimize code until a benchmark proves it is slow.

### 2. Choose the right data structure
- **Membership testing:** use `set` or `frozenset`, not repeatedly searching a list.
- **Key/value lookup:** use `dict`.
- **Append and pop from the end:** use `list`.
- **Frequent insert/remove at both ends:** use `deque`.
- **Unique and order-independent values:** use `set`.
- **Immutable sequence:** consider `tuple`.
- **Large text built repeatedly:** use `"".join(parts)`, not repeated `+=`.

### 3. Avoid repeated work
- Move constant work outside loops.
- Cache repeated function calls or expensive calculations.
- Reuse a regex compiled with `re.compile()`.
- Use `functools.lru_cache` or `functools.cache` only for genuinely cacheable pure functions.
- Avoid recalculating `len()`, attribute values or method calls in a tight loop.

```python
# Avoid
for item in items:
    result.append(process(item))

# Prefer if process() is expensive only for certain items
for item in eligible_items:
    result.append(process(item))
```

### 4. Use local variables and built-ins
- CPython local-variable access is faster than repeated global or attribute lookup.
- Prefer built-in functions such as `sum()`, `any()`, `all()`, `min()`, `max()`, `sorted()`, `enumerate()` and `zip()`.

```python
# Less efficient
for i in range(len(items)):
    print(i, items[i])

# More efficient
for i, item in enumerate(items):
    print(i, item)
```

### 5. Prefer comprehensions when they improve clarity
- Use list, dict and set comprehensions for simple transformations.
- Avoid deeply nested comprehensions.
- Use `map()` or `filter()` only if they are clearer or faster in context.

```python
# Clear and usually efficient
names = [item.name for item in items if item.active]
```

### 6. Be careful with loops
- Use `break` to stop early.
- Avoid checking each item separately when vectorized or built-in operations exist.
- Don’t modify a list, set or dict while iterating over it.
- Use a copy or a separate result collection when values change.

```python
result = []
for item in items:
    if item.valid:
        result.append(item.value)
```

### 7. Use context managers and resources
- Use `with` for files, locks, sockets and database connections.
- Close resources explicitly or let a context manager close them.
- Stream large files instead of reading everything into memory.

```python
with open("data.txt", encoding="utf-8") as file:
    for line in file:
        process(line)
```

### 8. Avoid unnecessary allocations
- Avoid creating temporary lists when a generator is sufficient.
- Don’t convert iterables to lists unless indexing or reuse requires it.
- Reuse immutable objects where practical.
- Use slices carefully; slicing creates a new object.
- Prefer tuple unpacking and generator expressions for short-lived values.

```python
# Generator; no intermediate list is allocated
sum(value * 2 for value in values)
```

### 9. Handle exceptions efficiently
- Exceptions should represent exceptional cases, not normal control flow.
- Catch specific exceptions.
- Put exception handling around only the potentially failing operation.

```python
try:
    value = mapping[key]
except KeyError:
    value = default
```

If there can be many misses, sometimes `dict.setdefault()` or `defaultdict` is better.

### 10. Avoid common string costs
- Join strings instead of repeatedly concatenating.
- Use f-strings for readable formatting.
- Use prefix/suffix checks and membership efficiently.
- Avoid parsing or splitting the same text repeatedly.
- Normalize text once if it must be reused.
- Use `bytes` only when binary data is intentional.

```python
text = "".join(parts)
```

### 11. Optimize I/O
- Batch database writes or reads.
- Use connection pools for database or network resources.
- Avoid holding large resources inside loops.
- Use buffering for repeated file operations.
- Do not perform network requests in nested loops unless necessary.

### 12. Control concurrency correctly
- Use threading for I/O-bound tasks.
- Use multiprocessing for CPU-bound parallel work.
- Don’t assume threading will speed up Python CPU calculations in a standard GIL build.
- Use async I/O for high-concurrency network or file tasks.
- Protect shared mutable state with locks or synchronization primitives.
- Prefer queues and messages over shared mutable objects.
- Don’t create one lock or thread unnecessarily for every small operation.

### 13. Avoid unsafe or slow patterns
- Avoid global mutable state.
- Avoid excessive reflection or dynamic `exec`.
- Avoid repeated `import` calls inside loops.
- Don’t use mutable defaults:

```python
# Avoid
def add(item, items=[]):
    ...
```

```python
# Prefer
def add(item, items=None):
    if items is None:
        items = []
```

- Avoid shallow assumptions about object copy behavior.
- Avoid long chains of attribute lookup when used repeatedly.

### 14. Memory management
- Remove large references when no longer needed.
- Use generators for large sequences.
- Be cautious with caches—they can grow indefinitely.
- Use weak references for optional object tracking.
- Call `gc.collect()` manually only for specialized needs, not routinely.
- Avoid creating large temporary objects in comprehensions.
- Use `__slots__` only after measurement if many instances are created.

```python
class Point:
    __slots__ = ("x", "y")

    def __init__(self, x, y):
        self.x = x
        self.y = y
```

### 15. Classes and objects
- Keep classes focused and small.
- Use properties when access behavior is truly needed.
- Avoid dynamic attribute lookup in hot loops.
- Prefer composition over complex inheritance.
- Use dataclasses for simple immutable or mutable data records.
- Consider `NamedTuple` for lightweight, fixed records.

```python
from dataclasses import dataclass

@dataclass(frozen=True, slots=True)
class Point:
    x: float
    y: float
```

### 16. Generators and iterators
- Use generators for lazy processing.
- Avoid materializing a large iterator unless it must be reused.
- Remember that generators execute only when consumed.
- Close generators if they hold resources.

### 17. Debugging and safety
- Use `assert` only for internal invariants.
- Never use `assert` for input validation.
- Use explicit exceptions for bad user or API input.
- Return clear values or raise meaningful exceptions.
- Avoid catching `Exception` unless the code can handle or re-raise it correctly.
- Avoid swallowing `KeyboardInterrupt` and `SystemExit`.

### 18. Type hints
- Add annotations to public APIs and complex functions.
- Don’t spend effort annotating every trivial local.
- Prefer precise types over `Any`.
- Use `typing.Protocol` for structural interfaces.
- Run `mypy`, `pyright`, or another checker consistently.
- Type hints should describe the program, not change runtime behavior.

### 19. Testing
- Add unit tests for public behavior.
- Add regression tests for bugs.
- Benchmark before and after optimization.
- Test large inputs and boundary cases.
- Run tests under standard and free-threaded builds when relevant.
- Avoid micro-optimizations that make code harder to read without measurable benefit.

### 20. Packaging and startup
- Import only modules needed at startup.
- Use lazy imports for optional or rarely used dependencies.
- Avoid work at module import time.
- Use logging rather than print statements in libraries.
- Use a virtual environment for dependencies.
- Pin dependencies for reproducible deployments.
- Keep platform-specific code isolated.

## Practical review sequence

Before merging a performance-sensitive piece of code:

1. Is it correct and readable?
2. Are tests adequate?
3. Are data structures appropriate?
4. Are there unnecessary repeated loops or allocations?
5. Are I/O and external calls batched?
6. Are exceptions used for exceptional cases?
7. Is there actual profiling evidence showing the current bottleneck?
8. Does the optimization still make the code easier to maintain?
