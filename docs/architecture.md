# Farm-E architecture and workflows

## Deployment view

```mermaid
flowchart LR
  Browser[React / Vite browser app]
  API[Express modular monolith\nREST API]
  Socket[Socket.IO\nchat and auction rooms]
  Worker[Notification retry worker\ninside API process]
  DB[(MongoDB replica set)]
  SMS[SMS provider\nmock by default / Twilio optional]

  Browser -->|REST + HttpOnly refresh cookie| API
  Browser <-->|authenticated real-time events| Socket
  API --> DB
  Worker --> DB
  Worker --> SMS
```

The worker currently runs in the backend process. It claims persisted notification jobs, retries temporary SMS failures with backoff, and records `QUEUED`, `SENT`, `MOCKED`, `RETRY`, or `FAILED` state. Keep it in-process for the prototype; a separate worker deployment can be a future scaling step.

## Backend modules

| Module | Responsibility |
| --- | --- |
| Authentication and farms | Account sessions, roles, farmer profile and farm details |
| Marketplace | Crop listings, buyer requirements, bids and auction access |
| Orders and contracts | Stock reservation, bid acceptance, order transitions, catch-weight verification, private order evidence and contract snapshots |
| Communications | Conversations, messages, notification preferences, in-app notifications, SMS outbox and reviews/disputes |
| Admin and analytics | Management views, audits and aggregate reporting |

These are code-level boundaries inside one deployable API. The project does not currently need Kafka or independent microservices.

## Order lifecycle

```mermaid
stateDiagram-v2
  [*] --> PENDING: buyer places order / accepts bid
  PENDING --> CONFIRMED: farmer confirms
  CONFIRMED --> HARVESTING: farmer starts harvest
  HARVESTING --> READY_FOR_DELIVERY: farmer prepares produce
  READY_FOR_DELIVERY --> IN_TRANSIT: farmer dispatches
  IN_TRANSIT --> DELIVERED: buyer confirms delivery
  DELIVERED --> WEIGHT_VERIFIED: buyer records actual weight within tolerance
  WEIGHT_VERIFIED --> PAYMENT_SETTLED: buyer records simulated payment
  PAYMENT_SETTLED --> COMPLETED: buyer closes order
  PENDING --> CANCELLED
  CONFIRMED --> CANCELLED
  HARVESTING --> CANCELLED
  DELIVERED --> DISPUTED
  WEIGHT_VERIFIED --> DISPUTED
```

The payment step is a demonstration state transition. It does not make a real payment.

## Data relationships

```mermaid
erDiagram
  USER ||--o{ CROPLISTING : publishes
  USER ||--o{ BUYERREQUIREMENT : creates
  BUYERREQUIREMENT ||--o{ BID : receives
  USER ||--o{ BID : submits
  USER ||--o{ ORDER : farmer
  USER ||--o{ ORDER : buyer
  CROPLISTING ||--o{ ORDER : fulfills
  BID ||--o| ORDER : accepted_into
  ORDER ||--o| CONTRACT : records_terms
  ORDER ||--o{ NOTIFICATION : triggers
  NOTIFICATION ||--o{ NOTIFICATIONJOB : queues_sms
  ORDER ||--o{ DISPUTE : may_have
  ORDER ||--o{ REVIEW : receives
```

## Design decisions and limitations

- Transactions keep stock reservation, bid acceptance, order/contract creation, and the notification outbox consistent. MongoDB multi-document transactions require a replica set or sharded deployment; a standalone MongoDB server is not sufficient.
- SMS uses a MongoDB-backed outbox for durable retries. The default mock mode records the workflow without sending a phone message.
- Buyer requirement suggestions reuse an explainable compatibility score across crop, quantity, price, quality, harvest timing, and approximate farm distance. Farm coordinates and evidence files remain protected by participant access checks.
- Trace passports provide a SHA-256 fingerprint of displayed record fields. This is not blockchain storage or an independent integrity attestation.
- Kafka, payment gateway integration, and microservice deployment are future options only if project requirements or measured workload justify them.
