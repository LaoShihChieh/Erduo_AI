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
    'the time. We will write when there is something real for you to try.',
    '',
    'If you ever want off the list, reply to this message and say so.',
    '',
    'Quietly yours,',
    'Erduo',
    'erduo.ai',
  ].join('\n');
}

function htmlReply_(name) {
  // The name came from an email body, so it is untrusted input. Escaping it
  // keeps a signup from injecting markup into mail we send.
  var safe = escapeHtml_(name);
  return [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',system-ui,sans-serif;',
    'font-size:15px;line-height:1.65;color:#0d2a3d;max-width:34em">',
    '<p>Hi ' + safe + ',</p>',
    '<p>You are on the list. Thank you for being early.</p>',
    '<p>Erduo is a listening ear. It stays quiet in the background, notices the ',
    'conversations worth keeping, and pairs them with the photos you took at the ',
    'time. We will write when there is something real for you to try.</p>',
    '<p>If you ever want off the list, reply to this message and say so.</p>',
    '<p style="color:#3f6579">Quietly yours,<br>Erduo<br>',
    '<a href="https://erduo.ai" style="color:#1b5ea8">erduo.ai</a></p>',
    '</div>',
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
