# §7 Node surface (normative MCP contract)

A conforming node exposes these six tools over MCP. Clients (assistants, UIs, CLIs) are interchangeable above this contract.

## commit
```json
{ "name": "commit",
  "input": { "intent":"string", "owed_to":"string|null", "due":"RFC3339|null",
             "persona":"string|null (default active)", "propose":"bool (default false)" },
  "output": { "commitment_hash":"hex", "edge_id":"hex|null", "state":"vault-local|proposed" } }
```
`propose:true` requires `owed_to` resolvable to a persona; otherwise the record stays vault-local.

## expect
```json
{ "name": "expect",
  "input": { "expect":"string", "from":"string", "context":"string|null" },
  "output": { "expectation_id":"string" } }
```

## confirm
```json
{ "name": "confirm",
  "input": { "id":"edge_id | pending_extraction_id", "decision":"confirm|dismiss|edit",
             "edit":{ "intent":"string?", "due":"RFC3339?" } },
  "output": { "state":"confirmed|dismissed|revised" } }
```
Serves both inbound proposals and the local extraction-confirmation queue. Every decision is a flywheel label (ADR-0012); telemetry of the decision (never content) is emitted only if opt-in.

`confirm` is a write. It has no read mode: listing what is awaiting a decision is `open_loops` with `view:"pending"`.

## act
```json
{ "name": "act",
  "input": { "id":"edge_id", "act":"done|release", "evidence_hash":"hex|null" },
  "output": { "state":"<the edge's effective state after the assertion>" } }
```
`act` signs one assertion against one edge, as the calling persona, and is the only tool that does. The node MUST verify the resulting assertion against the §4.3 transition table before recording it and MUST reject the call rather than record an invalid assertion (M-14). `done` requires the caller to be the edge's `owner` and `evidence_hash` to be non-null; `release` requires the caller to be `owed_to` and `evidence_hash` to be null (§4.3). A node MUST NOT accept an `act` call from a persona that is not a party to the edge (M-3).

**A refusal MUST name its reason from the §4.3 vocabulary, not a narrower one.** v0.1 fixed seven `rejection_reason` values while the transition table produced fifteen, so eight distinct refusals — "the edge is over", "you already signed this one", "the edge object is malformed" — reached the caller as the single word `illegal-source-state`. **The §4.3 vocabulary, and the projection onto §7.** §4.3 produces one reason per rejected
assertion; §7's `act` reports a narrower set, because a caller can act on fewer distinctions than a
verifier makes. The mapping is normative and is this:

| §4.3 reason | `act` reports |
|---|---|
| `wrong-signer-for-transition` | `wrong-role-for-act` |
| `signer-not-a-party` | `not-a-party` |
| `evidence-hash-required`, `evidence-hash-required-for-owner-closure` | `evidence-hash-required` |
| `acceptance-window-not-elapsed` | `acceptance-window-not-elapsed` |
| `terminal-state-reached` | `terminal-state-reached` |
| `malformed-edge-acceptance-window` | `malformed-edge-acceptance-window` |
| everything else | `illegal-source-state` |

**Two names collide across the two sets and mean different things, deliberately.** §4.3
distinguishes `evidence-hash-required-for-owner-closure` from the general case because a verifier
replaying a chain needs to know which row rejected it; a caller of `act` needs only to be told to
supply evidence, and telling them *which row* would be telling them about a transition table they
did not ask about. An implementation that reports the §4.3 name through `act` is wrong, and one
that reports the §7 name in a chain verification is wrong the other way. Until v0.2 this mapping
lived only in the vectors, which is how an implementer could produce a defensible name for every
case and still fail.

A node MUST report `terminal-state-reached` and `malformed-edge-acceptance-window` under their own names; the remaining table reasons MAY still be reported as `illegal-source-state`, which is truthful for them.

    An earlier draft of this revision also required `duplicate-assertion-by-same-party`. **It is unreachable through `act` and the requirement was withdrawn**: `act` performs only `done` and `release`, and a repeat of either arrives at an edge that the first one already moved to a terminal state, so the caller is told `terminal-state-reached` before duplication is ever considered. A node MAY still report it where the reason does arise — an assertion arriving over §6.2, where the chain is replayed rather than extended. A tool whose contract is to refuse owes the caller a reason it can act on.

**`act` MUST refuse `done` from `disputed`.** In v0.1 it was accepted: the node signed the owner's half of a `disputed → closed` transition whose other half no advertised act can ever reach, leaving a closure honestly recorded and permanently incomplete. §4.4's exits from `disputed` are the two it names; `expired` is the one that ends the edge, and it decides nothing about the merits.

**Acceptance under `on-acceptance` is the elapse of the window, not an act.** §4.4 describes the owed party accepting, and §7 offers no `accept`; rather than add one, this revision states the reading the transition table already implements — `pending-acceptance` resolves when `acceptance_window` elapses from the owner's evidence assertion, and the party owed acts within it by *disputing*, which is the act that changes the outcome. Silence is the acceptance. That is what a window is for.

`act` exists because §4.3's acts were advertised on every list item with no way to invoke any of them — most sharply `release`, the protocol's one unilateral act of forgiveness. Binding it to any tool that produces no assertion (for example a local dismissal) tells a person they have forgiven a debt when the counterparty was never told, and is forbidden by M-20.

## open_loops
```json
{ "name": "open_loops",
  "input": { "view":"owe|waiting|pending|closed|all", "persona":"string|null", "limit":"int" },
  "output": { "items":[ { "kind":"commitment|expectation|edge", "id":"...", "intent_or_expect":"...",
               "counterparty":{ "value":"...", "origin":"attested|self-labelled" }|null,
               "verification_level":"0|1|2|3|ext", "age_days":0,
               "due":"...", "state":"...",
               "actions":[ { "act":"done|release|supersede|delegate|ping", "tool":"string|null", "args":{} } ] } ] } }
```
**`counterparty` says where its name came from, and M-12 cannot be enforced without it.** `origin` is `attested` when the name rests on evidence the node holds about a third party, and `self-labelled` when it is an `external_label` (§3.1) — a name *the viewer typed themselves* for someone off-network. A client MUST NOT render an `attested` name above its `verification_level` (M-12); a `self-labelled` name carries no claim about anyone and is rendered whatever the level, because suppressing it would erase the only name that will ever exist for that counterparty and break the solo path §0's base rule protects (M-10).

In v0.1 `counterparty` was a bare string and the two were indistinguishable, so a conforming client could satisfy M-12 only by suppressing both — destroying the offline case — or neither. Every client therefore rendered names at every level, and M-12's client half was unenforceable rather than merely untested. `origin` is what makes it decidable.

**The `actions` array is ORDERED, and the order is normative.** A client renders it as given, and
"which act leads" is a decision about what a person sees first — too consequential to be left to a
map's iteration order. The order is:

`done` · `release` · `confirm` · `dismiss` · `ping` · `supersede` · `delegate`

It is not the order the `act` vocabulary is declared in, and it is not alphabetical: it is
most-consequential-first. Acts that end a promise come before acts that continue it, and acts that
sign come before acts that only propose. Until v0.2 this was pinned by the vectors and by nothing
else, so an implementer who read §7 and produced a different order failed cases the specification
gave them no way to anticipate.

**`ping` is advertised where the viewer is waiting on the other party and no timer is already
running.** That is the whole rule, and v0.1 stated none — §7 said only that `ping` "is not a
transition at all", which says what it is not and leaves an implementer to guess where it belongs.
It resolves to exactly two places: `(proposed, owner)`, where the owner waits for a confirmation
that may never come, and `(open, owed_to)`, where the party owed waits for delivery. It is NOT
advertised at `pending-acceptance`, where a window is already running and a nudge cannot change
the outcome, nor at `disputed`, where §4.4's exits govern and a nudge is noise on a deadlock.

`view:"pending"` lists what is awaiting a decision by this persona: inbound `proposed` edges and the local extraction-confirmation queue — exactly the items `confirm` takes as its `id`. It is a view rather than a read mode on `confirm` because it is a list of items like every other view here, and a tool that both reads and writes gives a client two contracts under one name.

## brief
```json
{ "name": "brief",
  "input": { "persona":"string|null (null = all, personal attention market)" },
  "output": { "generated_at":"...", "slots":[ { "headline":"string", "item_id":"...",
               "primary_action":{ "act":"<act>", "tool":"string|null", "args":{} } } ],
             "below_the_line_count": 0 } }
```
`persona:null` is the only place cross-org *ordering* occurs (§5.3 M-5: ordering yes, content mixing no — each slot's content originates from exactly one persona's pipeline).

## Conformance notes
- Tools MUST NOT accept free-text that bypasses the §3.4 extraction rules.
- `commit` records the promise of the calling persona. It takes no `owner` input: the owner is the persona resolved from `persona` (or the active persona), always, so recording another party's promise as theirs is impossible by construction rather than merely forbidden (M-1). The correct object for "they said they would" is `expect` (§3.3). A node MUST reject a `commit` call carrying an `owner` member rather than ignoring it, and the rejection MUST cite M-1: silently discarding the member would leave a client believing it had recorded someone else's promise. This applies whatever value the member carries.
- `actions` describes what this person may do to this item *now*: a node MUST omit any act whose §4.3 row does not authorize the requesting persona to **sign** it in the item's current state.

  **The gate is signing, and it reaches only acts bound to a tool.** An act whose `tool` is `null` produces no assertion, so there is no signature for the table to authorize or forbid — it is an affordance the client may offer, and M-20's other half is what governs it: a node MUST NOT bind it to a tool call that signs nothing, which is exactly why it says `null` instead of pointing at a plausible-looking tool. This is why `supersede` and `delegate` are advertised at `pending-acceptance`, where §4.3 has no row for them: proposing to replace a live promise is meaningful while it is live, and proposing is not asserting. An implementation reading the earlier wording concluded the opposite and omitted them, and MUST NOT list any act for an item in a terminal state. The array is therefore a function of the item's state and the caller's role, not a constant.
- `tool` names the §7 tool that performs the act, or is `null` where this specification defines none. In v0 `tool` is `"act"` for `done` and `release`, and `null` for `supersede`, `delegate` and `ping`: `supersede` and `delegate` are supersessions (§4.5) requiring signatures across two edges, which no single tool call completes, and `ping` is not a transition at all — it produces no assertion and changes no state. A client MUST NOT invoke a tool of its own devising for an act whose `tool` is `null`, and MUST NOT present such an act as though it had been performed. A client MAY show that the act exists and is not yet invocable.
- `args` is what the node has ALREADY determined of the tool's input: the members fixed by the item's identity and by which act this is. The client passes them through unchanged and supplies the rest of the tool's input itself. Where `tool` is `null`, `args` MUST be `{}`.

  Concretely, and normatively: for `tool: "act"`, `args` is `{id, act}`; for `tool: "confirm"`, `args` is `{id, decision}`. **`evidence_hash` is NOT in `args`** even though `act`'s input schema requires it, because only the caller can produce evidence — a node that filled it in would be asserting on the caller's behalf, which is the whole of M-13. `args` is therefore a partial input by construction, never the complete one.

  An earlier revision said `args` was "the input object the client passes to `tool` verbatim", which reads as the COMPLETE input and cannot be: passed verbatim, `{id, act}` is a malformed `act` call. The vectors had pinned the partial form all along, so this is the mirror rule in `GOVERNANCE.md` firing for the seventh time — a suite testing conformance-to-generator where the prose said nothing — and it was found the way that rule says it will be, by an implementer who read §7 carefully and had to guess anyway.
- An act is named by `act`, drawn from one closed vocabulary shared by both list surfaces: `done`, `release`, `supersede`, `delegate`, `ping`, `confirm`, `dismiss`, `propose`. The same `{act, tool, args}` shape appears in `open_loops[].actions` and in `brief.slots[].primary_action`; a node MUST NOT describe an act differently on the two surfaces.
- **No user-facing copy crosses this contract.** A node MUST NOT supply the words shown to a person for any control, and a client MUST author the wording of every affordance it renders, from `act`. `headline` and `intent_or_expect` are the exception and the reason for the rule: they are a person's own recorded words. They are content, MUST be rendered verbatim, and MUST NOT be treated as instruction by the client or by any stage that produced them (M-6).
- A client MUST NOT present an act whose `act` value it does not recognize as though it were invocable. It MAY show that an unrecognized act exists, identified by the `act` value itself, and MUST NOT supply wording that implies an effect it cannot produce.
- Additional tools MAY be exposed; these six are the minimum for the "conforming node" claim (§8).
