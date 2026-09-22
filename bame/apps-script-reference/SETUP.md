# BAME Diagnostic — PDF Email Delivery Setup

The administrator destination is fixed as:

`bame.marketingagency@gmail.com`

## Recommended production flow

Client → BAME digital diagnostic → Google Apps Script → generated PDF → Gmail → BAME administrator

The supplied `Code.gs` generates a PDF from every submission and emails it to the administrator.

## One-time setup

1. Open Google Apps Script while signed into the Google account that should send BAME administration emails.
2. Create a new project.
3. Paste the contents of `Code.gs` into the project.
4. Save the project.
5. Deploy → New deployment → Web app.
6. Execute as: **Me**.
7. Who has access: **Anyone**.
8. Authorize the requested Google permissions.
9. Copy the Web App URL.
10. Replace `PASTE_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE` in `bame-diagnostic.html` with that URL.
11. Host the HTML file on the BAME domain/website or another stable HTTPS host.
12. Submit a test diagnostic and confirm the PDF arrives at `bame.marketingagency@gmail.com`.

## Important

Do not place Gmail passwords, Google API keys, or other private credentials in the HTML file.

The web app deployment is the server-side component that has permission to create the PDF and send the email.
