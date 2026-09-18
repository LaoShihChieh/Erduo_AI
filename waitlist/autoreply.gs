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
 * The reply, dressed like the landing page: sky gradient behind a white card,
 * serif wordmark, ocean-blue accents.
 *
 * Written to email constraints rather than web ones. Styles are inline because
 * most clients drop <style> blocks. Layout is tables because Outlook renders
 * with Word. The gradient carries a solid bgcolor beneath it, since Outlook
 * ignores linear-gradient. Instrument Serif cannot load in Gmail, so Georgia
 * is named first rather than as a fallback nobody reaches. It is a fragment,
 * not a whole document, because a reply is embedded above the quoted thread.
 */
function htmlReply_(name) {
  var safe = escapeHtml_(name);

  var logo = CONFIG.LOGO_URL
    ? '<img src="' + escapeHtml_(CONFIG.LOGO_URL) + '" width="120" height="120" ' +
      'alt="Erduo" style="display:block;margin:0 auto 16px;width:120px;' +
      'height:120px;border:0;outline:none;text-decoration:none;">'
    : '';

  return [
    // Preheader: the text a mail client shows beside the subject in the inbox
    // list. Without it the client reaches for the first text in the body and
    // leads with the masthead, so the preview reads "erduo ears" instead of a
    // sentence. Hidden in the opened message, and padded so nothing after it
    // bleeds into the preview.
    '<div style="display:none;max-height:0;max-width:0;overflow:hidden;',
    'opacity:0;font-size:1px;line-height:1px;color:#e7f2fb;">',
    'You are on the list. Thank you for being early.',
    new Array(60).join('&#8204;&nbsp;'),
    '</div>',

    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ',
    'bgcolor="#e7f2fb" style="background-color:#e7f2fb;background-image:',
    'linear-gradient(180deg,#f6fbfe 0%,#e4f1fa 45%,#cfe6f5 100%);margin:0;">',
    '<tr><td align="center" style="padding:34px 16px 38px;">',

    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ',
    'style="max-width:520px;width:100%;">',

    '<tr><td align="center" style="padding:0 0 24px;">',
    logo,
    '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:30px;',
    'line-height:1.15;color:#0d2a3d;">erduo</div>',
    '<div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;',
    'letter-spacing:3px;color:#6b8ca0;padding-top:7px;">&#32819;&#26421;',
    '&nbsp;&nbsp;&#183;&nbsp;&nbsp;EARS</div>',
    '</td></tr>',

    '<tr><td bgcolor="#ffffff" style="background-color:#ffffff;border-radius:16px;',
    'padding:30px 28px;font-family:Helvetica,Arial,sans-serif;font-size:15px;',
    'line-height:1.65;color:#0d2a3d;">',

    '<p style="margin:0 0 18px;font-family:Georgia,\'Times New Roman\',serif;',
    'font-size:21px;line-height:1.3;color:#0d2a3d;">Hi ' + safe + ',</p>',

    '<p style="margin:0 0 16px;">You are on the list. Thank you for being early.</p>',

    '<p style="margin:0 0 16px;color:#3f6579;">Erduo is a listening ear. It stays ',
    'quiet in the background, notices the conversations worth keeping, and pairs ',
    'them with the photos you took at the time. Then it drafts the follow-up and ',
    'proposes the invite, so you can stay in the room.</p>',

    '<p style="margin:0;color:#3f6579;">If you ever want off the list, reply to ',
    'this message and say so.</p>',

    '</td></tr>',

    '<tr><td align="center" style="padding:24px 0 0;font-family:Helvetica,Arial,',
    'sans-serif;font-size:13px;line-height:1.7;color:#6b8ca0;">',
    'Quietly yours,<br>Erduo<br>',
    '<a href="https://erduo.ai" style="color:#1b5ea8;text-decoration:none;">',
    'erduo.ai</a>',
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
