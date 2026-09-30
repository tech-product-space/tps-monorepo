const fs = require('fs');
const { parse } = require('csv-parse');
const leadService = require('../services/lead.service');
const { Activity } = require('../models');

/**
 * Controller: Handles CSV bulk import
 * Expects file uploaded as 'csvFile'
 */
const importCsv = (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No CSV file uploaded.' });
  }

  const results = [];
  const errors = [];
  let processedCount = 0;
  let reEntryCount = 0;
  let newCount = 0;

  fs.createReadStream(req.file.path)
    .pipe(parse({ columns: true, skip_empty_lines: true, trim: true }))
    .on('data', (data) => {
      // Normalize columns: ensure we at least have phone and name
      // Supported format: Name, Phone, Email, Product
      const normalizedData = {
        name: data.Name || data.name || 'Anonymous',
        phone: data.Phone || data.phone || data.PhoneNumber || '',
        email: data.Email || data.email || null,
        product_id: data.Product || data.product || 'General Inquiry',
        agent_id: data.AgentId || data.agent_id || data.agentId || undefined,
        source: 'CSV Import'
      };
      
      results.push(normalizedData);
    })
    .on('error', (error) => {
      fs.unlinkSync(req.file.path); // clean up
      return res.status(500).json({ error: 'Failed to parse CSV.', details: error.message });
    })
    .on('end', async () => {
      // Process sequentially to avoid DB locks/transaction collisions on scale
      for (const leadData of results) {
        if (!leadData.phone) {
          errors.push(`Row missing phone number: ${JSON.stringify(leadData)}`);
          continue;
        }

        try {
          // Send straight to the Brain (Deduplication engine)
          const actorId = req.user ? req.user.id : null;
          const result = await leadService.createOrProcessReentry(leadData, actorId, 'CSV Import');
          
          if (result.status === 'CREATED') {
            newCount++;
          } else if (result.status === 'RE_ENTRY') {
            reEntryCount++;
          }
          processedCount++;
        } catch (err) {
          errors.push(`Failed to process phone ${leadData.phone}: ${err.message}`);
        }
      }

      // Cleanup temp file
      fs.unlinkSync(req.file.path);

      // Log a bulk import activity for each successfully processed lead
      const actorId = req.user ? req.user.id : null;
      if (processedCount > 0) {
        // Find all leads that were just processed to log import event
        for (const leadData of results) {
          if (!leadData.phone) continue;
          try {
            const normalizedPhone = leadData.phone.replace(/\D/g, '');
            const { LeadProfile, Lead } = require('../models');
            const profile = await LeadProfile.findOne({ where: { phone: normalizedPhone } });
            if (profile) {
              const lead = await Lead.findOne({ where: { profile_id: profile.id, is_deleted: false }, order: [['updated_at', 'DESC']] });
              if (lead) {
                await Activity.create({
                  lead_id: lead.id,
                  profile_id: profile.id,
                  type: 'System',
                  title: 'CSV Import',
                  details: `Imported via CSV bulk upload by ${req.user ? req.user.name || req.user.id : 'system'} (${processedCount} total rows processed).`,
                  actor_id: actorId,
                  metadata: {
                    source: 'CSV Import',
                    uploaded_by: actorId,
                    total_rows: processedCount,
                    new_leads: newCount,
                    re_entries: reEntryCount,
                  }
                });
              }
            }
          } catch (_) { /* best-effort logging */ }
        }
      }

      res.status(200).json({
        message: 'Import completed successfully.',
        stats: {
          totalRowsProcessed: processedCount,
          newLeadsCreated: newCount,
          reEntriesTriggered: reEntryCount,
          errors: errors.length > 0 ? errors : null
        }
      });
    });
};

module.exports = {
  importCsv
};
