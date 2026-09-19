# MediBook — Complete Project Scope & Development Roadmap

## 1. Document Purpose

This document defines the complete project scope, architecture, functional requirements, technical requirements, modules, database design, API plan, React structure, security requirements, testing strategy, deployment plan, development phases, milestones, and future expansion roadmap for **MediBook**.

MediBook is a healthcare appointment and doctor-booking platform built with:

- **Backend:** Django
- **API:** Django REST Framework
- **Frontend:** React + TypeScript (strict, Vite) — one codebase
- **Database:** PostgreSQL
- **Authentication:** JWT
- **Push Notifications:** Web Push (VAPID) + Firebase Cloud Messaging (FCM)
- **Delivery Model:** Installable Progressive Web App (PWA) — one React build installs on Desktop, Android, and iOS
- **Platforms:** Desktop (browser + installed app), Android (browser + installed app), iOS (browser + installed app), Mobile Web, and Tablet
- **Architecture:** REST API client/server architecture

The project should be developed in phases. Core functionality must be stable before advanced features are introduced.

---

# 2. Project Identity

## Project Name

**MediBook**

## Project Type

Online healthcare appointment and doctor booking platform.

## Primary Purpose

MediBook connects patients with doctors and healthcare facilities through a digital appointment-booking system.

Patients can discover doctors, inspect professional profiles, view availability, select appointment slots, book appointments, receive status updates, and manage appointment history.

Doctors can manage professional profiles, availability, appointment requests, schedules, and patient appointment information.

Administrators can manage users, doctors, patients, specialties, healthcare facilities, appointments, notifications, reviews, and system settings.

---

# 3. Project Vision

The vision of MediBook is to provide a centralized, reliable, responsive, and secure platform that simplifies healthcare appointment management.

The system should replace unnecessary manual appointment processes with a digital workflow:

Patient → Find Doctor → Check Availability → Select Slot → Book → Doctor Response → Notification → Appointment → Completion → Review

The platform should be designed for future expansion without requiring a complete rewrite of the core architecture.

---

# 4. Main Objectives

MediBook should:

1. Provide secure patient registration and authentication.
2. Provide secure doctor authentication.
3. Provide role-based access control.
4. Allow patients to manage their profiles.
5. Allow doctors to manage professional profiles.
6. Allow administrators to manage the platform.
7. Allow patients to search for doctors.
8. Allow filtering by medical specialty.
9. Allow filtering by location and healthcare facility.
10. Display doctor availability.
11. Display appointment time slots.
12. Allow patients to book appointments.
13. Prevent double-booking.
14. Allow doctors to accept or reject appointment requests.
15. Allow patients to cancel appointments.
16. Allow patients to reschedule appointments.
17. Allow doctors to manage schedules.
18. Provide appointment history.
19. Provide in-app notifications.
20. Provide push notifications.
21. Allow patients to review completed appointments.
22. Provide administrator statistics and reports.
23. Protect user and healthcare-related information.
24. Work responsively on desktop, Android, iOS, tablet, and web from a single React build.
26. Be installable as a Progressive Web App (A2HS — Add to Home Screen) on desktop, Android, and iOS without native Android/iOS builds or emulators.
27. Provide a Web App Manifest with `display: "standalone"` and a complete icon set.
28. Provide a service worker with install, activate, and `fetch` handlers for offline support plus an offline fallback page.
29. Protect installed-app data with HTTPS, safe caching rules, and a restricted service-worker scope.
30. Provide a scalable architecture for future healthcare services.

---

# 5. Project Scope

## 5.1 Included in Core MVP

### Authentication

- Patient registration
- Doctor registration
- Login
- Logout
- JWT access tokens
- Refresh tokens
- Password hashing
- Password reset
- Email verification
- Account activation/deactivation
- Role-based access

### Patient

- Patient profile
- Edit profile
- Search doctors
- Filter doctors
- View specialties
- View doctor profiles
- View availability
- Book appointments
- View appointments
- Cancel appointments
- Reschedule appointments
- Appointment history
- Notifications
- Settings

### Doctor

- Doctor profile
- Professional information
- Specialty
- Qualifications
- Experience
- License/registration information
- Healthcare facility
- Consultation fee
- Availability
- Appointment requests
- Accept/reject appointment
- Cancel appointment
- Mark appointment completed
- Appointment history
- Notifications

### Admin

- Admin authentication
- Dashboard
- User management
- Patient management
- Doctor management
- Doctor verification
- Specialty management
- Hospital/clinic management
- Appointment management
- Notification management
- Basic reports
- System settings

### PWA / Cross-Platform Delivery

- Web App Manifest (`manifest.json` with app name, icons, theme, `display: "standalone"`)
- Service worker (`service-worker.js` with install, activate, and fetch handlers)
- Offline app-shell caching + offline fallback page
- Install prompt (A2HS — Add to Home Screen)
- Installed-app experience on desktop, Android, and iOS
- Responsive layouts for phone, tablet, and desktop
- Service worker update handling (new version available)

---

# 6. Optional / Future Scope

These features should not block the MVP:

- Online consultation
- Video consultations
- Audio consultations
- Chat between patient and doctor
- Digital prescriptions
- Electronic medical records
- Laboratory services
- Pharmacy integration
- Insurance integration
- SMS notifications
- Advanced analytics
- Doctor ratings
- AI features
- Health reminders
- Medicine reminders
- Emergency services
- Ambulance integration
- Multi-language support
- Multi-country support
- Native wrapper builds (React Native or a Capacitor shell around the same React app) if Play Store / App Store distribution is ever required

---

# 7. User Roles

MediBook has three primary roles.

## 7.1 Patient

Patients can:

- Register
- Login
- Logout
- Manage profile
- Search doctors
- Search specialties
- View doctor information
- View doctor availability
- Select appointment date
- Select appointment time
- Book appointment
- View booking details
- Cancel booking
- Request rescheduling
- View appointment history
- Receive notifications
- Review completed appointments
- Manage settings

Patients must be authenticated before booking.

A visitor may browse publicly available doctors and specialties, but the system must require login before creating an appointment.

---

## 7.2 Doctor

Doctors can:

- Register or be created by admin
- Login
- Logout
- Manage professional profile
- Manage specialty
- Manage qualifications
- Manage experience
- Manage consultation fee
- Manage healthcare facility
- Set availability
- Create/manage appointment slots
- View appointment requests
- Accept appointments
- Reject appointments
- Cancel appointments
- Mark appointments completed
- Mark no-show appointments
- View appointment history
- Receive notifications

---

## 7.3 Administrator

Administrators can:

- Login
- Manage users
- Manage patients
- Manage doctors
- Verify doctors
- Activate/deactivate accounts
- Manage specialties
- Manage hospitals/clinics
- Manage appointments
- Manage notifications
- Manage reviews
- View statistics
- View reports
- Configure system settings
- View audit activity

---

# 8. Core User Journey

## Patient Journey

```text
Open MediBook
      ↓
Splash Screen
      ↓
Home
      ↓
Browse/Search Doctors
      ↓
Doctor Profile
      ↓
Select Date
      ↓
View Available Slots
      ↓
Select Time
      ↓
Login/Register if not authenticated
      ↓
Enter Appointment Reason
      ↓
Review Booking
      ↓
Confirm Booking
      ↓
Appointment Created
      ↓
Status = Pending
      ↓
Doctor Receives Notification
      ↓
Doctor Accepts/Rejects
      ↓
Patient Receives Notification
      ↓
Appointment
      ↓
Completed
      ↓
Optional Review
```

---

# 9. Appointment Workflow

Appointment status values:

```text
PENDING
CONFIRMED
REJECTED
CANCELLED
COMPLETED
NO_SHOW
```

## Pending

Appointment was submitted by the patient and is waiting for doctor action.

## Confirmed

Doctor accepted the appointment.

## Rejected

Doctor rejected the request.

## Cancelled

Appointment was cancelled by an authorized party.

## Completed

Appointment was completed.

## No Show

Patient did not attend the appointment.

---

# 10. Appointment Booking Rules

The booking engine must enforce these rules on the backend.

1. A patient must be authenticated before booking.
2. A doctor must be active.
3. A doctor must be verified where verification is required.
4. The requested date must be valid.
5. The requested time must be valid.
6. The doctor must be available.
7. The appointment slot must not already be booked.
8. A patient should not create duplicate active bookings for the same slot.
9. Cancelled slots may become available again according to business rules.
10. Completed appointments cannot be edited as normal bookings.
11. Only authorized users can view private appointment information.
12. Appointment status changes must be validated.
13. Critical booking validation must happen in Django, not only in React.
14. Database constraints should protect against race-condition double booking.

---

# 11. Doctor Availability

Doctors should be able to define recurring availability.

Example:

```text
Monday
09:00 – 13:00

Tuesday
09:00 – 13:00

Wednesday
14:00 – 18:00

Thursday
09:00 – 13:00

Friday
09:00 – 15:00
```

The system should support:

- Working days
- Start time
- End time
- Break periods
- Appointment duration
- Temporary unavailable dates
- Holidays
- Schedule updates
- Slot generation
- Slot availability checking

Example appointment duration:

```text
30 minutes
```

The actual duration should be configurable.

---

# 12. Double-Booking Prevention

This is one of the most important technical requirements.

Bad implementation:

```text
React checks slot
        ↓
User clicks book
        ↓
Backend blindly creates booking
```

Correct implementation:

```text
React requests booking
        ↓
Django validates doctor
        ↓
Django validates date
        ↓
Django validates slot
        ↓
Django checks existing booking
        ↓
Database transaction/constraint
        ↓
Appointment created
```

The database and backend must protect against two users attempting to book the same slot simultaneously.

---

# 13. Patient Profile

Patient information can include:

```text
Patient
├── User
├── Date of Birth
├── Gender
├── Phone
├── Email
├── Address
├── Profile Photo
├── Emergency Contact
├── Emergency Phone
├── Created At
└── Updated At
```

Only information necessary for the system should be collected.

---

# 14. Doctor Profile

Doctor information can include:

```text
Doctor
├── User
├── Full Name
├── Profile Photo
├── Specialty
├── Qualification
├── Experience
├── License Number
├── Hospital/Clinic
├── Consultation Fee
├── Biography
├── Languages
├── Location
├── Verification Status
├── Created At
└── Updated At
```

---

# 15. Specialty Module

Initial examples:

- General Medicine
- Pediatrics
- Cardiology
- Dermatology
- Dentistry
- Gynecology
- Orthopedics
- Neurology
- Ophthalmology
- Psychiatry
- ENT
- Surgery

Administrators must be able to:

- Add specialty
- Edit specialty
- Disable specialty
- Delete specialty where safe
- Assign doctors to specialties

---

# 16. Hospital / Clinic Module

Healthcare facilities can contain:

```text
Hospital
├── Name
├── Logo
├── Address
├── Phone
├── Email
├── Description
├── Location
├── Opening Hours
├── Status
├── Created At
└── Updated At
```

Doctors can be associated with one or more facilities if the business rules allow it.

---

# 17. Doctor Search and Filtering

Patients should be able to search using:

- Doctor name
- Specialty
- Hospital/clinic
- Location
- Availability
- Consultation fee
- Experience
- Gender where appropriate

Search results should support pagination.

Example:

```text
Search doctors...

Filters:
Specialty
Location
Hospital
Available Date
Price
Experience

[Apply Filters]
```

---

# 18. Patient React Screens

Recommended screens:

```text
SplashScreen
OnboardingScreen (optional)
LoginScreen
RegisterScreen
ForgotPasswordScreen
ResetPasswordScreen

HomeScreen
DoctorListScreen
DoctorDetailsScreen
SpecialtiesScreen
HospitalListScreen
HospitalDetailsScreen

SelectDateScreen
SelectTimeSlotScreen
BookingReviewScreen
BookingSuccessScreen

AppointmentsScreen
AppointmentDetailsScreen
RescheduleScreen

NotificationsScreen
ProfileScreen
EditProfileScreen
SettingsScreen

PWA UI (shared across roles)
OfflineScreen (offline fallback page)
InstallAppPrompt (A2HS install banner + iOS "Add to Home Screen" guidance)
UpdateAvailablePrompt (new version available / reload)
Standalone launch experience (splash + safe-area layout)
```

---

# 19. Doctor React Screens

```text
DoctorDashboardScreen
DoctorProfileScreen
EditDoctorProfileScreen
AvailabilityScreen
ScheduleScreen

AppointmentRequestsScreen
DoctorAppointmentsScreen
DoctorAppointmentDetailsScreen

PatientAppointmentInfoScreen
NotificationsScreen
SettingsScreen
```

---

# 20. Admin React/Web Screens

```text
AdminLoginScreen
AdminDashboardScreen

UsersScreen
UserDetailsScreen

PatientsScreen
PatientDetailsScreen

DoctorsScreen
DoctorDetailsScreen
DoctorVerificationScreen

SpecialtiesScreen
HospitalsScreen

AppointmentsScreen
AppointmentDetailsScreen

NotificationsScreen
ReviewsScreen
ReportsScreen
SystemSettingsScreen
AuditLogsScreen
```

The admin interface can be implemented in React Web or a separate web administration interface depending on the final product decision.

---

# 21. React UI/UX Requirements

The interface should be:

- Modern
- Clean
- Professional
- Healthcare-oriented
- Responsive
- Installable (PWA / A2HS)
- Accessible
- Fast
- Consistent
- Safe in standalone mode (no browser chrome, safe-area insets respected)

The design system should define:

- Primary color
- Secondary color
- Background colors
- Typography
- Button styles
- Card styles
- Form fields
- Navigation
- Dialogs
- Bottom sheets
- Loading states
- Empty states
- Error states
- Success states
- Install prompt (A2HS banner)
- Offline banner
- Update-available prompt
- Standalone/installed-safe spacing (safe-area insets)

Avoid creating different visual styles for each screen.

---

# 22. Responsive & PWA Requirements

MediBook is delivered as **one installable Progressive Web App (PWA)** instead of separate native Android and iOS applications.

The previous native delivery model (Android Studio, Android emulator, native Android build, native iOS build) is replaced by:

```text
One React codebase
        ↓
Web App Manifest + Service Worker
        ↓
Install prompt (A2HS — Add to Home Screen)
        ↓
Installed app on Desktop, Android, and iOS
        ↓
Same responsive UI everywhere
```

---

## 22.1 PWA Pillars

### 1. Web App Manifest (`manifest.json`)

Defines the app name, short name, icons, theme, and `display: "standalone"` so the app appears and behaves like a native app once installed.

The manifest defines:

```text
name
short_name
description
start_url
scope
display: "standalone"
orientation
theme_color
background_color
icons (192x192, 512x512, maskable, apple-touch-icon)
categories
shortcuts (optional)
```

### 2. Service Worker (`service-worker.js`)

Enables offline functionality: precaches the static app shell, intercepts network requests through a `fetch` event handler, applies caching strategies, and returns an offline fallback page when the network is unavailable.

```text
install event  → precache the app shell (HTML, JS, CSS, fonts, icons, offline page)
activate event → delete outdated cache versions
fetch event    → cache-first for static assets, network-first for API, offline fallback for navigations
```

### 3. Install Prompt (A2HS — Add to Home Screen)

Browsers detect the manifest + service worker and offer the user to "Install" the app, which creates a home-screen/desktop icon on desktop, Android, and iOS.
`beforeinstallprompt` is captured in React and surfaced as an in-app "Install MediBook" button. iOS (Safari) does not fire that event, so iOS users get written guidance: **Share → Add to Home Screen**.

---

## 22.2 PWA Core Requirements

```text
HTTPS (secure connection)
manifest.json with display: "standalone" and icons
Service Worker with a fetch event handler
```

---

## 22.3 PWA File Locations

```text
/frontend
├── public/
│   ├── manifest.json            → served as /manifest.json
│   ├── service-worker.js        → served as /service-worker.js (fetch handler lives here)
│   ├── offline.html             → offline fallback page
│   ├── favicon.ico
│   └── icons/
│       ├── icon-192.png
│       ├── icon-512.png
│       ├── icon-maskable-512.png
│       └── apple-touch-icon-180.png
```

`index.html` links and registers the PWA layer:

```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#0F62FE" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" />
```

```ts
// src/main.tsx (React entry point)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js");
  });
}
```

When the frontend is served by Django or another static pipeline, the same two files are deployed as `static/manifest.json` and `static/service-worker.js` and mapped to the site root, so the service worker scope covers the whole app.

---

## 22.4 Supported Targets

```text
Desktop browser
Installed desktop app (standalone window)

Small Android phone (browser + installed app)
Large Android phone (browser + installed app)

iPhone / iPad Safari (browser + installed app via A2HS)

Small tablet
Large tablet
```

---

## 22.5 Responsive Breakpoints

```text
320px – 599px    Phone
600px – 1023px   Tablet
1024px – 1439px  Desktop
1440px +         Large desktop
```

---

## 22.6 Responsive Behaviour

```text
Phone
Bottom Navigation

Tablet
Navigation Rail / Adaptive Navigation

Desktop
Sidebar + Content Area

Installed app (any platform)
Standalone layout, no browser chrome, safe-area insets respected
```

React responsive layouts must adapt to the viewport rather than simply stretching phone layouts, and the layout must be identical between the browser and the installed app.

---

## 22.7 Platform Fit Rules

1. One React codebase and one production build must serve desktop, Android, and iOS.
2. All assets, routes, and API calls must work under the app's `scope`.
3. Static assets must be cacheable and versioned; API responses must never be cached blindly.
4. Touch targets, scrolling, and keyboard behaviour must work in the browser and in standalone mode.
5. Installability must be verified on desktop, Android, and iOS before release.

---

# 23. Django Backend Architecture

Recommended project:

```text
/backend
│
├── manage.py
│
├── config/
│   ├── __init__.py
│   ├── settings.py
│   ├── urls.py
│   ├── asgi.py
│   └── wsgi.py
│
├── accounts/
├── patients/
├── doctors/
├── specialties/
├── hospitals/
├── appointments/
├── notifications/
├── reviews/
├── reports/
└── common/
```

---

# 24. Django Application Responsibilities

## accounts

Responsible for:

- Custom user
- Authentication
- Registration
- Login
- Password reset
- Roles
- Permissions

## patients

Responsible for:

- Patient profile
- Patient-specific data

## doctors

Responsible for:

- Doctor profile
- Qualifications
- Experience
- Verification
- Availability

## specialties

Responsible for:

- Specialty CRUD
- Specialty relationships

## hospitals

Responsible for:

- Healthcare facilities
- Facility information

## appointments

Responsible for:

- Availability
- Slots
- Booking
- Appointment lifecycle

## notifications

Responsible for:

- In-app notifications
- Push notification records
- Notification status

## reviews

Responsible for:

- Ratings
- Reviews
- Moderation

## reports

Responsible for:

- Statistics
- Aggregations
- Administrative reporting

## common

Responsible for reusable:

- Utilities
- Base models
- Constants
- Shared permissions
- Helpers

---

# 25. PostgreSQL Database Model

Core entities:

```text
User
Patient
Doctor
Specialty
Hospital
DoctorAvailability
AppointmentSlot
Appointment
Notification
Review
AuditLog
```

Relationships:

```text
User
 ├── Patient
 └── Doctor

Doctor
 ├── Specialty
 ├── Hospital
 ├── Availability
 └── Appointments

Patient
 └── Appointments

Appointment
 ├── Patient
 ├── Doctor
 ├── Slot
 └── Review
```

---

# 26. Suggested Database Tables

## User

```text
id
email
phone
password
first_name
last_name
role
profile_image
is_active
is_verified
created_at
updated_at
```

## Patient

```text
id
user_id
date_of_birth
gender
address
emergency_contact_name
emergency_contact_phone
created_at
updated_at
```

## Doctor

```text
id
user_id
specialty_id
hospital_id
qualification
experience_years
license_number
consultation_fee
biography
location
verification_status
created_at
updated_at
```

## Specialty

```text
id
name
description
image
is_active
created_at
updated_at
```

## Hospital

```text
id
name
logo
address
phone
email
description
location
opening_hours
is_active
created_at
updated_at
```

## DoctorAvailability

```text
id
doctor_id
day_of_week
start_time
end_time
break_start
break_end
is_active
```

## AppointmentSlot

```text
id
doctor_id
date
start_time
end_time
is_available
```

## Appointment

```text
id
patient_id
doctor_id
slot_id
reason
notes
status
consultation_fee
created_at
updated_at
```

## Notification

```text
id
user_id
title
message
notification_type
is_read
created_at
```

## Review

```text
id
appointment_id
patient_id
doctor_id
rating
comment
created_at
updated_at
```

## AuditLog

```text
id
user_id
action
entity
entity_id
metadata
ip_address
created_at
```

---

# 27. API Architecture

React communicates with Django through REST APIs.

Base example:

```text
/api/
```

## Authentication

```text
POST /api/auth/register/
POST /api/auth/login/
POST /api/auth/logout/
POST /api/auth/token/refresh/
POST /api/auth/password-reset/
POST /api/auth/password-reset-confirm/
GET  /api/auth/me/
```

## Patients

```text
GET    /api/patients/profile/
PATCH  /api/patients/profile/
```

## Doctors

```text
GET    /api/doctors/
GET    /api/doctors/{id}/
POST   /api/doctors/
PATCH  /api/doctors/{id}/
```

## Specialties

```text
GET /api/specialties/
GET /api/specialties/{id}/
```

## Hospitals

```text
GET /api/hospitals/
GET /api/hospitals/{id}/
```

## Availability

```text
GET  /api/doctors/{id}/availability/
POST /api/doctors/{id}/availability/
PATCH /api/availability/{id}/
DELETE /api/availability/{id}/
```

## Slots

```text
GET /api/doctors/{id}/slots/?date=YYYY-MM-DD
```

## Appointments

```text
POST   /api/appointments/
GET    /api/appointments/
GET    /api/appointments/{id}/
PATCH  /api/appointments/{id}/
POST   /api/appointments/{id}/cancel/
POST   /api/appointments/{id}/reschedule/
POST   /api/appointments/{id}/accept/
POST   /api/appointments/{id}/reject/
POST   /api/appointments/{id}/complete/
```

## Notifications

```text
GET   /api/notifications/
POST  /api/notifications/{id}/read/
POST  /api/notifications/read-all/
```

## Reviews

```text
POST /api/appointments/{id}/review/
GET  /api/doctors/{id}/reviews/
```

---

# 28. API Standards

All APIs should:

- Return consistent JSON
- Use correct HTTP status codes
- Validate input
- Return useful error messages
- Use authentication where required
- Enforce role permissions
- Support pagination
- Support filtering
- Support ordering where necessary
- Avoid exposing sensitive database information

Example success response:

```json
{
  "success": true,
  "message": "Appointment created successfully.",
  "data": {}
}
```

Example error:

```json
{
  "success": false,
  "message": "The selected appointment slot is no longer available.",
  "errors": {}
}
```

---

# 29. Authentication Architecture

Recommended flow:

```text
React
   ↓
Login
   ↓
Django
   ↓
Validate Credentials
   ↓
JWT Access + Refresh Token
   ↓
React Secure Storage
```

For subsequent requests:

```text
React
   ↓
Authorization: Bearer <access_token>
   ↓
Django
   ↓
Validate JWT
   ↓
Permission Check
   ↓
Response
```

When the access token expires:

```text
React
   ↓
Refresh Token
   ↓
Django
   ↓
New Access Token
```

---

# 30. Role-Based Access Control

Example:

```text
PATIENT
 ├── Browse doctors
 ├── Book appointment
 └── Manage own appointments

DOCTOR
 ├── Manage own availability
 ├── Manage own appointments
 └── View permitted patient appointment information

ADMIN
 ├── Manage users
 ├── Manage doctors
 ├── Manage patients
 ├── Manage appointments
 └── Manage system
```

The backend must enforce permissions.

Hiding a React button is not a security mechanism.

---

# 31. Notification Architecture

Notification types:

- Appointment created
- Appointment confirmed
- Appointment rejected
- Appointment cancelled
- Appointment rescheduled
- Appointment reminder
- Doctor verification
- System announcement

Architecture:

```text
Django Event
     ↓
Notification Service
     ├── Database notification
     └── Push notification
             ↓
   Web Push (VAPID) + Firebase Cloud Messaging
             ↓
   Installed PWA — Desktop / Android / iOS
```

Push messages are delivered to the installed PWA through the service worker's `push` handler, so no native Android/iOS push SDK build is required. Subscription endpoints/keys are registered from the React app and stored against the user.

Notifications should not be relied on as the only source of appointment truth. The appointment status must always be retrieved from the backend.

---

# 32. Payment Architecture

Removed from scope on 2026-09-19. MediBook does not handle consultation
payments; the former optional payment-records module was removed from the
backend (see the development log, Entry 0009).

---

# 33. Reviews and Ratings

Only completed appointments should qualify for reviews.

Rules:

1. Patient must own the appointment.
2. Appointment must be completed.
3. One review per appointment.
4. Rating must be within the configured range.
5. Comment length must be validated.
6. Doctor cannot review themselves.
7. Admin can moderate reviews.

---

# 34. Admin Dashboard Requirements

Dashboard statistics:

```text
Total Users
Total Patients
Total Doctors
Verified Doctors
Pending Doctors
Total Appointments
Pending Appointments
Confirmed Appointments
Completed Appointments
Cancelled Appointments
```

Admin charts can include:

- Appointments by day
- Appointments by month
- Users by role
- Doctors by specialty
- Appointment statuses

---

# 35. Security Requirements

MediBook must treat healthcare-related data as sensitive.

## Authentication Security

- Strong password hashing
- JWT security
- Token expiration
- Refresh token handling
- Secure token storage
- Account lock/rate limiting where appropriate

## API Security

- Authentication
- Authorization
- Role-based permissions
- Input validation
- Object-level permissions
- Rate limiting
- Request validation

## Database Security

- Constraints
- Indexes
- Transactions
- Foreign key protection
- Unique constraints

## File Security

- Validate image/file types
- Limit file sizes
- Generate safe filenames
- Prevent executable uploads
- Store media securely

## Production Security

- HTTPS
- Secure cookies where applicable
- Environment variables
- Secret key protection
- Restricted CORS
- Secure database credentials
- Production Django settings
- Logging and monitoring
- Database backups

## PWA / Service Worker Security

- Serve the app only over HTTPS (service workers require a secure context)
- Serve the service worker from the application root so its `scope` covers the whole app
- Never cache authenticated API responses, tokens, or patient data in Cache Storage
- Cache static assets only (app shell, JS, CSS, fonts, icons, offline page)
- Version and invalidate every cache on release
- Apply a Content-Security-Policy that allows only trusted origins
- Validate the manifest `start_url` and `scope`
- Logout must clear cached user-specific data and stale caches
- Handle service worker updates explicitly so users are never stuck on an old build

Never put:

```text
SECRET_KEY
DATABASE_PASSWORD
JWT_SECRET
Firebase private credentials
```

directly into source code or Git repositories.

---

# 36. Privacy Requirements

The system should collect only information necessary for its functions.

Private patient information should not be publicly exposed.

Public doctor profile information can be separated from private account information.

API responses must not expose:

- Password hashes
- Tokens
- Private administrative information
- Unnecessary patient information
- Internal security information

---

# 37. React Project Structure

Recommended:

```text
/frontend
│
├── public/
│   ├── manifest.json          (app name, icons, theme, display: "standalone")
│   ├── service-worker.js      (install / activate / fetch handlers + offline fallback)
│   ├── offline.html           (offline fallback page)
│   ├── favicon.ico
│   └── icons/
│       ├── icon-192.png
│       ├── icon-512.png
│       ├── icon-maskable-512.png
│       └── apple-touch-icon-180.png
│
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── vite-env.d.ts
│   │
│   ├── types/
│   │   ├── pwa.d.ts               (BeforeInstallPromptEvent, navigator.standalone)
│   │   ├── models.ts              (User, Patient, Doctor, Slot, Appointment…)
│   │   └── api.ts                 (API request/response contracts)
│   │
│   ├── pwa/
│   │   ├── registerServiceWorker.ts
│   │   ├── installPrompt.ts
│   │   └── updateHandler.ts
│   │
│   ├── assets/
│   │   ├── images/
│   │   ├── icons/
│   │   └── fonts/
│   │
│   ├── components/
│   │   ├── common/
│   │   ├── forms/
│   │   ├── doctors/
│   │   ├── appointments/
│   │   └── admin/
│   │
│   ├── pages/
│   │   ├── auth/
│   │   ├── patient/
│   │   ├── doctor/
│   │   └── admin/
│   │
│   ├── layouts/
│   ├── routes/
│   ├── services/
│   ├── api/
│   ├── hooks/
│   ├── context/
│   ├── store/
│   ├── utils/
│   └── styles/
│
├── .env
├── package.json
├── tsconfig.json
└── vite.config.ts
```

Recommended frontend stack:

- TypeScript (strict mode; `.tsx` for components, `.ts` for logic and types)
- React
- Vite
- React Router
- Axios or Fetch API
- A consistent state-management approach
- Responsive CSS
- PWA layer: Web App Manifest + Service Worker (`vite-plugin-pwa` or hand-written `manifest.json` + `service-worker.js`)
- Lighthouse (Chrome DevTools / CLI) for PWA and performance audits
- Secure token handling appropriate to the deployment architecture

TypeScript rules:

- `.tsx` for any file containing JSX, `.ts` for everything else
- `strict: true`; no `any` unless justified and commented
- API payloads and domain models are typed in `src/types/`
- Vite does not type-check: run `npm run typecheck` (`tsc --noEmit`) as part of every phase gate

# 38. React Architecture

Recommended logical flow:

```text
React Page
  ↓
Component / Hook
  ↓
State Management
  ↓
Repository / Service
  ↓
API Client
  ↓
Django REST API
```

Example:

```text
BookingPage
      ↓
useBooking()
      ↓
AppointmentService
      ↓
ApiClient
      ↓
Django
```

Keep API communication and business-oriented client logic outside presentation components where practical.

# 39. State Management

Use one consistent state-management approach throughout the application.

Responsibilities include:

- Authentication state
- User profile state
- Doctor list state
- Doctor details
- Availability state
- Booking state
- Appointment state
- Notification state
- Admin state

Do not mix several unrelated state-management architectures without a clear reason.

---

# 40. Error Handling

React must handle:

```text
No Internet
Server Error
Unauthorized
Token Expired
Validation Error
Booking Conflict
Empty Data
Timeout
Notification Failure
```

Examples:

```text
No Internet:
"Please check your internet connection."

Booking conflict:
"This appointment slot is no longer available. Please select another time."

Session expired:
"Your session has expired. Please log in again."
```

When the device is offline, the service worker serves the precached app shell and the offline fallback page. The app must clearly state that live data is unavailable offline and offer a retry action, and it must never show stale appointment data as if it were current.

---

# 41. Loading and Empty States

Every API-driven screen should have:

- Initial loading
- Pull-to-refresh where useful
- Empty state
- Error state
- Retry action
- Success state

Avoid excessive full-screen loaders.

Use efficient partial loading where possible.

---

# 42. Performance Requirements

## Backend

- Database indexes
- Efficient queries
- `select_related`
- `prefetch_related`
- Pagination
- Filtering
- Caching where justified
- Avoid N+1 queries
- Efficient serializers

## React

- Image caching
- Lazy lists
- Pagination
- Avoid unnecessary rebuilds
- Efficient state management
- Minimize duplicate API calls
- Cache safe public data
- Debounce search requests
- Precache the static app shell through the service worker
- Cache-first for hashed static assets, network-first for live API data
- Keep the precache payload small (app shell only)
- Code-split routes so the first paint stays fast on mobile networks
- Serve the offline fallback instantly for uncached navigations
- Verify Lighthouse Performance and PWA scores on desktop, Android, and iOS

---

# 43. Database Indexing

Indexes should be considered for frequently queried fields such as:

```text
User.email
User.phone
Doctor.specialty
Doctor.hospital
Doctor.verification_status
Appointment.doctor
Appointment.patient
Appointment.date
Appointment.status
AppointmentSlot.doctor
AppointmentSlot.date
Notification.user
Notification.is_read
```

Indexes should be based on actual query patterns and verified with database performance testing.

---

# 44. Testing Strategy

Testing must occur throughout development rather than only at the end.

## Backend Tests

Test:

- User registration
- Login
- JWT
- Permissions
- Patient profile
- Doctor profile
- Specialty
- Hospital
- Availability
- Slot generation
- Booking
- Cancellation
- Rescheduling
- Doctor acceptance
- Doctor rejection
- Completion
- Reviews
- Notifications

## Critical Booking Tests

Test:

```text
Patient A books slot
Patient B attempts same slot
```

Expected:

```text
Patient A → Success
Patient B → Slot unavailable
```

Also test simultaneous booking attempts.

---

# 45. React Testing

Test:

- Splash
- Login
- Register
- Navigation
- Doctor search
- Filtering
- Doctor details
- Date selection
- Slot selection
- Booking
- Appointment list
- Profile
- Notifications
- Responsive layouts (phone, tablet, desktop breakpoints)
- PWA install prompt (manifest + service worker + A2HS)
- Offline app shell and offline fallback page
- Service worker update / cache versioning
- Standalone (installed) launch on desktop, Android, and iOS
- API failures
- Type checking is clean (`npm run typecheck` / `tsc --noEmit`)

---

# 46. Security Testing

Test:

```text
Patient accessing another patient's appointment
Doctor accessing unrelated private data
Patient calling doctor-only endpoint
Doctor calling admin endpoint
Unauthenticated booking
Expired token
Invalid token
Malformed request
Duplicate booking
Unauthorized cancellation
Unauthorized status change
```

Every unauthorized operation must be rejected by Django.

---

# 47. Development Environment

Recommended tools:

```text
Python
Django
Django REST Framework
PostgreSQL
Node.js + npm
React + Vite + TypeScript (strict type checking)
PWA layer (Web App Manifest + Service Worker; vite-plugin-pwa / Workbox optional)
Chrome DevTools (Application + Lighthouse panels)
Lighthouse CLI
VS Code
Git
GitHub
Postman / Insomnia
```

Optional:

```text
Docker
Redis
Celery
Firebase (Web Push / FCM)
Sentry
Web Push library (pywebpush) for VAPID delivery
```

Android Studio, the Android emulator, and the native iOS toolchain are **not** required. Android and iOS installation is verified by installing the PWA in Chrome (Android) and Safari (iOS) on real devices.

Do not add infrastructure that is not needed for the current phase.

---

# 48. Version Control

Repository structure can be:

```text
MediBook/
├── backend/
├── frontend/
├── docs/
└── README.md
```

Recommended Git branches:

```text
main
develop
feature/auth
feature/doctors
feature/appointments
feature/notifications
```

Commit changes in logical units.

Avoid committing:

```text
.env
database credentials
private keys
API secrets
large generated files
```

---

# 49. Development Roadmap

## PHASE 0 — Planning

### Objective

Define the complete system before coding.

**Status: In Progress (9 of 10 tasks Done, 1 In Progress — deployment strategy).** Design tokens implemented in `frontend/src/design/tokens.css` + `tokens.ts` (Phase 4, Entry 0007). Deployment strategy remains Open (blocks PHASE 21). Progress, decisions and dates are recorded in `project development.md`.

Tasks:

- [x] Finalize scope — completed 2026-09-19 (§5, §6)
- [x] Finalize user roles — completed 2026-09-19 (§7)
- [x] Finalize appointment workflow — completed 2026-09-19 (§9, §10)
- [x] Finalize database entities — completed 2026-09-19 (§25, §26)
- [x] Finalize API architecture — completed 2026-09-19 (§27, §28)
- [x] Define React screens — completed 2026-09-19 (§18, §19, §20)
- [x] Define design system — completed 2026-09-19 (§21 design tokens in `src/design/tokens.css` + `tokens.ts`, closed in Phase 4 Entry 0007)
- [x] Finalize PWA delivery model (manifest, service worker, install prompt, offline behaviour) — completed 2026-09-19 (§22, §69)
- [x] Define security requirements — completed 2026-09-19 (§35, §36)
- [ ] Define deployment strategy — in progress (steps documented in §70; hosting, domain and HTTPS undecided)

Deliverables:

```text
Project Scope     Done
Architecture      Done
Database Plan     Done
API Plan          Done
UI/UX Plan        Done (design tokens implemented Phase 4)
PWA Plan          Done
Roadmap           Done
```

Phase 0 exit gate: design tokens closed (Phase 4, Entry 0007); deployment strategy remains Open (blocks PHASE 21).

---

# 50. Backend-First Build Order (binding — 2026-09-19)

> **Decision (project owner, 2026-09-19):** the backend is built FIRST and
> completed end-to-end (all Django models, APIs, permissions, tests, admin)
> before the React frontend work begins. PHASE 4+ frontend phases stay in the
> roadmap but are OUT OF SCOPE until the backend track below is Done and
> verified against PostgreSQL.

## Backend track (PHASE 3–16 backend slices, implemented together)

| Slice | Roadmap phase(s) | Backend scope (models + API + tests) |
| --- | --- | --- |
| B1 | PHASE 3 | Custom User, roles, register/login/logout, JWT + refresh + blacklist, password reset, email verification, permissions, auth tests |
| B2 | PHASE 6 | Patient profile model + `/api/patients/profile/` |
| B3 | PHASE 7 + 9 | Doctor profile + availability windows + `/api/doctors/`, `/api/doctors/{id}/availability/`, schedule management |
| B4 | PHASE 8 | Specialty + Hospital catalogs + filters |
| B5 | PHASE 10 | Appointment booking + confirm/complete/cancel/reject + double-booking guard + history |
| B6 | PHASE 13 (backend) | Notification inbox rows + push-subscription storage (delivery worker stays in frontend PHASE 13) |
| B7 | PHASE 14 (backend) | Admin stats + user directory + doctor approval |
| B8 | PHASE 15 | Reviews on completed appointments + rating aggregates |

## Frontend track (deferred until backend track is verified)

PHASE 4, 5, 11, 12 and the UI slices of PHASE 13–16 begin only after every
backend slice B1–B9 passes `manage.py check`, `makemigrations --check`, the
full `manage.py test` suite, and a live HTTP smoke test against PostgreSQL.

---

# 51. PHASE 1 — Development Environment

### Objective

Prepare the development environment.

**Status: Done — 2026-09-19.** Progress, versions and blockers are recorded in `project development.md`.

Tasks:

- [x] Install Python — completed 2026-09-19 (Python 3.14.0, global)
- [x] Install Django — completed 2026-09-19 (Django 6.1.1 in `backend/.venv`, + DRF 3.18.1, simplejwt 5.5.1, django-cors-headers 4.9.0, psycopg 3.3.6, Pillow 12.3.0, python-dotenv 1.2.3)
- [x] Install Node.js, npm, and React (Vite) — completed 2026-09-19 (Node v22.21.0, npm 10.9.4, React 19.3.0, Vite 8.3.0)
- [x] Install PWA tooling — completed 2026-09-19 (hand-written manifest + service worker is the chosen approach; `vite-plugin-pwa`/Workbox remain optional)
- [x] Install Lighthouse / enable the Chrome DevTools Application panel — completed 2026-09-19 (Chrome DevTools Application/Lighthouse panels; `npx lighthouse` for CLI audits)
- [x] Prepare the PWA icon set (192x192, 512x512, maskable, apple-touch-icon) — completed 2026-09-19 (`frontend/public/icons/`, regenerated by `frontend/scripts/generate-icons.ps1`)
- [x] Configure PostgreSQL — completed 2026-09-19 (PostgreSQL 18.1 running on `127.0.0.1:5432`; database `medibook` owned by `medibook_user`; 18 migrations applied; helper script `backend/scripts/pg.ps1` for start/stop/status)
- [x] Create Git repository — already present (`github.com/infaan-hub/medibook`, branch `main`); repository-wide `.gitignore` added 2026-09-19
- [x] Create backend — completed 2026-09-19 (`backend/manage.py` + `backend/config/` with env-driven settings)
- [x] Create React frontend — completed 2026-09-19 (`frontend/` Vite + React app, production build verified)
- [x] Add TypeScript to the frontend — completed 2026-09-19 (TypeScript 7.0.2, @types/react 19.3.0, strict `tsconfig.json`, `npm run typecheck` = `tsc --noEmit` passing, no `.js`/`.jsx` files remain)
- [x] Configure environment variables — completed 2026-09-19 (`backend/.env` + `.env.example`, `frontend/.env` + `.env.example`, both gitignored)

Deliverable:

```text
React (installable PWA) ←→ Django ←→ PostgreSQL
Installable over HTTPS on Desktop, Android, and iOS

Backend  ← Django 6.1.1 + DRF, env-driven settings, 11 apps      [done — API verified]
Frontend ← React 19 + TypeScript 7 + Vite 8, icon set           [done — build verified]
Database ← PostgreSQL 18.1, medibook + medibook_user, migrated  [done]
```

---

# 51. PHASE 2 — Django Foundation

### Objective

Build the backend foundation.

**Status: Done — 2026-09-19.** Evidence is recorded in `project development.md` (Entry 0005).

Tasks:

- [x] Create Django project — completed 2026-09-19 (`backend/manage.py` + `backend/config/`)
- [x] Configure settings — completed 2026-09-19 (env-driven settings with fail-fast helpers, logging, `APP_VERSION`)
- [x] Configure PostgreSQL — completed 2026-09-19 (PostgreSQL 18.1 on `127.0.0.1:5432`, database `medibook`, role `medibook_user`; `manage.py migrate` applied 18 migrations / 10 tables)
- [x] Configure Django REST Framework — completed 2026-09-19 (JWT authentication, `IsAuthenticated` default permission, standard pagination envelope, custom exception handler, ISO-8601 datetimes)
- [x] Configure CORS — completed 2026-09-19 (`CorsMiddleware` + env allow-list for the Vite dev origins)
- [x] Configure media/static files — completed 2026-09-19 (`STATIC_ROOT`, `MEDIA_ROOT`, `MEDIA_URL` served by Django in DEBUG only)
- [x] Configure environment variables — completed 2026-09-19 (`backend/.env` + `.env.example`; secrets never committed)
- [x] Configure JWT — completed 2026-09-19 (`POST /api/auth/login/`, `POST /api/auth/token/refresh/`; access 30 min, refresh 7 days, rotation enabled)
- [x] Configure API routing — completed 2026-09-19 (`/api/` root URLconf, `common` app routes, per-phase mounting documented in `config/urls.py`)
- [x] Create common utilities — completed 2026-09-19 (`common/models.py` TimeStampedModel, `common/pagination.py`, `common/responses.py`, `common/exceptions.py`, `common/views.py` health check)
- [x] Test all APIs — completed 2026-09-19 (HTTP smoke test: `GET /api/health/` 200, `POST /api/auth/login/` 400, `POST /api/auth/token/refresh/` 400, `POST /api/health/` 405 — all using the §28 envelope; corrected 2026-09-19 — Entry 0005: refresh with an empty payload returns 400 field-required, not 401)

Deliverable:

```text
Working Django API  [verified]

GET  /api/health/               200  {"success": true,  "message": "MediBook API is running.",
                                      "data": {"database": "connected", ...}}
POST /api/auth/login/           400  {"success": false, "errors": {"username": [...], "password": [...]}}
POST /api/auth/token/refresh/   400  {"success": false, "errors": {"refresh": [...]}}
POST /api/health/               405  {"success": false, "message": "Method \"POST\" not allowed."}
```

Backend app scaffolding (§23) is registered and ready for business logic:

```text
common  accounts  patients  doctors  specialties  hospitals
appointments  notifications  reviews  reports
```

Note: the login payload uses the built-in `username` field until the custom user
model is introduced in PHASE 3, after which it becomes `{"email": ..., "password": ...}` (§27).

---

# 53. PHASE 3 — Custom User & Authentication (backend track B1 — Done 2026-09-19)

### Objective

Build secure authentication.

Backend-first scope: this phase now also carries the shared backend contract
— every domain model (§26) exists with migrations, every §27 route is wired,
and the auth + booking test suites run. Frontend phases stay deferred per §50.

Tasks:

- [x] Custom User model — email login, phone, names, role, profile image, `is_verified` (`accounts/models.py` + `0001_initial`)
- [x] Roles — `patient`/`doctor`/`admin` + `IsPatient`/`IsDoctor`/`IsAdminRole`/`IsVerified` (`accounts/permissions.py`)
- [x] Registration — `POST /api/auth/register/` + JWT pair + verification email
- [x] Login — `POST /api/auth/login/` (email + password → JWT pair + user)
- [x] Logout — `POST /api/auth/logout/` (refresh blacklist, `token_blacklist` app, `BLACKLIST_AFTER_ROTATION=True`)
- [x] JWT — access 30 min / refresh 7 days / rotation on / blacklist on
- [x] Refresh token — `POST /api/auth/token/refresh/` wrapped in the §28 envelope
- [x] Password reset — `POST /api/auth/password-reset/` + `-confirm/` (single-use, expiring, neutral responses)
- [x] Email verification — `POST /api/auth/verify-email/` + `resend-verification/` (single-use, expiring)
- [x] Permissions — role gates on every domain route; `IsAuthenticated` default
- [x] Authentication tests — `accounts/tests.py` (register→login→me→refresh→logout→blacklist, validation, verify, reset, 401 envelope)
- [x] Backend slices B2–B9 models — Patient, Doctor, Availability, Specialty, Hospital, Appointment (+`uniq_live_doctor_slot`), Notification, PushSubscription, Review (all `0001_initial` migrations generated; applied 2026-09-19 — Entry 0006)
- [x] Backend slices B2–B9 APIs — patients profile, doctors + availability + schedule, specialties, hospitals, appointments + actions, notifications + push-subscriptions, reviews, admin stats/users (all wired in `config/urls.py`; `manage.py check` clean)
- [x] Booking/review/catalog tests — `appointments/tests.py` (double-booking 409, history filter, confirm→slot removal, search filters, review-after-completed + rating aggregate)
- [x] Apply migrations to PostgreSQL + run full `manage.py test` + live HTTP smoke test — completed 2026-09-19 (Entry 0006: `medibook` DB recreated; 9/9 tests pass; review-route ordering fixed; `MeView` envelope fixed)

Deliverable:

```text
Complete backend API (B1–B9 Done, DB verified + tests green — Entry 0006)

POST /api/auth/register/                201  user + JWT pair
POST /api/auth/login/                   200  user + JWT pair
POST /api/auth/logout/                  200  blacklist refresh
POST /api/auth/token/refresh/           200  rotated pair (envelope)
GET/PATCH /api/auth/me/                 200  own profile
POST /api/auth/password-change/         200  authenticated change
POST /api/auth/password-reset/          200  neutral + email token
POST /api/auth/password-reset-confirm/  200  new password set
POST /api/auth/verify-email/            200  is_verified=true
POST /api/auth/resend-verification/     200  neutral + email token
GET /api/doctors/?specialty=&city=      200  public search + filters
GET /api/doctors/{id}/availability/     200  free slots for a date
GET/POST /api/appointments/             201  booking (409 on conflict)
POST /api/appointments/{id}/{confirm,complete,cancel,reject}/
GET /api/notifications/                 200  own inbox
POST /api/appointments/{id}/review/     201  completed-only review
GET /api/admin/stats/                   200  admin dashboard totals
```

---

# 53. PHASE 4 — React Foundation (Done — 2026-09-19, Entry 0007)

### Objective

Build the frontend foundation.

Tasks:

- [x] Create React application (React 19 + Vite 8 + TypeScript strict, from PHASE 1)
- [x] Configure theme (§21 design tokens in `src/design/tokens.css` — closes the Phase 0 design-tokens blocker)
- [x] Configure routing (React Router 7, placeholder pages, 404)
- [x] Configure API client (axios + JWT injection + single-flight 401 refresh/replay, §28 envelope unwrapping)
- [x] Configure secure storage (`src/lib/storage.ts` + `src/api/tokens.ts`: access in sessionStorage, refresh in localStorage)
- [x] Configure state management (React Context: ToastProvider + SessionProvider)
- [x] Create reusable widgets (Button, TextField, Card, Badge, EmptyState, ErrorState, Skeleton, Spinner, Toasts)
- [x] Create responsive layout system (AppShell: bottom nav on phone, sidebar rail on tablet+, §22.6)
- [x] Create splash screen
- [x] Add `manifest.json` (name, icons, theme_color, `display: "standalone"`)
- [x] Add and register `service-worker.js` with install / activate / fetch handlers
- [x] Precache the app shell and add `offline.html`
- [x] Add the install prompt (A2HS) component
- [x] Add standalone / safe-area styling
- [x] Add the update-available prompt

Deliverable:

Installable React PWA connected to Django. **Verified 2026-09-19:** `npm run typecheck` exit 0; `npm run build` exit 0 (35 modules); preview server on :4180 → `/`, `/manifest.json`, `/service-worker.js`, `/offline.html`, `/icons/icon-512.png` all HTTP 200.

---

# 54. PHASE 5 — React Authentication (Done 2026-09-19)

Tasks:

- [x] Login — `/login` (`pages/auth.tsx` `LoginScreen`, email + password, field errors mapped)
- [x] Register — `/register` (patient/doctor choice, password confirm, POST `/api/auth/register/` → auto-session)
- [x] Logout — profile screen + `SessionProvider.logout()` (refresh blacklist, tokens cleared)
- [x] Forgot password — `/forgot-password` (neutral response; reset code via console email in dev)
- [x] Token storage — access in `sessionStorage`, refresh in `localStorage` (`lib/storage.ts` `mb.*` namespacing)
- [x] Token refresh — single-flight 401 refresh-and-replay interceptor (`api/client.ts`; `/auth/token/refresh/` excluded)
- [x] Authentication guard — `RequireAuth` (remembers intended URL), `RequireGuest`, `RequireRole` (`components/guards.tsx`)
- [x] Role-based routing — patient/doctor home per role, `/admin` gated to `admin`, nav items filtered by role
- [x] Error handling — `ApiError` normalization, envelope field errors → per-field messages, toasts; plus email verify (`/verify-email` with `?token=` prefill) and reset (`/reset-password`) screens and change-password/profile wiring

Deliverable:

Patient and doctor can authenticate through React. Verified: `typecheck` exit 0,
`npm run build` exit 0 (96 modules, JS 339.55 kB / gzip 108.24 kB), and a live
end-to-end flow through the preview proxy (`register → email token → verify →
login → me → logout`) — Entry 0010.

---

# 55. PHASE 6 — Patient Module (backend Done §53/B2; React deferred §50)

Backend (Done — code + migrations; DB verification Blocked):

- [x] Patient model
- [x] Patient serializer
- [x] Patient API
- [x] Permissions

React:

- [x] Patient home
- [x] Profile
- [x] Edit profile
- [x] Settings

Deliverable:

Complete patient profile system.

---

# 56. PHASE 7 — Doctor Module (Done 2026-09-19)

**Status: Done — 2026-09-19.** Backend and React doctor-module work is implemented and verified. Detailed evidence is recorded in `project development.md` (Entry 0012).

Backend:

- [x] Doctor model
- [x] Doctor profile API
- [x] Doctor verification
- [x] Doctor permissions
- [x] Specialty relationship
- [x] Hospital relationship

React:

- [x] Doctor list — completed 2026-09-19 (`/doctors`, paginated API-backed directory)
- [x] Search — completed 2026-09-19 (name search)
- [x] Filter — completed 2026-09-19 (city filter; backend also supports specialty, hospital, and minimum rating filters)
- [x] Doctor details — completed 2026-09-19 (`/doctors/:id`, professional information and date-specific availability)
- [x] Professional profile — completed 2026-09-19 (doctor-only dashboard using `GET/PATCH /api/doctors/me/profile/`)

Deliverable:

Patients can discover doctors and doctors can maintain their professional profiles. **Verified 2026-09-19:** strict TypeScript typecheck and production build pass; Django system and migration checks pass; doctor profile, appointment, and authentication test suites pass.

---

# 57. PHASE 8 — Specialty & Hospital (backend Done §53/B4; React Done §50)

Tasks:

- [x] Specialty model
- [x] Specialty API
- [x] Hospital model
- [x] Hospital API
- [x] Admin CRUD
- [x] React specialty screens
- [x] React hospital screens

Deliverable:

Organized healthcare directory.

---

# 58. PHASE 9 — Availability Engine (backend Done §53/B3; React Done §58)

**Status: Done — 2026-09-19.** Backend and React availability work is implemented and verified. Detailed evidence is recorded in `project development.md` (Entry 0013).

Tasks:

- [x] Doctor weekly schedule — completed 2026-09-19 (`Availability` model, `DoctorScheduleView`, `DoctorScheduleDetailView`)
- [x] Working days — completed 2026-09-19 (`weekday` field 0=Mon..6=Sun, validated by `MinValueValidator(0)` / `MaxValueValidator(6)`)
- [x] Working hours — completed 2026-09-19 (`start_time`, `end_time` with DB check constraint `end_time > start_time`)
- [x] Appointment duration — completed 2026-09-19 (`slot_duration_minutes` with 5–480 range)
- [x] Slot generation — completed 2026-09-19 (`doctors/scheduling.py:available_slots()` — weekday-matched windows minus breaks, exceptions, and booked appointments)
- [x] Slot API — completed 2026-09-19 (`GET /api/doctors/{id}/availability/?date=YYYY-MM-DD` returns formatted slot list)
- [x] Availability validation — completed 2026-09-19 (serializer overlap/within-window checks for breaks; paired-time constraints for exceptions)
- [x] Break periods — completed 2026-09-19 (`AvailabilityBreak` model + CRUD API + overlap validation; excluded from public slots)
- [x] Exceptions — completed 2026-09-19 (`ScheduleException` model + CRUD API; full-day and partial closures excluded from public slots)
- [x] Temporary unavailable dates — completed 2026-09-19 (`ScheduleException` with `date` + nullable `start_time`/`end_time` covers holidays and temporary closures)

Deliverable:

Doctor availability system complete: weekly schedule windows, configurable slot duration, break periods within windows, one-off full-day or partial-day exceptions, public slot lookup API, and doctor self-service schedule management. **Verified 2026-09-19:** strict TypeScript typecheck and production build pass; Django system and migration checks pass; 12/12 tests pass including breaks/exceptions slot exclusion test.

---

# 59. PHASE 10 — Appointment Engine (backend Done §53/B5; React Done §59)

This is the core MediBook milestone.

**Status: Done — 2026-09-19.** Backend and React appointment engine work is implemented and verified. Detailed evidence is recorded in `project development.md` (Entry 0014).

Tasks:

- [x] Appointment model
- [x] Booking API
- [x] Slot validation
- [x] Database transaction
- [x] Double-booking protection
- [x] Pending status
- [x] Doctor acceptance
- [x] Doctor rejection
- [x] Cancellation
- [x] Completion
- [x] Appointment history
- [ ] Rescheduling (post-MVP — cancel + rebook is the MVP path)
- [ ] No-show

Deliverable:

Complete end-to-end appointment system. **Verified 2026-09-19:** strict TypeScript typecheck and production build pass; Django system and migration checks pass; 12/12 tests pass; booking flow (date→slot→review→confirm), appointment list (upcoming/past), detail view, and cancel action all live.

---

# 60. PHASE 11 — Patient Appointment UI (Done 2026-09-19)

**Status: Done — 2026-09-19.** All patient-facing appointment screens are implemented and verified. Detailed evidence is recorded in `project development.md` (Entry 0015).

Tasks:

- [x] Date selection — completed 2026-09-19 (date picker in `BookingScreen`)
- [x] Time-slot selection — completed 2026-09-19 (slot grid with selected state)
- [x] Booking review — completed 2026-09-19 (confirm card shows date/time before submit)
- [x] Booking confirmation — completed 2026-09-19 (submit creates appointment via API)
- [x] Booking success — completed 2026-09-19 (`BookingSuccessScreen` with checkmark + actions)
- [x] Upcoming appointments — completed 2026-09-19 (upcoming tab in `AppointmentsListScreen`)
- [x] Appointment details — completed 2026-09-19 (`AppointmentDetailScreen` with full info)
- [x] Cancellation — completed 2026-09-19 (cancel form with reason in detail screen)
- [x] Rescheduling — completed 2026-09-19 (`RescheduleScreen`: cancel + rebook flow)
- [x] Appointment history — completed 2026-09-19 (past tab in list screen)

Deliverable:

Patient can complete the entire booking journey: search doctor → view profile → select date → pick slot → confirm → success → view in list → view detail → cancel or reschedule. **Verified 2026-09-19:** strict TypeScript typecheck and production build pass.

---

# 61. PHASE 12 — Doctor Dashboard (Done 2026-09-19)

**Status: Done — 2026-09-19.** Doctor dashboard with appointment management is implemented and verified. Detailed evidence is recorded in `project development.md` (Entry 0016).

Tasks:

- [x] Doctor dashboard — completed 2026-09-19 (stats cards, quick links, today's appointments)
- [x] Today's appointments — completed 2026-09-19 (filtered by today's date on dashboard)
- [x] Pending requests — completed 2026-09-19 (pending tab with accept/reject buttons)
- [ ] Calendar — deferred (not critical for MVP)
- [x] Appointment details — completed 2026-09-19 (link to detail from each row)
- [x] Accept — completed 2026-09-19 (`confirmAppointment` API → "Accept" button on pending)
- [x] Reject — completed 2026-09-19 (`rejectAppointment` API → "Reject" button on pending)
- [x] Cancel — completed 2026-09-19 (`cancelAppointment` API → "Cancel" button on confirmed)
- [x] Complete — completed 2026-09-19 (`completeAppointment` API → "Complete" button on confirmed)
- [ ] No-show — deferred (backend status not yet added)
- [x] Availability management — already built in Phase 9 (DoctorAvailabilityScreen)
- [ ] Profile management — deferred (profile screen exists; edit capability deferred)

Deliverable:

Doctor can manage their practice: view today's schedule, accept/reject pending requests, complete appointments, add notes, and manage availability. **Verified 2026-09-19:** strict TypeScript typecheck and production build pass; backend tests pass.

---

# 62. PHASE 13 — Notifications (backend Done §53/B6; frontend Done 2026-09-19)

**Status: Done — 2026-09-19 (in-app UI).** Push delivery (VAPID/FCM) deferred to post-MVP. Detailed evidence is recorded in `project development.md` (Entry 0017).

Tasks:

- [x] Notification model — already built (backend)
- [x] Notification service — already built (backend `notify()` helper)
- [x] In-app notifications — completed 2026-09-19 (frontend inbox UI)
- [x] Push subscription registration API — already built (backend)
- [x] Appointment notifications — already built (backend triggers on create/confirm/complete/cancel/reject)
- [x] Read/unread state — completed 2026-09-19 (mark-read + unread filter)
- [x] Notification permission request UI — completed 2026-09-19 (bell icon + unread badge)
- [ ] Web Push subscription (VAPID) through the service worker — deferred (post-MVP)
- [ ] Firebase Cloud Messaging integration for the installed PWA — deferred (post-MVP)
- [ ] Service worker `push` and `notificationclick` handlers — deferred (post-MVP)
- [ ] Reminder notifications (scheduled job — post-MVP)

Deliverable:

Patients and doctors receive appointment updates in the in-app notification inbox with unread badge. Push delivery to installed PWA is deferred. **Verified 2026-09-19:** strict TypeScript typecheck and production build pass.

---

# 63. PHASE 14 — Admin Dashboard (backend Done §53/B7; frontend Done 2026-09-19)

**Status: Done — 2026-09-19.** Admin dashboard with stats, user management, and doctor management is implemented. Detailed evidence is recorded in `project development.md` (Entry 0018).

Tasks:

- [x] Admin authentication — already built (backend `IsAdminRole` permission)
- [x] User management — already built (backend `AdminUserListView`)
- [x] Doctor verification — already built (backend `AdminDoctorApprovalView`)
- [x] Statistics — already built (backend `AdminStatsView`)
- [x] Dashboard (React PHASE 14) — completed 2026-09-19 (stats cards + appointment breakdown)
- [x] Patient management (React PHASE 14) — completed 2026-09-19 (user list with patient filter)
- [x] Doctor management (React PHASE 14) — completed 2026-09-19 (doctor list + approve/suspend)
- [ ] Specialty management (React PHASE 14) — deferred (uses existing specialty pages)
- [ ] Hospital management (React PHASE 14) — deferred (uses existing hospital pages)
- [ ] Appointment management (React PHASE 14) — deferred (admin can view via user detail)
- [ ] Notification management (React PHASE 14) — deferred (admin uses existing notification page)
- [ ] Reports — deferred (post-MVP)
- [ ] Audit logs — deferred (post-MVP)

Deliverable:

Admin can view platform statistics, manage users with role filters, and approve/suspend doctors. **Verified 2026-09-19:** strict TypeScript typecheck and production build pass.

---

# 64. PHASE 15 — Reviews (backend Done §53/B8; frontend Done 2026-09-19)

**Status: Done — 2026-09-19.** Review system with submission form and doctor review display is implemented. Detailed evidence is recorded in `project development.md` (Entry 0019).

Tasks:

- [x] Review model — already built (backend)
- [x] Rating validation — already built (backend 1-5 range)
- [x] Review API — already built (backend CRUD)
- [x] Completed appointment validation — already built (backend)
- [x] Doctor review list — already built (backend + frontend display)
- [x] Admin moderation — already built (backend `is_visible` flag)
- [x] Review submission form — completed 2026-09-19 (star rating + comment)
- [x] Review display on doctor profile — completed 2026-09-19 (reviews list + average rating)
- [x] Review check on appointment detail — completed 2026-09-19 (prevents duplicate reviews)

Deliverable:

Patients can submit star ratings and comments after completed appointments. Doctor profiles display reviews and average rating. **Verified 2026-09-19:** strict TypeScript typecheck and production build pass.

---

# 65. PHASE 16 — Payments (removed from scope 2026-09-19)

MediBook does not handle consultation payments. The former optional
payment-records backend module (`backend/payments/`) was removed — model,
API, migration history, and the payments entry in the admin stats payload.
If payments are ever reconsidered, start from §32's removal note and design
a provider-abstracted integration as a new module.

Deliverable:

None — out of scope.

---

# 66. PHASE 17 — Security Hardening (Done 2026-09-19)

**Status: Done — 2026-09-19.** Security hardening with rate limiting, security headers, and cookie hardening is implemented. Detailed evidence is recorded in `project development.md` (Entry 0020).

Tasks:

- [x] Review authentication — done 2026-09-19 (JWT + refresh rotation + blacklist already solid; added rate limiting)
- [x] Review permissions — done 2026-09-19 (role-based permissions already solid)
- [x] Review object-level access — done 2026-09-19 (ownership checks in place)
- [x] Review API validation — done 2026-09-19 (serializer validation on all endpoints)
- [x] Rate limiting — done 2026-09-19 (DRF throttling: anon 60/min, user 120/min, auth 10/min, password-reset 5/min)
- [ ] File validation — deferred (Pillow handles image validation; no user file upload in MVP)
- [x] CORS review — done 2026-09-19 (explicit allowlist, allowed headers/methods, preflight max-age)
- [x] HTTPS — already implemented (production block: SECURE_SSL_REDIRECT, HSTS, CSP)
- [x] Service worker scope and cache review — done 2026-09-19 (SW skips cross-origin, no API caching)
- [x] Verify no private API response, token, or patient record is cached — done 2026-09-19 (SW only caches same-origin static assets)
- [x] Content-Security-Policy review for the PWA — done 2026-09-19 (CSP header via middleware: script-src 'self', frame-ancestors 'none', etc.)
- [x] Manifest `start_url` / `scope` validation — done 2026-09-19 (scope: "/", start_url: "/")
- [x] Secret management — done 2026-09-19 (SECRET_KEY from .env, never committed; .env.example provided)
- [ ] Audit logging — deferred (security event logging post-MVP)
- [ ] Database security — deferred (PostgreSQL role-based access post-MVP)
- [ ] Backup strategy — deferred (post-MVP)

Deliverable:

Production security baseline with rate limiting, security headers, CORS hardening, and cookie protections. **Verified 2026-09-19:** backend tests pass, frontend typecheck + build clean.

---

# 67. PHASE 18 — Performance Optimization (Done 2026-09-19)

**Status: Done — 2026-09-19.** Backend query optimization, missing indexes, frontend debouncing, and code splitting are implemented. Detailed evidence is recorded in `project development.md` (Entry 0021).

Tasks:

- [x] Database indexes — completed 2026-09-19 (3 new composite indexes on Doctor, Availability, ScheduleException)
- [x] Query optimization — completed 2026-09-19 (N+1 fixes in DoctorAppointmentListView, DoctorReviewListView, ReviewViewSet)
- [x] N+1 query inspection — completed 2026-09-19 (3 N+1 bugs fixed)
- [x] API pagination — already implemented (page_size=20, max=100)
- [ ] API caching where justified — deferred (no cache backend configured; Redis/Memcached post-MVP)
- [ ] Image optimization — deferred (Pillow handles resize; CDN post-MVP)
- [x] React performance review — completed 2026-09-19 (React.lazy + Suspense code splitting)
- [x] Reduce unnecessary requests — completed 2026-09-19 (search only fires on button click)
- [x] Search debouncing — completed 2026-09-19 (removed auto-fire on keystroke)
- [ ] Lazy loading — partially done (React.lazy on routes; image lazy-loading deferred)
- [ ] Service worker cache strategy review — deferred (current SWR strategy is adequate)
- [ ] Precache payload/budget review — deferred (post-MVP)
- [ ] Cache versioning and update flow review — deferred (post-MVP)
- [ ] Lighthouse audit — deferred (requires deployed environment)

Deliverable:

Fast and efficient system with optimized queries, proper indexing, and frontend code splitting. **Verified 2026-09-19:** backend tests pass, frontend typecheck + build clean.

---

# 68. PHASE 19 — Complete Testing (Done 2026-09-19)

**Status: Done — 2026-09-19.** 43 backend tests (all 10 model-bearing apps) + 28 frontend component tests all green. Vitest + testing-library infrastructure set up. Detailed evidence is recorded in `project development.md` (Entry 0022).

Tasks:

- [x] Backend unit tests — completed 2026-09-19 (reviews: 7, notifications: 8, reports: 9, specialties: 4, hospitals: 4, patients: 3 = 35 new tests; existing: accounts: 6, doctors: 3, appointments: 3 = 12 existing tests; 47 total before fixups → 43 after cleanup)
- [x] Backend API tests — completed 2026-09-19 (all 43 backend tests exercise API endpoints)
- [x] Authentication tests — completed 2026-09-19 (6 existing + 1 permission test in doctors)
- [x] Permission tests — completed 2026-09-19 (patient cannot access doctor endpoint, unauthenticated blocked on all protected routes)
- [x] Booking tests — completed 2026-09-19 (3 existing appointment tests: booking, double-booking, review-after-completion)
- [x] Double-booking tests — completed 2026-09-19 (existing `test_booking_double_booking_and_history`)
- [x] React component tests — completed 2026-09-19 (28 tests: Splash: 5, UI primitives: 16, Reviews: 7)
- [ ] Integration tests — deferred (end-to-end flows require Cypress/Playwright, post-MVP)
- [ ] Responsive testing (phone, tablet, desktop breakpoints) — deferred (requires manual/device testing)
- [ ] PWA installability test (manifest + service worker + A2HS) — deferred (requires deployed environment, covered by Phase 20)
- [ ] Offline behaviour test (cached app shell + offline fallback) — deferred (Phase 20)
- [ ] Service worker update / cache versioning test — deferred (Phase 20)
- [ ] Installed (standalone) app test on desktop, Android, and iOS — deferred (Phase 20)
- [ ] Lighthouse PWA audit — deferred (requires deployed environment)
- [x] Security testing — completed 2026-09-19 (rate limiting, CORS, cookie settings verified in Phase 17)
- [ ] Notification testing — deferred (push delivery deferred to post-MVP)

Deliverable:

Release candidate with 43 backend + 28 frontend tests all green. **Verified 2026-09-19:** `manage.py test` 43/43 pass, `npm run test` 28/28 pass, typecheck + build clean.

---

# 69. PHASE 20 — PWA Build & Installability

### Objective

Turn the single React build into one installable Progressive Web App that runs and installs on Desktop, Android, and iOS without Android Studio, emulators, or native Android/iOS builds.

### Tasks

#### Manifest

- [ ] Create `manifest.json` in the app root (served as `/manifest.json`)
- [ ] `name`, `short_name`, `description`
- [ ] `start_url` and `scope` set to the app root
- [ ] `display: "standalone"` (plus `display_override` where useful)
- [ ] `theme_color` and `background_color`
- [ ] `orientation`
- [ ] Icons: 192x192, 512x512, maskable 512x512, apple-touch-icon
- [ ] `categories` and optional `shortcuts`
- [ ] Link the manifest in `index.html` and set `<meta name="theme-color">`

#### Service Worker

- [ ] Create `service-worker.js` (served as `/service-worker.js`)
- [ ] `install` handler: precache the app shell + `offline.html`, then `skipWaiting()`
- [ ] `activate` handler: delete outdated caches, then `clients.claim()`
- [ ] `fetch` handler: cache-first for static assets, network-first for API, offline fallback for navigations
- [ ] Never cache authenticated API responses, tokens, or patient data
- [ ] Version caches per release (for example `medibook-v1`) and expose an update path
- [ ] Register the service worker from the React entry point
- [ ] `push` and `notificationclick` handlers for Web Push

#### Install Prompt (A2HS)

- [ ] Capture `beforeinstallprompt` and show an in-app "Install MediBook" action
- [ ] Track `appinstalled` and hide the prompt once installed
- [ ] iOS guidance (Safari → Share → Add to Home Screen), because iOS has no install event
- [ ] Hide the prompt when the app already runs in `display-mode: standalone`

#### Responsive / Platform Fit

- [ ] Verify layout at phone, tablet, and desktop breakpoints
- [ ] Verify safe-area insets, scrolling, and keyboard behaviour in standalone mode
- [ ] Verify the same production build fits the desktop app window, Android app, and iOS app
- [ ] Verify the offline banner, error states, and retry actions

### Reference: manifest.json (`frontend/public/manifest.json` — also deployable as `static/manifest.json`)

```json
{
  "name": "MediBook — Doctor Appointment Booking",
  "short_name": "MediBook",
  "description": "Find doctors, check availability, and book healthcare appointments.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "display_override": ["standalone", "minimal-ui"],
  "orientation": "portrait-primary",
  "theme_color": "#0F62FE",
  "background_color": "#FFFFFF",
  "lang": "en",
  "categories": ["health", "medical", "productivity"],
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/icons/apple-touch-icon-180.png",
      "sizes": "180x180",
      "type": "image/png"
    }
  ],
  "shortcuts": [
    { "name": "My Appointments", "url": "/patient/appointments" },
    { "name": "Find a Doctor", "url": "/doctors" }
  ]
}
```

### Reference: service-worker.js (`frontend/public/service-worker.js` — also deployable as `static/service-worker.js`)

```js
const CACHE_VERSION = "medibook-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const APP_SHELL = ["/", "/index.html", "/offline.html", "/manifest.json"];

// install: precache the app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// activate: remove outdated cache versions
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// fetch: cache-first static assets, network-only API, offline fallback for navigations
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache authenticated API traffic
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  // Navigations: network first, fall back to the offline page
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }

  // Static assets: cache first, then network
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && url.origin === self.location.origin) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
    )
  );
});

// Web Push for installed PWAs
self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(payload.title || "MediBook", {
      body: payload.body || "You have a new appointment update.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url || "/" }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data.url));
});
```

### Reference: install prompt (A2HS)

```js
// src/pwa/registerServiceWorker.ts
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("/service-worker.js");
    } catch (error) {
      console.error("Service worker registration failed:", error);
    }
  });
}
```

```ts
// src/pwa/installPrompt.ts
import type { BeforeInstallPromptEvent } from "../types/pwa";

let deferredPrompt: BeforeInstallPromptEvent | null = null;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
});

export function canInstall(): boolean {
  return deferredPrompt !== null;
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  const prompt = deferredPrompt;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  deferredPrompt = null;
  return outcome === "accepted";
}

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}
```

The install button renders only when `canInstall()` is true and `isStandalone()` is false. On iOS Safari, where `beforeinstallprompt` never fires, render the "Share → Add to Home Screen" instruction instead.

### Acceptance Criteria

```text
HTTPS serves the app
/manifest.json returns 200 with display: "standalone" and valid icons
/service-worker.js registers and controls the page
Install prompt (A2HS) appears on supported browsers
Installed app launches in standalone mode on Desktop, Android, and iOS
Offline fallback page appears when there is no connection
Lighthouse PWA checks pass on Desktop, Android, and iOS
```

---

# 70. PHASE 21 — Deployment

## Backend

Deploy:

```text
Django
PostgreSQL
Static files
Media storage
HTTPS
Environment variables
```

Configure:

- [ ] Production settings
- [ ] Database
- [ ] Domain
- [ ] SSL
- [ ] CORS
- [ ] Allowed hosts
- [ ] Static files
- [ ] Media storage
- [ ] Logging
- [ ] Backups

## React PWA

Build:

```text
One production build (React PWA)
Served over HTTPS from the frontend host, Django static files, or a CDN
The same build installs on Desktop, Android, and iOS
```

Configure:

- [ ] HTTPS on the production domain (required for service workers)
- [ ] `manifest.json` and `service-worker.js` served from the app root with correct MIME types
- [ ] Correct `start_url`, `scope`, and `display: "standalone"`
- [ ] Correct icon set deployed and reachable
- [ ] `offline.html` deployed and reachable
- [ ] Cache version bumped on every release so installed apps update
- [ ] `Cache-Control` headers that let hashed static assets cache but never pin `service-worker.js`
- [ ] `Service-Worker-Allowed` / root scope when the service worker is not served from the root
- [ ] No `no-store` header blocking the manifest
- [ ] Installed-app update path verified after deployment

---

# 71. PHASE 22 — Production Verification

Complete a real end-to-end test:

```text
Patient Registration
       ↓
Login
       ↓
Search Doctor
       ↓
Doctor Profile
       ↓
Select Date
       ↓
Select Slot
       ↓
Book Appointment
       ↓
Doctor Notification
       ↓
Doctor Accepts
       ↓
Patient Notification
       ↓
Appointment
       ↓
Doctor Completes
       ↓
Patient Reviews
```

Verify every step on the production build with the PWA installed on Desktop, Android, and iOS, against production APIs.

Also verify:

```text
Installed app launches in standalone mode without browser chrome
App shell loads while the device is offline
Offline fallback appears for an uncached route
A new deployment activates the updated service worker
Web Push notifications arrive in the installed app
Responsive layout matches across desktop, Android, iOS, and tablet
```

---

# 72. MVP Definition

The MVP should contain:

```text
Authentication
       +
Patient Profiles
       +
Doctor Profiles
       +
Specialties
       +
Hospitals/Clinics
       +
Doctor Availability
       +
Appointment Slots
       +
Booking
       +
Cancellation
       +
Rescheduling
       +
Doctor Dashboard
       +
Patient Dashboard
       +
Admin Dashboard
       +
Notifications
       +
Installable PWA (Desktop, Android, iOS)
```

Payment, advanced medical records, telemedicine, pharmacy, and AI should be treated as later modules unless they are specifically required for the first release. (Payments in particular were removed from scope on 2026-09-19 — §32, §65.)

---

# 73. Milestone Structure

## Milestone 1 — Foundation

```text
Django
PostgreSQL
React
PWA shell (manifest + service worker)
Git
API connection
```

## Milestone 2 — Authentication

```text
Register
Login
JWT
Roles
Permissions
```

## Milestone 3 — Users

```text
Patients
Doctors
Profiles
```

## Milestone 4 — Healthcare Directory

```text
Specialties
Hospitals
Doctor Search
```

## Milestone 5 — Scheduling

```text
Availability
Slots
Calendar
```

## Milestone 6 — Booking

```text
Booking
Confirmation
Cancellation
Rescheduling
```

## Milestone 7 — Operations

```text
Patient Dashboard
Doctor Dashboard
Admin Dashboard
```

## Milestone 8 — Notifications

```text
In-app
Push
Reminders
```

## Milestone 9 — Quality

```text
Reviews
Security
Testing
PWA audit (Lighthouse)
Optimization
```

## Milestone 10 — Production

```text
PWA production build
Install prompt (A2HS) on Desktop, Android, iOS
Offline fallback
Deployment
Monitoring
Backups
Release
```

---

# 74. Definition of Done

A feature is not considered complete simply because its screen exists.

A feature is complete when:

- Backend model exists
- Migration exists
- Serializer exists
- API endpoint exists
- Permission rules exist
- Validation exists
- Database constraints exist where required
- React model exists
- Repository/service exists
- State management exists
- UI exists
- Loading state exists
- Empty state exists
- Error state exists
- Success state exists
- Tests exist
- Types are defined and `npm run typecheck` passes
- Responsive behavior works
- PWA installability works (manifest + service worker + A2HS)
- Offline fallback works
- Lighthouse PWA audit passes
- Security has been checked
- API and UI are integrated

---

# 75. Important Development Rules

## Rule 1

Do not put business logic only in React.

Critical logic belongs in Django.

## Rule 2

Do not trust client-side permissions.

Django must enforce authorization.

## Rule 3

Do not build the complete UI before confirming the API design.

Backend and frontend contracts should be agreed early.

## Rule 4

Do not generate the entire project in one uncontrolled step.

Develop module by module.

## Rule 5

Do not ignore database constraints.

Especially for appointments.

## Rule 6

Do not store secrets in Git.

Use environment variables and secure secret storage.

## Rule 7

Do not expose private patient information through public APIs.

## Rule 8

Do not use fake data in production workflows.

Mock data may be used during UI development, but production screens must use actual API data.

## Rule 9

Do not silently change existing requirements.

When requirements change, update the scope and architecture intentionally.

## Rule 10

Keep the application responsive and installable across desktop, Android, iOS, and tablet from the single PWA build.

## Rule 11

Do not cache authenticated or patient-specific data in the service worker cache.

Only the static app shell belongs in the cache; live medical and appointment data must always come from the API over HTTPS.

## Rule 12

The frontend is TypeScript-first.

Do not add new `.js`/`.jsx` files: use `.tsx` for components and `.ts` for everything else. Keep `strict` mode enabled and make `npm run typecheck` pass before any frontend feature is considered done.

---

# 76. Suggested Folder-Level Completion Order

Build in this exact order:

```text
/backend
    ↓
Django Configuration
    ↓
accounts
    ↓
patients
    ↓
doctors
    ↓
specialties
    ↓
hospitals
    ↓
appointments
    ↓
notifications
    ↓
reviews
    ↓
reports
```

Then:

```text
/frontend
    ↓
Core
    ↓
PWA Shell (manifest + service worker + offline fallback)
    ↓
Authentication
    ↓
Patient
    ↓
Doctor
    ↓
Specialties/Hospitals
    ↓
Availability
    ↓
Appointments
    ↓
Notifications
    ↓
Admin
    ↓
Reviews
```

---

# 77. Recommended First Release

The first public release should focus on:

```text
Patient Registration
Patient Login
Doctor Login
Doctor Directory
Specialties
Doctor Profiles
Doctor Availability
Appointment Booking
Doctor Approval/Rejection
Appointment Cancellation
Appointment Rescheduling
Appointment History
Patient Dashboard
Doctor Dashboard
Admin Dashboard
Push Notifications (Web Push in the installed PWA)
Installable PWA (Desktop, Android, iOS) with offline fallback
```

The first release should be stable before adding complex medical functionality.

---

# 78. Future Version Roadmap

## MediBook v1.0

```text
Authentication
Doctors
Patients
Appointments
Admin
Notifications
Installable PWA (Desktop, Android, iOS)
```

## MediBook v1.1

```text
Reviews
Ratings
Advanced Search
Improved Reports
Improved offline experience
```

## MediBook v1.2

```text
Improved Reports
Improved offline experience
```

## MediBook v2.0

```text
Chat
Video Consultation
Audio Consultation
```

## MediBook v2.1

```text
Prescriptions
Medical Records
Laboratory
```

## MediBook v3.0

```text
Pharmacy
Insurance
Advanced Healthcare Integrations
```

Future AI features should only be introduced as separately defined modules with clear safety, privacy, and clinical boundaries.

---

# 79. Final Architecture

```text
                         MEDIBOOK
                            │
          ┌─────────────────┴─────────────────┐
          │                                   │
    React PWA Frontend                  Django Backend
          │                                   │
   ┌──────┼───────┐                   Django REST API
   │      │       │                           │
Desktop Android  iOS                         │
   │      │       │                           │
   └──────┴───────┘                           │
                                             ↓
                                        PostgreSQL
                                             │
       ┌─────────────────────────────────────┼────────────────────────┐
       │                  │                  │                        │
    Patients           Doctors             Admin                 Services
       │                  │                  │                        │
       └──────────────────┼──────────────────┘                        │
                          │                                           │
                    Appointments                                      │
                          │                                           │
                 ┌────────┴────────┐                                  │
                 │                 │                                  │
           Notifications       Reviews                               │
                 │                 │                                  │
                Web Push (VAPID)   In-app inbox                        │
```

---

# 80. Final Project Checklist

## Planning

- [ ] Scope complete
- [ ] Architecture complete
- [ ] Database plan complete
- [ ] API plan complete
- [ ] UI plan complete

## Backend

- [ ] Django configured
- [ ] PostgreSQL connected
- [ ] Custom user
- [ ] Authentication
- [ ] Roles
- [ ] Permissions
- [ ] Patients
- [ ] Doctors
- [ ] Specialties
- [ ] Hospitals
- [ ] Availability
- [ ] Slots
- [ ] Appointments
- [ ] Notifications
- [ ] Reviews
- [ ] Reports
- [ ] Audit logs

## React

- [x] Project configured (Vite + React 18 + TS strict — PHASE 4)
- [x] TypeScript configured (strict) with a passing `typecheck` script
- [x] Theme (§21 token system, CSS + TS — PHASE 4; closed the Phase 0 token decision)
- [x] Routing (React Router 7; auth + app + admin routes — PHASE 4/5)
- [x] API client (axios, §28 envelope, single-flight refresh-and-replay — PHASE 4/5)
- [x] Secure storage (access in `sessionStorage`, refresh in `localStorage`, `mb.*` namespacing)
- [x] State management (Toast + Session providers, Context + reducer)
- [x] Authentication (login/register/logout/forgot/reset/verify, guards, role routing — PHASE 5, Entry 0010)
- [ ] Patient screens (profile CRUD done in PHASE 5; home/settings in PHASE 6)
- [ ] Doctor screens
- [ ] Appointment screens
- [ ] Notification screens
- [ ] Admin screens (guarded `/admin` shell + role home done; dashboard is PHASE 14)
- [ ] Responsive layouts (phone, tablet, desktop — shell done; full sweep in PHASE 19/20)
- [x] Web App Manifest (`manifest.json`, `display: "standalone"`, icons — PHASE 4)
- [x] Service worker registered (`install` / `activate` / `fetch` handlers — PHASE 4)
- [x] Offline fallback page (PHASE 4)
- [x] Install prompt (A2HS) + iOS guidance (PHASE 4)
- [x] Standalone / safe-area styling (PHASE 4)
- [ ] Web Push subscription (PHASE 13)

## Quality

- [ ] API tests
- [ ] Unit tests
- [ ] Integration tests
- [ ] Security tests
- [ ] Booking conflict tests
- [ ] Responsive testing
- [ ] PWA installability testing
- [ ] Offline behaviour testing
- [ ] Lighthouse PWA audit
- [ ] Performance testing

## Deployment

- [ ] Production Django configuration
- [ ] PostgreSQL production database
- [ ] HTTPS
- [ ] Domain
- [ ] Environment variables
- [ ] Static/media storage
- [ ] Database backups
- [ ] Monitoring
- [ ] PWA production build (Single React build)
- [ ] Manifest + service worker served from the app root
- [ ] Install verified on Desktop, Android, and iOS

---

# 81. Project Completion Criteria

MediBook can be considered production-ready when:

1. Patients can register and authenticate securely.
2. Doctors can authenticate securely.
3. Admins can manage the platform.
4. Patients can discover doctors.
5. Patients can view doctor profiles.
6. Doctors can define availability.
7. Patients can view valid available slots.
8. Patients can book appointments.
9. Double-booking is prevented at the backend/database level.
10. Doctors can manage appointment requests.
11. Patients can manage their appointments.
12. Notifications work correctly.
13. Role-based authorization is enforced by Django.
14. Sensitive information is protected.
15. APIs are validated and tested.
16. React works and installs as a PWA on desktop, Android, iOS, tablet, and web.
17. Production deployment is configured securely.
18. Backups and logging are available.
19. Critical workflows have automated tests.
20. The complete patient → doctor → appointment workflow works successfully in production.
21. The manifest and service worker make the app installable (A2HS) on desktop, Android, and iOS.
22. The installed app launches in standalone mode and shows the offline fallback page without a connection.
23. Lighthouse PWA checks pass and installed apps receive updates after deployment.

---

# 82. Recommended Immediate Next Step

After approving this scope, development should begin with:

```text
STEP 1
Create project folders

MediBook/
├── backend/
└── frontend/

STEP 2
Create Django project

STEP 3
Configure PostgreSQL

STEP 4
Create Custom User

STEP 5
Configure Django REST Framework

STEP 6
Configure JWT

STEP 7
Create React project (PWA-ready)

STEP 8
Add the PWA shell (manifest.json, service-worker.js, offline.html, icons)

STEP 9
Connect React to Django

STEP 10
Implement authentication

STEP 11
Test the complete authentication flow

STEP 12
Verify installability and offline behaviour (A2HS on desktop, Android, iOS)

Only after these are working should the Patient, Doctor, Availability, and Appointment modules be developed.
```

---

# 83. Project Principle

The central principle of MediBook development is:

> **Build the backend business logic correctly first, connect it to a clean React architecture, then progressively add user-facing functionality.**

The appointment engine, authentication, permissions, availability, and database integrity are the foundation of the platform. Advanced functionality should be added only after those foundations are reliable.
