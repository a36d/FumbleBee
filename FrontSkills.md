Frontend Skill Context
Project
SentinelGraph AI is an AI-powered Insider Threat Investigation & Attack Path Visualization platform.

The application helps security teams investigate suspicious employee activity, visualize attack paths, assess affected assets, estimate blast radius, and generate AI-powered investigation findings.

This is NOT a chatbot application.

The primary user value is visual investigation and threat analysis.

My Role
I am the Frontend Engineer.

I am responsible for:

Next.js application
User Interface
Dashboard
Investigation Workspace
Attack Graph Visualization
Admin UI
Activity Feed
Investigation Notes
Frontend integration with backend services
I do NOT own:

SpacetimeDB schemas
Authentication logic
RBAC implementation
Nemotron integration
Audit log generation
Those belong to Developer B.

Technology Stack
Frontend:

Next.js App Router
TypeScript
TailwindCSS
shadcn/ui
React Flow
Lucide Icons
Backend:

SpacetimeDB
AI:

Nemotron
Application Routes
/dashboard

/investigation/[id]

/admin

Design Requirements
Use a modern SOC (Security Operations Center) aesthetic.

Color Palette:

Background:

slate-950
Cards:

slate-900
Borders:

slate-800
High Risk:

red-500
Medium Risk:

amber-500
Low Risk:

green-500
Accent:

cyan-500
Inspiration:

CrowdStrike Falcon
Microsoft Defender
Splunk
Datadog Security
Dashboard Requirements
Create cards for:

Open Investigations
High Risk Users
Assets At Risk
Recent Events
Show investigation table:

Columns:

Title
Threat Type
Risk Score
Status
Investigation Page
Single page layout.

Sections:

Investigation Summary
Attack Graph
AI Findings
Investigation Notes
Activity Feed
Avoid tabs unless necessary.

Attack Graph
Use React Flow.

Display only.

Do NOT build:

Graph editor
Edge editing
Node editing
Drag-and-drop graph management
Graph must be generated from backend data.

Graph Examples:

Employee Account ↓ Engineering Share ↓ Source Repository ↓ Customer Database

Show relationships visually.

This is one of the most important demo features.

AI Findings Section
Display:

Classification
Severity
Risk Score
Blast Radius
Confidence Score
Affected Assets
Recommendations
Summary
Design this section to be visually impressive.

Notes Section
Simple collaborative notes.

Features:

Add note
View notes
No rich text editor.

No attachments.

Activity Feed
Display:

Incident Created
Note Added
AI Analysis Completed
Risk Score Updated
Attack Graph Generated
Timeline layout preferred.

Admin Page
Display:

Users
Roles
Actions
Roles:

Admin
Investigator
Viewer
Component Standards
Prefer reusable components.

Examples:

MetricCard

InvestigationSummary

AttackGraph

ActivityFeed

NotesPanel

AIFindings

UserTable

Scope Restrictions
Do NOT build:

Chat system
Task management
File uploads
Notifications
Graph editing
RAG
Agent frameworks
Focus on:

Dashboard
Investigation Page
AI Findings
Attack Graph
These are highest value for judging.