# Sprint Plan & Upcoming Work — Study Mentor Platform

**Date:** March 5, 2026  
**Author:** Sarthak Yadav  
---

## Overview

This document outlines the planned engineering work for the upcoming sprint, covering authentication revamp, role-based dashboard functionality, batch management, and learner progress tracking.

---

## 1. Auth Migration — Simplified Credential-Based Login

Replacing the existing auth flow with a straightforward **username/email + password** authentication system.

- No self-registration; all accounts are provisioned by administrators.
- Session management via JWT with role-encoded claims.
- Password hashing with bcrypt; future-ready for token refresh flows.

---

## 2. SuperAdmin Dashboard

The SuperAdmin has full platform control over **Institute** entities.

| Action | Details |
|--------|---------|
| View | Paginated list of all registered institutes |
| Add | Onboard new institute with owner assignment |
| Edit | Update institute metadata & owner details |
| Delete | Soft-delete with cascade handling |

---

## 3. Institute Owner Dashboard

Institute Owners manage their internal team and learner base.

- **CRUD** for: Instructors, Institute Admins, Students
- Alternatively, can **raise a provisioning request** to SuperAdmin for new user addition (approval-gated flow)
- Role-scoped data access — owners only see entities under their institute

---

## 4. Institute Admin Dashboard

Institute Admins operate within their assigned institute scope.

- **CRUD** for: Students, Instructors
- Can **request new user provisioning** via SuperAdmin approval workflow
- Read-only access to institute-level configuration

---

## 5. Batch Allocation System

Designing and implementing the **Batch Management** module:

- Create & manage batches within an institute
- Assign students and instructors to batches
- Handle conflicts (student in multiple active batches), schedule metadata, and capacity constraints
- Batch lifecycle management (active, archived, upcoming)
- DB-level relationships: `Batch ↔ Student`, `Batch ↔ Instructor` many-to-many via join tables with audit fields

---

## 6. Instructor Progress Visibility

Batch-scoped instructors will have a **student progress tracking view**:

- Aggregated metrics per student: sessions completed, assessment scores, activity trends
- Drill-down per learner: timeline of attempts, performance deltas, weak-area tagging
- Backend: computed via optimized Prisma queries with aggregation pipelines; access strictly gated to instructor's assigned batches via middleware-level authorization guards
- Designed for extensibility — metrics layer will be decoupled to support analytics dashboards in later phases

---

*This is a living document and will be updated as requirements are finalized.*
