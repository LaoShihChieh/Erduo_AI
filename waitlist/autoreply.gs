/**
 * Erduo waitlist auto-reply.
 *
 * Replies once to every waitlist signup, files it under a label, and
 * optionally records it in a spreadsheet so the list lives somewhere other
 * than an inbox. Because it applies the label itself, no Gmail filter is
 * needed alongside it.
 *
 * Setup:
 *   1. script.google.com > New project. Paste this file in.
 *   2. Edit CONFIG below. Leave SHEET_ID as '' to only send replies.
 *   3. Run installTrigger once and grant the permissions it asks for.
 *
 * Signups are matched on subject, which the landing page sets to a fixed
 * string, so no parsing guesswork is involved. Every answered thread gets
 * DONE_LABEL, which is what guarantees nobody is ever replied to twice: the
 * search that finds work explicitly excludes that label.
 */

var CONFIG = {
  // The landing page sends exactly this subject. Must match it.
  SUBJECT: 'Erduo waitlist',

  // Applied once a thread is answered. Keep it free of spaces and slashes,
  // which Gmail's search syntax treats specially.
  DONE_LABEL: 'erduo-waitlist-replied',

  // Applied to every signup, answered or not, so the list stays browsable in
  // Gmail without needing a separate filter. '' disables it.
  SIGNUP_LABEL: 'Waitlist',

  // Send replies as this address instead of the account's own. It must be a
  // configured send-as alias in Gmail, otherwise the account address is used.
  // '' always uses the account address.
  REPLY_FROM: 'hi@erduo.ai',

  // Logo shown at the top of the reply. Needs a publicly reachable URL, so it
  // renders once erduo.ai is live. '' drops the image and leaves the typeset
  // wordmark, which the email is designed to stand on anyway: most clients
  // block remote images until the reader allows them.
  LOGO_URL: 'https://erduo.ai/assets/erduo-email.png',

  // Optional. Paste a spreadsheet ID to also log signups. '' disables it.
  SHEET_ID: '',
  SHEET_NAME: 'Waitlist',

  // Tab the web app writes to when someone starts a signup on the page.
  STARTS_SHEET: 'Starts',

  // Ceiling per run, so a backlog or a loop cannot burn the daily send quota
  // in one go.
  MAX_PER_RUN: 40,
};

/** Entry point. The time-based trigger calls this. */
function processWaitlist() {
  var done = getOrCreateLabel_(CONFIG.DONE_LABEL);
  var signup = CONFIG.SIGNUP_LABEL ? getOrCreateLabel_(CONFIG.SIGNUP_LABEL) : null;

  var query = [
    'subject:"' + CONFIG.SUBJECT + '"',
    '-label:' + CONFIG.DONE_LABEL,
    '-from:me',
  ].join(' ');

  var threads = GmailApp.search(query, 0, CONFIG.MAX_PER_RUN);

  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];
    try {
      handleThread_(thread, done, signup);
    } catch (err) {
      // Keep going: one malformed signup should not stall the rest.
      console.error('Waitlist thread failed: ' + err);
    }
  }
}

function handleThread_(thread, done, signup) {
  // Every signup gets filed, whether or not it earns a reply, so the label is
  // a complete record rather than a record of replies.
  if (signup) signup.addToThread(thread);

  // Someone already answered this by hand. Leave it alone, but mark it so it
  // stops showing up as work.
  if (thread.getMessageCount() > 1) {
    done.addToThread(thread);
    return;
  }

  var message = thread.getMessages()[0];
  var address = extractAddress_(message.getFrom());

  if (!address || isUnreplyable_(address)) {
    done.addToThread(thread);
    return;
  }

  var name = extractName_(message.getPlainBody()) ||
             extractDisplayName_(message.getFrom()) ||
             'there';

  var options = { htmlBody: htmlReply_(name) };
  var alias = replyAlias_();
  if (alias) options.from = alias;

  message.reply(plainReply_(name), options);

  // Immediately after a successful send, so a later failure cannot cause a
  // second reply to the same person.
  done.addToThread(thread);

  logToSheet_(name, address, message.getDate());
}

/* ---------------------------------------------------------------- parsing */

/**
 * Pulls the name out of "Hi Erduo, this is NAME. I'd love to be on the
 * waitlist!". Matching only on "this is NAME." keeps earlier signups working,
 * since the greeting was added to the page later. Deliberately lenient about
 * the wording, strict about the length, since this text arrives from outside
 * and goes into an email we send.
 */
function extractName_(body) {
  if (!body) return '';
  var match = body.match(/this is\s+([^.\r\n]{1,80})\./i);
  if (!match) return '';
  return match[1].replace(/\s+/g, ' ').trim();
}

function extractAddress_(from) {
  if (!from) return '';
  var angled = from.match(/<([^>]+)>/);
  var address = angled ? angled[1] : from;
  address = address.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address) ? address : '';
}

function extractDisplayName_(from) {
  if (!from) return '';
  var name = from.split('<')[0].replace(/["']/g, '').trim();
  // A From header with no display name just repeats the address.
  return name.indexOf('@') === -1 ? name : '';
}

/** Never auto-reply into an unattended mailbox: that is how loops start. */
function isUnreplyable_(address) {
  return /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounce)/i.test(address);
}

/* ----------------------------------------------------------------- replies */

function plainReply_(name) {
  return [
    'Hi ' + name + ',',
    '',
    'You are on the list. Thank you for being early.',
    '',
    'Erduo is a listening ear. It stays quiet in the background, notices the',
    'conversations worth keeping, and pairs them with the photos you took at',
    'the time. Then it drafts the follow-up and proposes the invite, so you',
    'can stay in the room.',
    '',
    'If you ever want off the list, reply to this message and say so.',
    '',
    'Quietly yours,',
    'Erduo',
    'erduo.ai',
  ].join('\n');
}

/**
 * The reply, dressed like the landing page: sky gradient framing a white card,
 * the logo as the mark, ocean-blue accents.
 *
 * There is no typeset wordmark. Gmail's sanitiser strips @font-face, so the
 * brand script cannot be live text here, and an image of it would not invert
 * with the card. The logo already carries the mark, so the wordmark simply
 * goes.
 *
 * Written to email constraints rather than web ones. Styles are inline because
 * most clients drop <style> blocks. Layout is tables because Outlook renders
 * with Word. Instrument Serif cannot load in Gmail, so Georgia is named first
 * rather than as a fallback nobody reaches. It is a fragment, not a whole
 * document, because a reply is embedded above the quoted thread.
 *
 * Every piece of text sits inside the card, never on the gradient. Gmail's dark
 * mode inverts solid background colours and text colours together, but it
 * cannot invert a background-image, so a gradient stays light while the text
 * above it flips light and disappears. The card has a solid bgcolor, so it and
 * its text invert as a unit and keep their contrast. The gradient survives as a
 * frame around it, carrying only the logo, which is an image and so is never
 * recoloured.
 */
function htmlReply_(name) {
  var safe = escapeHtml_(name);

  var logo = CONFIG.LOGO_URL
    ? '<img src="' + escapeHtml_(CONFIG.LOGO_URL) + '" width="112" height="112" ' +
      'alt="Erduo" style="display:block;margin:0 auto 13px;width:112px;' +
      'height:112px;border:0;outline:none;text-decoration:none;">'
    : '';

  var rule = '<div style="height:1px;line-height:1px;font-size:0;' +
             'background-color:#e4eef7;margin:24px 0;">&nbsp;</div>';

  return [
    '<div style="display:none;max-height:0;max-width:0;overflow:hidden;',
    'opacity:0;font-size:1px;line-height:1px;color:#e7f2fb;">',
    'You are on the list. Thank you for being early.',
    new Array(60).join('&#8204;&nbsp;'),
    '</div>',

    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ',
    'bgcolor="#e7f2fb" style="background-color:#e7f2fb;background-image:',
    'linear-gradient(180deg,#f6fbfe 0%,#e4f1fa 45%,#cfe6f5 100%);margin:0;">',
    '<tr><td align="center" style="padding:30px 16px 34px;">',

    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ',
    'style="max-width:520px;width:100%;">',

    '<tr><td bgcolor="#ffffff" style="background-color:#ffffff;border-radius:16px;',
    'padding:30px 28px;font-family:Helvetica,Arial,sans-serif;font-size:15px;',
    'line-height:1.65;color:#0d2a3d;">',

    '<div style="text-align:center;">',
    logo,
    '<div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;',
    'letter-spacing:3px;color:#6b8ca0;">&#32819;&#26421;',
    '&nbsp;&nbsp;&#183;&nbsp;&nbsp;EARS</div>',
    '</div>',

    rule,

    '<p style="margin:0 0 18px;font-family:Georgia,\'Times New Roman\',serif;',
    'font-size:21px;line-height:1.3;color:#0d2a3d;">Hi ' + safe + ',</p>',

    '<p style="margin:0 0 16px;">You are on the list. Thank you for being early.</p>',

    '<p style="margin:0 0 16px;color:#3f6579;">Erduo is a listening ear. It stays ',
    'quiet in the background, notices the conversations worth keeping, and pairs ',
    'them with the photos you took at the time. Then it drafts the follow-up and ',
    'proposes the invite, so you can stay in the room.</p>',

    '<p style="margin:0;color:#3f6579;">If you ever want off the list, reply to ',
    'this message and say so.</p>',

    rule,

    '<div style="text-align:center;font-size:13px;line-height:1.7;color:#6b8ca0;">',
    'Quietly yours,<br>Erduo<br>',
    '<a href="https://erduo.ai" style="color:#1b5ea8;text-decoration:none;">',
    'erduo.ai</a></div>',

    '</td></tr>',

    '</table>',
    '</td></tr></table>',
  ].join('');
}

function escapeHtml_(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ------------------------------------------------------------------- sheet */

function logToSheet_(name, address, date) {
  if (!CONFIG.SHEET_ID) return;

  var book = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = book.getSheetByName(CONFIG.SHEET_NAME) ||
              book.insertSheet(CONFIG.SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Signed up', 'Name', 'Email']);
    sheet.setFrozenRows(1);
  }

  sheet.appendRow([date, sheetSafe_(name), sheetSafe_(address)]);
}

/* ----------------------------------------------------------------- plumbing */

/**
 * Sheets treats a leading =, +, - or @ as the start of a formula, so a signup
 * called "=HYPERLINK(...)" would become a live link in the list. Prefixing an
 * apostrophe keeps the cell as text.
 */
function sheetSafe_(text) {
  var s = String(text);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

/**
 * Resolves CONFIG.REPLY_FROM against the account's configured send-as
 * aliases, returning '' when it is not one of them. Falling back to the
 * account address means a missing or renamed alias degrades the From header
 * rather than failing every reply. Cached for the run, since Apps Script
 * re-initialises globals on each execution.
 */
var aliasCache_ = null;

function replyAlias_() {
  if (aliasCache_ !== null) return aliasCache_;

  aliasCache_ = '';
  if (CONFIG.REPLY_FROM) {
    var wanted = CONFIG.REPLY_FROM.toLowerCase();
    var aliases = [];
    try {
      aliases = GmailApp.getAliases();
    } catch (err) {
      // A From header is a nicety; never let looking one up cost a reply.
      console.log('Could not read send-as aliases: ' + err);
    }
    for (var i = 0; i < aliases.length; i++) {
      if (String(aliases[i]).toLowerCase() === wanted) {
        aliasCache_ = aliases[i];
        break;
      }
    }
    if (!aliasCache_) {
      console.log('REPLY_FROM ' + CONFIG.REPLY_FROM +
                  ' is not a send-as alias; replying from the account address.');
    }
  }
  return aliasCache_;
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

/* ------------------------------------------------------------- web app */

/**
 * Endpoint for the landing page. The page beacons here when someone taps the
 * button, a moment before the mail client takes over, so the sheet records how
 * many signups were started and not only how many arrived. Without it a signup
 * that is begun and abandoned is invisible, and there is no way to tell a page
 * nobody visits from a flow that leaks.
 *
 * To deploy: Apps Script > Deploy > New deployment > Web app, with
 * "Execute as: Me" and "Who has access: Anyone". Copy the /exec URL into
 * COUNT_URL on the landing page. Re-deploy after editing, since a web app
 * serves the code as of its last deployment.
 *
 * It records a timestamp and nothing else: no name, no address, no identifier.
 * The point is a denominator, not a profile.
 *
 * The URL is public and sits in the page source, so this count is soft and
 * could be inflated by anyone who cared to. The number of replies sent stays
 * hard, because each one answers a real message from a real mailbox. Treat
 * starts as a rough denominator and sends as the truth.
 */
function doPost(e) {
  try {
    var body = e && e.postData ? String(e.postData.contents || '') : '';
    // Ignore anything that is not the one message the page sends. Stops
    // generic crawler posts from filling the tab with noise.
    if (body.slice(0, 5) === 'start') recordStart_();
  } catch (err) {
    console.error('Could not record a start: ' + err);
  }
  // Always a bare 200. The page cannot read the response and does not need to.
  return ContentService.createTextOutput('');
}

function recordStart_() {
  if (!CONFIG.SHEET_ID || !CONFIG.STARTS_SHEET) return;

  var book = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = book.getSheetByName(CONFIG.STARTS_SHEET) ||
              book.insertSheet(CONFIG.STARTS_SHEET);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Started']);
    sheet.setFrozenRows(1);
  }

  sheet.appendRow([new Date()]);
}

/** Run once by hand. Safe to re-run: it clears its own older triggers first. */
function installTrigger() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'processWaitlist') {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }
  ScriptApp.newTrigger('processWaitlist').timeBased().everyMinutes(5).create();
}

/**
 * Dry run. Reports what processWaitlist would do without sending anything.
 * Use this first to confirm the search is matching real signups.
 */
function previewWaitlist() {
  var query = 'subject:"' + CONFIG.SUBJECT + '" -label:' + CONFIG.DONE_LABEL + ' -from:me';
  var threads = GmailApp.search(query, 0, CONFIG.MAX_PER_RUN);

  console.log('Would reply to ' + threads.length + ' thread(s).');
  for (var i = 0; i < threads.length; i++) {
    var m = threads[i].getMessages()[0];
    console.log('  ' + extractAddress_(m.getFrom()) +
                '  name=' + (extractName_(m.getPlainBody()) || '(none parsed)') +
                '  messages=' + threads[i].getMessageCount());
  }
}
