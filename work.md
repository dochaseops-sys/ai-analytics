When users click on run tracking audit or run audit, open a modal that collects the following information from the users:
- lead type
this could be registrations, sign ups, contacts, submit applications, book appointmentm, schedule a call, newsletter subscription, download ebook/pdf, lead or two or more of the aforementioned lead types.
if the user picks multiple lead types, then the user will have to provide event names for each of the selected lead types.
- lead event name
- purchase event name
- page view event name

Remove Form Submit Event Tracking from the audit.

## Purchase Event Tracking
Before marking Purchase Event Tracking as passed
- make sure the default purchase event in GA4 is receiving data from the website
- make sure there is a purchase event setup in the GTM container with the purchase event name provided by the user
- make sure the purchase event name is also present in GA4
- otherwise, mark Purchase Event Tracking as Failed

## Lead Event Tracking
Before marking Lead Event Tracking as passed
- make sure the lead event name supplied by the user is present in GA4 and is receiving data from the website
- make sure the lead event name is also present in the GTM container
- otherwise, mark Lead Event Tracking as Failed

## Page View Event Tracking
Before marking Page View Event Tracking as passed
- make sure the default page view event in GA4 is receiving data from the website
- if there is a page view event name provided by the user, make sure there is a page view event setup in the GTM container with the page view event name provided by the user and is also receiving data from the website
- otherwise, mark Page View Event Tracking as Failed

## Duplicate Purchase Transaction IDs
- if purchase event tracking is marked as failed, also mark this as failed