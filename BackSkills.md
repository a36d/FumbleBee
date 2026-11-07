Backend Skill Context
Project
SentinelGraph AI is an AI-powered Insider Threat Investigation & Attack Path Visualization platform.

Security teams use the platform to investigate suspicious employee behavior.

The system automatically:

Classifies threats
Calculates risk scores
Generates attack paths
Estimates blast radius
Generates recommendations
Produces investigation summaries
This is NOT a chatbot.

The platform focuses on automated investigation workflows.

My Role
I am the Backend Engineer.

I own:

SpacetimeDB
Authentication
RBAC
Audit Logging
Nemotron Integration
AI Findings Generation
Attack Graph Data Generation
I do NOT own:

Dashboard UI
React Components
Styling
React Flow Rendering
Those belong to Developer A.

Technology Stack
Backend:

SpacetimeDB
AI:

Nemotron
Frontend:

Next.js
Required Entities
Users

Incidents

Assets

Relationships

InvestigationNotes

ActivityFeed

AuditLogs

Roles
Admin

Permissions:

Create User
Delete User
Assign Role
Investigator

Permissions:

Create Incident
Update Incident
Add Notes
Run AI Analysis
Viewer

Permissions:

Read Only
Keep RBAC simple.

Avoid enterprise complexity.

Incident Structure
Incident contains:

Title
Description
Subject Name
Severity
Status
Risk Score
Classification
AI Workflow
Input:

Incident

Notes

Description

Output:

Classification

Severity

Risk Score

Blast Radius

Affected Assets

Recommendations

Summary

Attack Graph

Use structured JSON output.

Expected Nemotron Response
{ "classification": "Potential Data Exfiltration", "riskScore": 87, "severity": "High", "blastRadius": 7, "confidence": 92, "affectedAssets": [], "recommendations": [], "summary": "", "attackGraph": { "nodes": [], "edges": [] } }

Attack Graph Generation
Generate React Flow compatible data.

Output:

nodes

edges

Graph is display-only.

No graph manipulation support required.

Activity Feed
Generate events for:

Incident Created
Investigation Note Added
AI Analysis Completed
Attack Graph Generated
Risk Score Updated
Audit Logging
Every critical action must generate audit records.

Examples:

User Created
Incident Created
Role Changed
Note Added
Tamper-Evident Requirements
Store:

previousHash

currentHash

Hash Formula:

SHA256( action + actorId + timestamp + previousHash )

Demonstration value is more important than enterprise-level security.

Real-Time Sync
SpacetimeDB must synchronize:

Investigation Notes
Activity Feed
Incident Updates
AI Findings
Graph Data
Multiple browser sessions should stay synchronized.

Scope Restrictions
Do NOT build:

File Uploads
Chat Systems
Task Management
Vector Databases
RAG
LangGraph
Agent Frameworks
Complex SSO
OAuth
Simple is better.

Judging Priorities
Highest Priority:

AI Findings
Attack Graph Generation
Real-Time Synchronization
RBAC
Audit Logs
Build only what improves the demo.