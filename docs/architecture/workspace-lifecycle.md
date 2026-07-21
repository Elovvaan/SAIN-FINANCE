# SAIN Workspace Lifecycle Architecture

## Purpose

SAIN uses one identity across multiple workspaces. A person does not create a separate account for Career OS, Finance OS, Business OS, or institutional workspaces. Each workspace is activated against the same SAIN Identity and then bootstrapped for its specific role and operating purpose.

## Layer 1 — SAIN Identity

The identity layer establishes the person or authorized operator who will use SAIN.

1. Create SAIN Account
2. Verify email
3. Collect identity information
4. Complete the required identity verification level
5. Create SAIN Identity
6. Establish an authenticated session

The identity record is persistent and is not recreated when the user enters another workspace.

## Layer 2 — Workspace Routing

The workspace router evaluates:

- authenticated SAIN Identity
- activated workspace memberships
- assigned roles
- permissions and authority
- invitation or approval requirements
- suspended or restricted access states

The router sends the user to an existing workspace, offers an eligible workspace for activation, or explains the approval required before entry.

## Layer 3 — Workspace Activation

Workspace activation creates the relationship between the SAIN Identity and a workspace.

1. Select workspace
2. Review purpose and terms
3. Accept workspace-specific terms
4. Assign or request a role
5. Create workspace membership
6. Establish permissions
7. Mark workspace active
8. Continue to workspace bootstrap

Activation is not the workspace's full operating flow. It grants the identity access to begin preparing that workspace.

## Layer 4 — Workspace Bootstrap

Bootstrap creates the minimum records and configuration required for useful work.

Career OS bootstrap may include:

- worker profile
- employment history
- education
- skills passport
- document vault
- work preferences
- availability
- portfolio and references

Finance OS customer bootstrap may include:

- borrower or business profile
- required financial documents
- ownership and authority information
- relevant account or record connections
- financing purpose and preferences

Institutional bootstrap may include:

- institution profile
- operator roster
- authority assignments
- filing configuration
- policy and approval rules
- settlement or network configuration

## Layer 5 — Workspace Objects

Objects are durable records used by workflows.

Career OS examples:

- Worker Profile
- Resume
- Skills Passport
- Employment History
- Education
- Certificate
- Portfolio
- Application
- Offer
- Employment Record

Finance OS customer examples:

- Borrower Profile
- Loan Application
- Loan
- Collateral
- Security Agreement
- Payment Schedule
- Document
- Notice
- Account Activity

Finance OS institutional examples:

- Security Interest
- Attachment Record
- Perfection Record
- Priority Record
- Collateral Verification
- Verified Secured Asset Record
- Transfer Record
- On-Chain Representation
- Settlement Record

A Verified Secured Asset Record is an institutional workflow output. It is not a primary customer workstation object.

## Layer 6 — Workflow Engine

The workflow engine moves objects through controlled states, records approvals and authority, and produces an audit trail.

A secured lending flow may follow:

1. Application
2. Underwriting
3. Approval
4. Documentation
5. Security interest attachment
6. Perfection
7. Funding
8. Servicing
9. Verification
10. Verified Secured Asset Record
11. Hold, pledge, transfer, or approved on-chain use
12. Settlement, payoff, release, or enforcement

The customer participates in the customer-facing stages. Authorized institutional workers operate the legal, verification, asset-management, transfer, and settlement stages.

## Layer 7 — Institutional and Network Infrastructure

This layer supports authorized operational and network functions:

- Institution Administration
- Filing Office
- Authority and permissions
- Compliance records
- Collateral registry
- Asset verification
- Transfer Network
- Settlement
- On-Chain Registry or Representation
These functions do not appear as ordinary customer dashboard features.

## Current Career OS Route

The current sandbox path is:

`/platform/career`

1. User completes the Career OS activation form.
2. The page records sandbox completion in client state.
3. The confirmation now provides a direct continuation action.
4. The user enters the existing Career OS workspace at:

`/platform/employment/career`

This establishes the first continuous route from workspace activation into an operating workspace while the persistent identity and membership services remain to be implemented.
