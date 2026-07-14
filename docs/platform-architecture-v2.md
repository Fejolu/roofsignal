# RoofSignal Platform Architecture v2

## Purpose

RoofSignal must be designed as a Property Intelligence Platform, not as a report portal and not as a website.

The platform should be architected from day one as if it must support thousands of objects, thousands of inspections, many employees, and eventually multiple inspection companies as a SaaS product.

Architecture comes before speed.

The drone is only the first sensor. The value is in the object data, historical comparison, property intelligence, workflows, and commercial operating system around that data.

## Core Principles

- Property Intelligence is the product.
- The drone is a sensor, not the product.
- A report is a deliverable, not the system of record.
- An inspection is an event in the lifecycle of an object.
- The object is the center of the platform.
- Every inspection must increase the value of the digital property dossier.
- RoofSignal should collect the maximum useful dataset during every inspection when legally and contractually allowed.
- The customer may buy only part of the collected data, while RoofSignal retains unlockable modules and internal intelligence where rights allow it.
- The system should be modular enough to become a standalone SaaS platform for other property inspection companies.

## Object-Centric Architecture

All platform data should attach directly or indirectly to an object.

An object can have:

- Inspections.
- Reports.
- Drone photos.
- Thermal imagery.
- Drone videos.
- 3D models.
- AI analyses.
- Documents.
- Quotes.
- Order confirmations.
- Invoices.
- Payments.
- Maintenance history.
- Notifications.
- Property Intelligence.
- CRM activity.
- Planning records.
- Future external data sources.

Future sources must be able to attach without redesigning the core model:

- IoT sensors.
- Weather history.
- Satellite imagery.
- Municipal datasets.
- Energy data.
- Insurance events.
- Public building data.
- Smart AI predictions.

## Suggested Core Domain Model

This is the long-term mental model. It does not imply every table must be built immediately.

- Tenant: the company or inspection business using the platform.
- Organization: customer account, property owner, manager, or business relation.
- Contact: person linked to an organization.
- Object: physical property, building, complex, roof asset, or addressable inspection target.
- ObjectComponent: roof, facade, gutter, chimney, solar installation, installation zone, etc.
- Inspection: dated inspection event for one or more objects.
- InspectionAsset: photo, thermal image, video, 3D scan, point cloud, annotation, or measurement.
- Finding: structured defect, observation, risk, or condition signal.
- Recommendation: actionable maintenance advice, follow-up, or prevention step.
- Report: packaged customer-facing output based on selected data.
- Entitlement: what a customer has purchased and may access.
- LockedModule: collected but not yet purchased data or analysis.
- Quote: commercial proposal.
- Order: accepted work.
- Invoice: financial document.
- Payment: status and transaction metadata.
- Task: operational, CRM, finance, or follow-up task.
- Notification: automated or manual communication event.
- PlanningSlot: scheduled work, appointment, route, or internal resource allocation.
- StaffMember: employee, contractor, or inspector.
- Role: permission profile.
- AuditEvent: important system event for traceability.

## Roles And Permissions

Support multiple roles from the beginning:

- Administrator.
- Planner.
- Inspector.
- Commerce.
- Backoffice.
- Finance.
- Customer.

Permissions must be role-based and object-aware. A customer sees only their own portfolio, objects, reports, invoices, documents, and unlocked intelligence. Internal users see only the modules needed for their role.

## Customer Invitation Workflow

The platform should not open the local mail client for invitations.

Target workflow:

1. Internal user creates a new customer.
2. Internal user enters email address.
3. Internal user selects private or business customer.
4. Internal user optionally creates the first object.
5. Internal user sends invitation.
6. RoofSignal sends a branded activation email automatically.
7. Customer activates the account.
8. Customer completes account details.
9. Customer adds or confirms object data.

Account completion fields:

- First name.
- Last name.
- Phone number.
- Company, optional.
- Chamber of Commerce number, optional.
- Password.
- Main address.
- Object or objects.

## Customer Dashboard

The customer dashboard should feel like modern SaaS software, not a PDF archive.

The dashboard should surface:

- Portfolio overview.
- Objects.
- Open actions.
- Latest inspections.
- Warnings.
- Planning.
- Invoices.
- New recommendations.
- Locked but available upgrades.
- Trend signals.

## Object Page

Each object should have a complete dossier with tabs or modules such as:

- Overview.
- Inspections.
- Photos.
- Thermal.
- 3D.
- Reports.
- Documents.
- Invoices.
- Quotes.
- Maintenance.
- Property Intelligence.
- AI.

The object page should become more valuable after every inspection.

## Property Intelligence

Do not only show reports. Show knowledge.

Examples:

- Since previous inspection: 2 new defects.
- Gutter condition worsened.
- Jointwork stable.
- Chimney improved after maintenance.
- Roof detail requires attention within 8 months.
- Risk increased after recent storm exposure.

Every finding should be structured so it can be compared over time.

## AI Layer

AI should be available per object, not only per report.

Examples:

- Explain why a crack may be forming.
- Explain what happens if no action is taken.
- Generate a maintenance plan.
- Summarize all inspections for an object.
- Compare inspection 2026 with inspection 2028.
- Draft a repair quote.
- Convert findings into owner-friendly explanations.
- Produce MJOP input.

AI output must be grounded in structured data and evidence, with uncertainty preserved.

## Inspections

Inspections should always be ordered newest first.

Each inspection can contain:

- Report.
- Photos.
- Thermal imagery.
- Drone video.
- 3D model.
- AI analysis.
- Findings.
- Recommendations.

Historical comparison between inspections is a core platform feature.

## Upsell And Entitlements

During every inspection, RoofSignal should collect all useful data when allowed. The customer may only buy package A, while thermal, 3D, AI, historical comparison, or portfolio intelligence remain locked.

Later upgrades should unlock already collected data or additional analysis.

Pricing rule:

- Upgrade price may never be lower than the difference between the original packages.
- A to B: at least the A-B price difference.
- B to C: at least the B-C price difference.
- Do not discount already collected data merely because it was collected earlier.

This requires explicit entitlement tracking per customer, object, inspection, asset type, report, and intelligence module.

## Subscription Model

The first month can be free. After that, pricing is based on object count.

Initial tiers:

| Objects | Monthly price |
| --- | ---: |
| 1-5 | EUR 29 |
| 6-15 | EUR 59 |
| 16-30 | EUR 99 |
| 31-75 | EUR 199 |
| 76-200 | EUR 399 |
| 200+ | Quote |

Subscription access can include:

- Dashboard.
- Property Intelligence.
- History.
- AI.
- Documents.
- Invoices.
- Reports.
- Portfolio.
- Trend analysis.
- Notifications.

## Notifications

Notifications should be automated.

Examples:

- New inspection available.
- Storm in the region.
- Maintenance expected within 8 months.
- AI generated new advice.
- New invoice.
- Payment reminder.
- New quote.
- New planning proposal.
- Inspection rescheduled due to weather.

Notifications should support email first and later in-app, SMS, WhatsApp, or mobile push where appropriate.

## CRM Module

The platform should also become RoofSignal's CRM.

CRM entities:

- Leads.
- Customers.
- Contacts.
- Objects.
- Communication.
- Tasks.
- Follow-up.
- Notes.
- Activities.
- Pipeline.

CRM activity should connect to objects whenever possible.

## ERP Module

The platform should also become RoofSignal's ERP.

ERP entities and workflows:

- Quotes.
- Order confirmations.
- Invoices.
- Payments.
- Payment reminders.
- Credit invoices.
- Procurement, later.
- Document management.
- Work orders.
- Inspections.
- Planning.
- Users.
- Permissions.
- Reporting.

## Invoicing

Authorized employees must be able to:

- Create quotes.
- Create order confirmations.
- Generate invoices.
- Send invoices.
- Create credit invoices.
- Change invoice status.
- Mark invoices as open, paid, overdue, or cancelled.

Payment reminders should be automated.

Second reminders should automatically create call-list tasks.

Weekly task example:

> Call all customers with open second reminders.

This task should eventually be generated by the system automatically.

## Planning

Planning must become a professional visual calendar with mobile sync.

Planning input:

- New inspection request.
- Object.
- Inspection Complexity Score.
- Estimated duration.
- Travel time.
- Inspector availability.
- Weather forecast.
- Required certifications.
- Optimal route.

Inspection duration should not be manually guessed. It should be calculated from an Inspection Complexity Score.

Complexity inputs:

- Building type.
- Footprint.
- Volume in cubic meters.
- Floor count.
- Roof area.
- Facade area.
- Roof complexity.
- Solar panels.
- Site accessibility.
- Package.
- Historical inspection data.
- Actual time spent on earlier inspections.

The system should learn from real inspection durations so future planning becomes more accurate.

## Route Optimization

The system should reduce kilometers and increase inspection density.

Examples:

- Inspection planned in Amsterdam: show 4 potential inspections nearby.
- Customer lies on the route Apeldoorn to Amsterdam.
- This inspection can be combined with another visit.
- Similar objects in this region are due for inspection.

Route optimization should connect CRM, planning, lead scoring, and object geography.

## Weather Intelligence

Planning must consider:

- Rain.
- Wind.
- Fog.
- Visibility.
- Precipitation chance.

When weather risk is too high, the system should suggest another day automatically.

## Staff Planning

Staff planning must support:

- Availability.
- Vacation.
- Sick leave.
- Leave.
- Working days.
- Competencies.
- Drone certifications.
- A2.
- Specific category.
- Thermal inspection capability.

Planning must account for these constraints.

## Future Modules

The architecture must preserve room for:

- Asset management.
- MJOP.
- Sensor integrations.
- API access.
- Partner portal.
- Municipality portal.
- VvE portal.
- Portfolio analytics.
- Risk scores.
- Benchmarking.
- Subscriptions.
- Multi-company SaaS operation.

## Implementation Direction

Do not build the entire future platform at once.

But every near-term portal change should be compatible with the long-term architecture:

- Prefer objects over inspection-only records.
- Store structured findings instead of PDF-only output.
- Keep entitlements separate from assets.
- Keep internal data capture separate from customer deliverables.
- Keep roles and permissions explicit.
- Keep CRM and ERP concepts first-class, even if early screens are simple.
- Preserve multi-tenant SaaS options in naming, data model, and permissions.

The product is not a drone inspection workflow.

The product is a Property Intelligence operating system.
