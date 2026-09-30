const { Op } = require('sequelize');
const { Lead, LeadProfile, WebsiteActivity, sequelize } = require('../models');
const leadService = require('../services/lead.service');
const { parsePagination, buildPage } = require('../utils/pagination');

/**
 * GET /api/v1/leads/:id/website-activity
 *
 * A person's browsing history: which pages they opened and when.
 *
 * The lead in the URL is only a way in. What comes back belongs to the PERSON
 * behind it, so opening someone's PM Fellowship lead shows the same trail as
 * opening their Website Visitors lead. That is the point of the feature — the
 * signal is most useful on the lead an agent is already working, not on a
 * separate list.
 *
 * The join is on the phone, resolved here at read time rather than stored when
 * the rows arrived. That is what makes it self-healing: someone who browsed the
 * site for three weeks before they existed in this CRM gets their whole history
 * the moment their lead is created, with no backfill and no linking job.
 *
 * Also returned: any OTHER phone number seen on the same browsers. TPS uses a
 * visitor's most recent contact form, so a person who submits a second number
 * becomes a second person here. Rather than merge them — browsers get shared,
 * and welding two strangers into one record is very hard to undo — we surface
 * the connection and let someone decide. See WEBSITE_ACTIVITY_PLAN.md §4.4.
 */
const getWebsiteActivity = async (req, res) => {
  try {
    const { id } = req.params;

    const lead = await Lead.findOne({
      where: { id, is_deleted: false },
      include: [{ model: LeadProfile, as: 'Profile', attributes: ['id', 'phone'] }],
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const phone = leadService.normalizePhone(lead.Profile?.phone);

    // No phone means nothing can be matched to this person. Answer with an empty
    // trail rather than a 404 — "we have no browsing for them" is a real answer,
    // and the tab uses it to decide not to show itself.
    if (!phone) {
      return res.status(200).json(
        buildPage(
          { rows: [], count: 0, page: 1, limit: 1 },
          { summary: { total: 0, firstSeen: null, lastSeen: null }, otherNumbers: [] },
        ),
      );
    }

    const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 50 });

    const { count, rows } = await WebsiteActivity.findAndCountAll({
      where: { phone },
      order: [['occurred_at', 'DESC']],
      limit,
      offset,
      attributes: [
        'id', 'visitor_id', 'page_url', 'page_label', 'section',
        'type', 'occurred_at',
      ],
    });

    // First and last across the WHOLE trail, not just this page of it.
    const [span] = await sequelize.query(
      `SELECT MIN(occurred_at) AS "firstSeen",
              MAX(occurred_at) AS "lastSeen"
         FROM website_activity
        WHERE phone = :phone`,
      { replacements: { phone }, type: sequelize.QueryTypes.SELECT },
    );

    // Other numbers seen on the same browsers. Grouped rather than listed: the
    // agent needs "this device also belongs to 456, four visits", not another
    // person's page-by-page browsing.
    const otherNumbers = await sequelize.query(
      `SELECT a.phone,
              MAX(a.name)              AS name,
              COUNT(*)::int            AS visits,
              MIN(a.occurred_at)       AS "firstSeen",
              MAX(a.occurred_at)       AS "lastSeen"
         FROM website_activity a
        WHERE a.visitor_id IN (
                SELECT DISTINCT visitor_id
                  FROM website_activity
                 WHERE phone = :phone
              )
          AND a.phone IS NOT NULL
          AND a.phone <> :phone
        GROUP BY a.phone
        ORDER BY MAX(a.occurred_at) DESC
        LIMIT 5`,
      { replacements: { phone }, type: sequelize.QueryTypes.SELECT },
    );

    return res.status(200).json(
      buildPage(
        { rows, count, page, limit },
        {
          summary: {
            total: count,
            firstSeen: span?.firstSeen || null,
            lastSeen: span?.lastSeen || null,
          },
          otherNumbers,
        },
      ),
    );
  } catch (error) {
    console.error('Get website activity error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { getWebsiteActivity };
