# Disconnect: durable partial close

The disconnect handler retains only the socket's existing private seat while its
existing canonical tail drains, then always leaves. An immutable lexical seat
proof binds the original receiver, room/lesson records and private socket maps;
spreading or replacing the proof cannot retain authority across reconnect.

Transport captures only existing admitted V2 sessions. Its one-shot cleanup calls
the same typed-close core after durable-tail and actual indexed-prefix checks.
The internal branch derives N and first/last IDs from verified durable rows, not
live-ahead packets, lost ACKs or a fabricated END. Existing failed close receipts
repair with their original ID; zero/normal-ended sessions produce no close.
Current membership, layer permission, records, storage/operator and session
identity are checked after awaits and before publication. Failures log and leave
an open prefix for explicit recovery; they do not seal a guessed lower prefix.

Validation (host only, mocked database; no physical durability/device claim):

- New direct Transport suite: 18 tests, including deferred writes, failed-receipt
  repair, holes/tampered rows, multiple sessions, copied proof, policy and owner
  races, and private replacement-seat preservation.
- Actual HTTP/Socket.IO suite: 48 tests; abrupt disconnect, lost ACK during a
  pending write, failed query/finally-leave, last-seat eviction and same-user
  reconnect use real sockets and original seat ownership.
- Adjacent Transport/admission/browser suites plus direct disconnect: 112 tests
  across four suites, all with `--maxWorkers=2`.
- Scoped oxlint: no errors (one `no-this-alias` style warning); diff check clean.

Default startup/policies and legacy immediate-leave behavior remain unchanged.
No new registry, queue, source grant, socket event or frame relay was added.
Cold orphan recovery after a process restart is a separate reviewed unit.
