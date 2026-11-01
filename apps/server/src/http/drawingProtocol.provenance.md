# #807: Whole-client material-3 cutover

The renderer revision is compatibility DATA, never identity, authorization,
resource admission, or a server/engine publication receipt. The client advertises
one supported exact revision on the socket handshake and every canonical HTTP
restore/upload request, including direct binary snapshot reads.

The server captures the source policy once at construction. Enabling primary
texture requires a nonrolling restart of the ONE room backend, with revision
checking active before the first V3 BEGIN. The restart retires all old sockets
and their read grants. Keep that requirement enabled while V3 history exists;
rolling back only the policy while retaining V3 rooms is not a supported cutover.
Do not turn the source option on dynamically or merely gate future authors.

Socket middleware rejects incompatible readers before identity resolution,
seating, loading, or grants. Independent REST history/snapshot lanes reject with
426 before body parsing/handlers; successful immutable snapshot responses vary
by the revision header. Catalog, authentication, and bitmap previews do not
execute new material. Existing identity/content authorization still runs after
compatibility admission. Default source policy is OFF and preserves old traffic.

A newly built client receiving the terminal error disables both Socket.IO's
manager reconnection and the page's custom revival, locks drawing, invalidates
reads, and offers an explicit reload. It never reloads automatically or clears
unsent operations. Older deployed clients may lack the friendly notice, but
cannot obtain new socket/HTTP history from a backend requiring revision 3.

Evidence: drawingProtocol.test.ts uses real Fastify injection, malformed/absent
revisions and independent upload/history paths; socketHandlers.test.ts uses a
real Socket.IO transport; roomSocket/socketRevival tests verify terminal state;
API and snapshotRestore tests cover both request paths. These do not prove
whole-editor V3 rendering, cross-GPU equivalence, or device responsiveness.
