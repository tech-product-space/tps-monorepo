const { Op } = require('sequelize');
const { WebsiteVisit, LeadProfile, Lead } = require('../models');
const leadService = require('./lead.service');
const { describePage } = require('../utils/websitePage');

const PRODUCT_ID = 'Website Visitors';
const SOURCE = 'Website Visit';
// Shows up in the activity timeline as "Re-entered via Website Backfill …", so a
// history entry stamped today on a lead dated three weeks ago explains itself.
const BACKFILL_SOURCE = 'Website Backfill';

/**
 * Which person does this browser belong to? Three keys, cheapest and most exact
 * first.
 *
 * 1. The browser id, via a visit we have already resolved. Once we have worked
 *    out who a browser is, every later visit from it is a single indexed lookup
 *    with no matching or guessing involved.
 * 2. The phone number, digits only — the CRM's existing rule for every lead.
 * 3. The email, but only when there is no phone at all. Email is NOT unique on
 *    lead_profiles, so it can match several people; if it does, we refuse to
 *    guess rather than attach a stranger's browsing to somebody's record.
 *
 * Returns null when nobody matches. That is a normal outcome, not an error — the
 * visit is still stored, just attached to no one.
 */
const resolvePerson = async ({ visitor_id, phone, email }) => {
  // 1. Have we already identified this browser?
  const known = await WebsiteVisit.findOne({
    where: { visitor_id, profile_id: { [Op.ne]: null } },
    attributes: ['profile_id'],
    order: [['occurred_at', 'DESC']],
  });

  if (known?.profile_id) {
    const profile = await LeadProfile.findByPk(known.profile_id);
    if (profile) return profile;
    // Profile was deleted since. Fall through and try to match again.
  }

  // 2. Phone.
  const normalized = leadService.normalizePhone(phone);
  if (normalized) {
    const byPhone = await LeadProfile.findOne({ where: { phone: normalized } });
    if (byPhone) return byPhone;
    // No match. Do NOT fall through to email — we have a phone, so
    // createOrProcessReentry can create this person properly further down.
    return null;
  }

  // 3. Email, only when there was no phone to work with.
  if (email) {
    const byEmail = await LeadProfile.findAll({
      where: { email },
      limit: 2,
    });
    if (byEmail.length === 1) return byEmail[0];
  }

  return null;
};

/**
 * Takes one visit from TPS and files it.
 *
 * Order of operations is deliberate. The visit row is written FIRST, because its
 * unique `source_event_id` is what makes a re-delivery harmless — the live send
 * and the hourly catch-up will both carry the same visit, and whichever arrives
 * second must do nothing at all. Claiming the id up front means the duplicate is
 * stopped by the database before any lead is touched.
 *
 * If the lead step then fails, the visit row is removed again so the next
 * delivery can retry the whole thing cleanly. Leaving it behind would mark the
 * visit as "already handled" while its lead was never created.
 *
 * `backfill: true` marks a historical visit being imported after the fact rather
 * than one that just happened. It changes one thing: if the person already has a
 * Website Visitors lead, the visit is recorded into history and linked, but the
 * lead itself is left completely alone.
 *
 * That matters because replaying an old visit through the normal path would flip
 * the lead back to Re-entry, overwrite whatever status an agent had set since,
 * stamp it as updated *now* — hiding when the visit really happened — and add an
 * activity entry per replayed visit. Importing three weeks of history would undo
 * three weeks of work and leave every lead looking like it was visited today.
 *
 * @returns {{ status: 'created' | 'history_only' | 'duplicate' | 'unmatched' }}
 */
const ingest = async (payload) => {
  const {
    source_event_id,
    visitor_id,
    name,
    email,
    phone,
    country_code,
    page_url,
    occurred_at,
    backfill = false,
  } = payload;

  if (!source_event_id) throw new Error('source_event_id is required');
  if (!visitor_id) throw new Error('visitor_id is required');
  if (!page_url) throw new Error('page_url is required');

  const page = describePage(page_url);

  // TPS's clock, not ours — the catch-up can deliver hours late and the history
  // has to read in the order things actually happened.
  const occurredAt = occurred_at ? new Date(occurred_at) : new Date();
  const when = Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt;

  let visit;
  try {
    visit = await WebsiteVisit.create({
      source_event_id: String(source_event_id),
      visitor_id: String(visitor_id),
      name: name || null,
      email: email || null,
      phone: phone || null,
      page_url: page.path,
      page_label: page.label,
      section: page.section,
      entry_type: 'page_view',
      occurred_at: when,
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      // Already handled — the live send and the catch-up both carried it.
      return { status: 'duplicate' };
    }
    throw err;
  }

  try {
    const existingProfile = await resolvePerson({ visitor_id, phone, email });
    const normalizedPhone = leadService.normalizePhone(phone);

    // No phone means no lead is possible: a person in this CRM must have one.
    // We keep the visit against whoever the email identified, so it still shows
    // in their history — it simply never reaches the Website Visitors tab.
    if (!normalizedPhone) {
      if (existingProfile) {
        await visit.update({ profile_id: existingProfile.id });
        return { status: 'created' };
      }
      return { status: 'unmatched' };
    }

    // Historical import, and this person is already on the tab: record the visit
    // and stop. Touching the lead here would rewrite the present with the past.
    if (backfill && existingProfile) {
      const existingLead = await Lead.findOne({
        where: {
          profile_id: existingProfile.id,
          product_id: PRODUCT_ID,
          is_deleted: false,
        },
      });

      if (existingLead) {
        await visit.update({
          profile_id: existingProfile.id,
          lead_id: existingLead.id,
        });
        return { status: 'history_only' };
      }
    }

    // Creates the Website Visitors lead on the first visit and updates it on
    // every one after. Agent is deliberately not passed: for someone we already
    // know, createOrProcessReentry keeps their existing owner, which is what we
    // want — a website visit must never move a lead to a different agent.
    const result = await leadService.createOrProcessReentry(
      {
        product_id: PRODUCT_ID,
        subsource: page.section,
        name: name || existingProfile?.name || 'Website Visitor',
        email: email || existingProfile?.email || null,
        phone,
        country_code: country_code || existingProfile?.country_code || '+91',
        additional_data: {
          visitor_id,
          page_url: page.path,
          page_label: page.label,
        },
        source_created_at: when,
      },
      null,
      backfill ? BACKFILL_SOURCE : SOURCE,
    );

    await visit.update({
      profile_id: result.profile.id,
      lead_id: result.lead.id,
    });

    return { status: 'created' };
  } catch (err) {
    // Undo the claim so the next delivery can retry this visit from scratch.
    await visit.destroy().catch(() => {});
    throw err;
  }
};

module.exports = { ingest, PRODUCT_ID };
