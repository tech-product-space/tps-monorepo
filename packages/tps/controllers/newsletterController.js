const psEnv = require("@ps/env/tps");
const { Op } = require('sequelize');
const { NewsletterEmail, NewsletterCampaign } = require('../models');
const sendEmail = require('../service/mail/sendEmail');
const {
    generateUnsubscribeToken,
} = require('../service/campaign/emailUnsubscribeToken');
const {
    wrapEmailTemplate,
    wrapEmailTemplateWithUnsubscribe,
    cleanHtml,
} = require('../utils/email/htmlHelpers');
const {
    filterUnsubscribedRecipients,
} = require('../service/campaign/filterUnsubscribedRecipients');
const { getPaginationParams, getMeta } = require('../utils/pagination');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Outlook/Graph providers cap at ~4 emails/sec. Send sequentially and pace each
// send so we never exceed that (no concurrent bursts).
const SEND_INTERVAL_MS = 250; // 1000 / 4

// Senders wired up in service/mail/sendEmail.js
const ALLOWED_SENDERS = [
    'info@theproductspace.in',
    'akhil@theproductspace.in',
    'noreply@theproductspace.in',
];
const DEFAULT_FROM = 'info@theproductspace.in';
const DEFAULT_FROM_NAME = 'The Product Space';

// Build a Sequelize where-clause from optional filters.
// status: 'subscribed' | 'unsubscribed'
// from / to: ISO date strings (inclusive range on createdAt)
// emails: explicit list of addresses
const buildSubscriberWhere = ({ status, from, to, emails } = {}) => {
    const where = {};

    if (status === 'subscribed' || status === 'unsubscribed') {
        where.status = status;
    }

    if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt[Op.gte] = new Date(from);
        if (to) {
            const end = new Date(to);
            end.setHours(23, 59, 59, 999); // include the whole "to" day
            where.createdAt[Op.lte] = end;
        }
    }

    if (Array.isArray(emails) && emails.length > 0) {
        where.email = { [Op.in]: emails };
    }

    return where;
};

// ✅ Get newsletter subscribers.
// - With ?page=  -> paginated: { data, meta }
// - Without page -> full array (back-compat for the old Resources view / export)
// Filters: status, from, to (date range), search (email contains)
exports.getAll = async (req, res) => {
    try {
        const { status, from, to, search, page } = req.query;
        const where = buildSubscriberWhere({ status, from, to });
        if (search && search.trim()) {
            where.email = { [Op.iLike]: `%${search.trim()}%` };
        }

        if (page === undefined) {
            const emails = await NewsletterEmail.findAll({
                where,
                order: [['createdAt', 'DESC']],
            });
            return res.json(emails);
        }

        const { page: p, limit, offset } = getPaginationParams(req.query, 20, 100);
        const { count, rows } = await NewsletterEmail.findAndCountAll({
            where,
            order: [['createdAt', 'DESC']],
            limit,
            offset,
        });

        res.json({ data: rows, meta: getMeta(count, p, limit) });
    } catch (err) {
        console.error('newsletter getAll error', err);
        res.status(500).json({ error: 'Failed to fetch emails' });
    }
};

// ✅ Subscriber counts (admin dashboard / stats)
exports.getStats = async (req, res) => {
    try {
        const total = await NewsletterEmail.count();
        const subscribed = await NewsletterEmail.count({
            where: { status: 'subscribed' },
        });
        res.json({ total, subscribed, unsubscribed: total - subscribed });
    } catch (err) {
        console.error('newsletter getStats error', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
};

// ✅ Subscribe (public)
exports.subscribe = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const [record, created] = await NewsletterEmail.findOrCreate({
            where: { email },
            defaults: { status: 'subscribed' },
        });

        if (!created) {
            // if already exists, just update status back to subscribed
            record.status = 'subscribed';
            await record.save();
        }

        res.json({ message: 'Subscribed successfully', email: record });
    } catch (err) {
        res.status(500).json({ error: 'Failed to subscribe' });
    }
};

// ✅ Unsubscribe (public)
exports.unsubscribe = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const record = await NewsletterEmail.findOne({ where: { email } });
        if (!record) {
            return res.status(404).json({ error: 'Email not found' });
        }

        record.status = 'unsubscribed';
        await record.save();

        res.json({ message: 'Unsubscribed successfully', email: record });
    } catch (err) {
        res.status(500).json({ error: 'Failed to unsubscribe' });
    }
};

// ✅ Delete a subscriber (admin)
exports.remove = async (req, res) => {
    try {
        const { id } = req.params;
        const record = await NewsletterEmail.findByPk(id);
        if (!record) {
            return res.status(404).json({ error: 'Subscriber not found' });
        }
        await record.destroy();
        res.json({ message: 'Subscriber deleted' });
    } catch (err) {
        console.error('newsletter remove error', err);
        res.status(500).json({ error: 'Failed to delete subscriber' });
    }
};

// Build the final HTML for one recipient (adds the unsubscribe footer, same
// convention as campaignScheduler.js).
const buildHtmlFor = (email, bodyHtml) => {
    const cleaned = cleanHtml(bodyHtml);
    const token = generateUnsubscribeToken(email);
    const unsubscribeUrl = `${psEnv.FRONTEND_URL}/unsubscribe?token=${token}&type=campaign`;
    return wrapEmailTemplateWithUnsubscribe(cleaned, unsubscribeUrl);
};

// ✅ Send a newsletter to a set of subscribers (admin)
// Body: {
//   subject: string,
//   html: string,                 // body from the rich-text editor
//   from?: string, fromName?: string,
//   testEmail?: string,           // if set, only this address is mailed
//   audience: { type: 'all' }
//            | { type: 'date', from?: ISO, to?: ISO }
//            | { type: 'selected', emails: string[] }
// }
exports.sendBulk = async (req, res) => {
    try {
        const {
            subject,
            html,
            from,
            fromName,
            audience = { type: 'all' },
        } = req.body;

        if (!subject || !subject.trim()) {
            return res.status(400).json({ error: 'Subject is required' });
        }
        if (!html || !html.trim()) {
            return res.status(400).json({ error: 'Email body is required' });
        }

        const senderEmail = ALLOWED_SENDERS.includes(from) ? from : DEFAULT_FROM;
        const senderName = fromName || DEFAULT_FROM_NAME;

        const sendOne = async (toEmail) => {
            const result = await sendEmail({
                to: toEmail,
                subject,
                html: buildHtmlFor(toEmail, html),
                from: senderEmail,
                fromName: senderName,
                meta: {
                    source: 'NEWSLETTER',
                    sourceId: record?.id || null,
                    sourceName: subject || 'Newsletter Broadcast',
                },
            });
            return result === 'success';
        };

        // Resolve recipients from subscribed newsletter emails.
        const where = buildSubscriberWhere({
            status: 'subscribed',
            from: audience.type === 'date' ? audience.from : undefined,
            to: audience.type === 'date' ? audience.to : undefined,
            emails: audience.type === 'selected' ? audience.emails : undefined,
        });

        const subscribers = await NewsletterEmail.findAll({
            where,
            attributes: ['email'],
            raw: true,
        });

        let recipients = subscribers
            .map((s) => ({ email: s.email }))
            .filter((r) => r.email);

        // Exclude anyone who globally opted out (reuses campaign suppression).
        try {
            recipients = await filterUnsubscribedRecipients(recipients);
        } catch (e) {
            console.warn(
                'filterUnsubscribedRecipients failed, sending unfiltered:',
                e?.message,
            );
        }

        if (recipients.length === 0) {
            return res.json({
                message: 'No recipients matched',
                total: 0,
            });
        }

        // Create the history record up front (status 'sending'). Because we pace
        // sends to respect the provider rate limit, a large send can take a
        // while — so we kick it off in the background and return immediately.
        let record = null;
        try {
            record = await NewsletterCampaign.create({
                subject,
                senderEmail,
                senderName,
                body: html,
                audienceType: audience.type || 'all',
                audienceFrom:
                    audience.type === 'date' && audience.from ? new Date(audience.from) : null,
                audienceTo:
                    audience.type === 'date' && audience.to ? new Date(audience.to) : null,
                totalRecipients: recipients.length,
                sentCount: 0,
                failedCount: 0,
                status: 'sending',
            });
        } catch (e) {
            console.warn('Failed to create newsletter history:', e?.message);
        }

        res.json({
            message: 'Sending started',
            total: recipients.length,
            campaignId: record?.id || null,
        });

        // ---- Background send (sequential, paced to <= 4/sec) ----
        (async () => {
            let sent = 0;
            let failed = 0;
            for (const r of recipients) {
                const start = Date.now();
                const ok = await sendOne(r.email).catch(() => false);
                if (ok) sent++;
                else failed++;
                const elapsed = Date.now() - start;
                if (elapsed < SEND_INTERVAL_MS) {
                    await sleep(SEND_INTERVAL_MS - elapsed);
                }
            }
            if (record) {
                try {
                    await record.update({
                        sentCount: sent,
                        failedCount: failed,
                        status:
                            failed === 0 ? 'sent' : sent === 0 ? 'failed' : 'partial',
                    });
                } catch (e) {
                    console.warn('Failed to finalize newsletter history:', e?.message);
                }
            }
            console.log(
                `Newsletter "${subject}" done — sent ${sent}, failed ${failed}`,
            );
        })();
    } catch (err) {
        console.error('newsletter sendBulk error', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to send newsletter' });
        }
    }
};

// ✅ Send a single test email (admin)
// Body: { subject, html, from?, fromName?, email }
exports.sendTest = async (req, res) => {
    try {
        const { subject, html, from, fromName, email } = req.body;

        if (!subject || !subject.trim()) {
            return res.status(400).json({ error: 'Subject is required' });
        }
        if (!html || !html.trim()) {
            return res.status(400).json({ error: 'Email body is required' });
        }
        if (!email || !email.trim()) {
            return res.status(400).json({ error: 'Test email address is required' });
        }

        const senderEmail = ALLOWED_SENDERS.includes(from) ? from : DEFAULT_FROM;
        const senderName = fromName || DEFAULT_FROM_NAME;

        const result = await sendEmail({
            to: email.trim(),
            subject,
            html: buildHtmlFor(email.trim(), html),
            from: senderEmail,
            fromName: senderName,
            meta: {
                source: 'NEWSLETTER',
                sourceName: `Test: ${subject || 'Newsletter'}`,
                extra: { isTest: true },
            },
        });

        const ok = result === 'success';
        res.json({
            message: ok ? 'Test email sent' : 'Test email failed',
            sent: ok ? 1 : 0,
            failed: ok ? 0 : 1,
        });
    } catch (err) {
        console.error('newsletter sendTest error', err);
        res.status(500).json({ error: 'Failed to send test email' });
    }
};

// ✅ Newsletter send history (admin)
exports.getHistory = async (req, res) => {
    try {
        const history = await NewsletterCampaign.findAll({
            order: [['createdAt', 'DESC']],
        });
        res.json(history);
    } catch (err) {
        console.error('newsletter getHistory error', err);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
};
