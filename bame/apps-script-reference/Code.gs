const ADMIN_EMAIL = 'bame.marketingagency@gmail.com';
const BAME_NAME = 'BAME Marketing Agency';

function doPost(e) {
  try {
    const data = e && e.parameter ? e.parameter : {};
    const athlete = data.athlete_full_name || 'Unknown Athlete';
    const sport = data.primary_sport || 'Unknown Sport';
    const ref = data.case_reference || 'UNASSIGNED';
    const submittedAt = new Date();

    const doc = DocumentApp.create(`BAME Diagnostic | ${athlete} | ${sport} | ${ref}`);
    const body = doc.getBody();
    body.appendParagraph(BAME_NAME).setHeading(DocumentApp.ParagraphHeading.TITLE);
    body.appendParagraph('CLIENT DIAGNOSTIC INTAKE').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(`Case reference: ${ref}`);
    body.appendParagraph(`Submitted: ${submittedAt.toISOString()}`);
    body.appendHorizontalRule();

    Object.keys(data).forEach(key => {
      if (key === 'submitted_at') return;
      const value = data[key];
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      body.appendParagraph(`${label}:`).setBold(true);
      body.appendParagraph(value || '');
    });
    body.appendParagraph('');
    body.appendParagraph('Administrative note').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph('This diagnostic is an intake record. It does not constitute final approval of any representation, sponsorship, legal, financial or commercial arrangement.');
    doc.saveAndClose();

    const pdf = DriveApp.getFileById(doc.getId()).getAs(MimeType.PDF);
    pdf.setName(`BAME_Diagnostic_${safe_(athlete)}_${safe_(sport)}_${safe_(ref)}.pdf`);

    const subject = `BAME DIAGNOSTIC | ${athlete} | ${sport} | ${ref}`;
    const plain = `New BAME client diagnostic received.\n\nAthlete: ${athlete}\nSport: ${sport}\nCase reference: ${ref}\nSubmitted: ${submittedAt.toISOString()}\n\nThe completed diagnostic is attached as a PDF.`;
    GmailApp.sendEmail(ADMIN_EMAIL, subject, plain, {
      attachments: [pdf],
      name: BAME_NAME
    });

    // Move the working Google Doc to trash; the PDF remains attached to the email.
    DriveApp.getFileById(doc.getId()).setTrashed(true);

    return ContentService
      .createTextOutput(JSON.stringify({ok:true, reference:ref}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ok:false,error:String(err)}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function safe_(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 80);
}
