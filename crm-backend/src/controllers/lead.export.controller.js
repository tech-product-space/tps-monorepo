"use strict";

const { Op } = require("sequelize");
const {
  Lead,
  LeadProfile,
  LeadNote,
  User,
  Status,
  Subsource,
} = require("../models");
const leadFilter = require("../services/leadFilter.service");
const { canExportLeads } = require("../config/constants/roles");
const {
  csvEscape,
  csvText,
  toHeader,
  formatDateTimeForExport,
} = require("../utils/csv");

/**
 * Notes for every exported lead, keyed by profile id.
 *
 * Scoped to the PROFILE, not the lead — lead_notes is shared across a person's
 * product instances (see LeadNote.profile_id), and the notes tab in the app
 * reads /leads/:id/profile-notes. Exporting only the notes typed against this
 * one product row would show less than the CRM does.
 *
 * Fetched as a second query rather than an include: the export has no LIMIT, so
 * hanging a hasMany off the lead rows would multiply every lead by its note
 * count before the driver ever sees them.
 */
const fetchNotesByProfile = async (profileIds) => {
  const byProfile = new Map();
  if (profileIds.length === 0) return byProfile;

  // Chunked so a full-pipeline export doesn't build one giant IN (...) list.
  const CHUNK = 500;

  for (let i = 0; i < profileIds.length; i += CHUNK) {
    const notes = await LeadNote.findAll({
      where: { profile_id: { [Op.in]: profileIds.slice(i, i + CHUNK) } },
      order: [["created_at", "DESC"]], // newest first, as the notes tab shows them
      include: [
        { model: User, as: "Actor", attributes: ["id", "name"] },
        { model: Lead, as: "Lead", attributes: ["id", "product_id"] },
      ],
    });

    for (const note of notes) {
      const list = byProfile.get(note.profile_id);
      if (list) list.push(note);
      else byProfile.set(note.profile_id, [note]);
    }
  }

  return byProfile;
};

/**
 * The models are `underscored: true`, which leaves the timestamp ATTRIBUTE name
 * up to the Sequelize version even though the column is `created_at`. The notes
 * feed in the client hedges the same way (`n.created_at || n.createdAt`).
 */
const noteDate = (note) => note.created_at || note.createdAt || null;

/**
 * One note → one line of the Notes cell.
 *
 * Newlines inside the content are flattened to spaces so a note never breaks
 * into what looks like a second entry; the cell itself keeps real newlines
 * between notes, which csvEscape quotes and Excel renders as one wrapped cell.
 *
 * The product tag only appears when the note came from a DIFFERENT product than
 * the row being exported — otherwise it is noise on every line.
 */
const formatNote = (note, rowProductId) => {
  const parts = [
    formatDateTimeForExport(noteDate(note)),
    note.Actor?.name || "System",
    note.type,
  ];

  const noteProduct = note.Lead?.product_id;
  if (noteProduct && noteProduct !== rowProductId) parts.push(noteProduct);

  const content = String(note.content || "")
    .replace(/\s*[\r\n]+\s*/g, " ")
    .trim();

  return `[${parts.join(" | ")}] ${content}`;
};

/**
 * GET /leads/export
 * Superadmin only — a bulk extract of the whole pipeline.
 *
 * Column layout:
 *   [Fixed core] → [extra_fields keys, only if single product] → [UTMs] → [Dates]
 *   → [Notes]
 *
 * Notes go last because the full log is a tall multi-line cell; anything after
 * it in the row is hard to read in a spreadsheet.
 */
const exportLeads = async (req, res) => {
  try {
    if (!canExportLeads(req.user.role)) {
      return res.status(403).json({ error: "Access denied." });
    }

    const { sort = "lead_update_date", order = "DESC", product } = req.query;

    const { where, profileWhere } = await leadFilter.buildLeadQuery(req);

    const rows = await Lead.findAll({
      where,
      order: leadFilter.buildOrderClause(sort, order),
      include: [
        {
          model: LeadProfile,
          as: "Profile",
          ...(profileWhere ? { where: profileWhere } : {}),
        },
        { model: User, as: "Agent", attributes: ["id", "name"] },
        { model: Status, as: "StatusConfig", attributes: ["id", "label"] },
        {
          model: Subsource,
          as: "SubsourceConfig",
          attributes: ["id", "label"],
        },
      ],
    });

    const notesByProfile = await fetchNotesByProfile([
      ...new Set(rows.map((lead) => lead.profile_id).filter(Boolean)),
    ]);

    // Collect all extra_fields keys (sorted) only when a single product is selected
    const singleProduct = product && !product.includes(",") ? product : null;

    const extraKeys = (() => {
      if (!singleProduct) return [];
      const keySet = new Set();
      for (const lead of rows) {
        for (const key of Object.keys(lead.extra_fields || {})) {
          keySet.add(key);
        }
      }
      return [...keySet].sort();
    })();

    // Headers: Fixed → extra_fields (product only) → UTMs → Dates
    const headers = [
      "Lead ID",
      "Name",
      "Email",
      "Country Code",
      "Phone",
      "Product",
      "Subsource",
      "Status",
      "Agent",
      "Next Followup",
      "Loss Reason",
      ...extraKeys.map(toHeader),
      "UTM ID",
      "UTM Source",
      "UTM Medium",
      "UTM Campaign",
      "UTM Content",
      "Source Created",
      "Last Entry Date",
      "Modified Date",
      "Assigned Date",
      "Notes Count",
      "Last Note Date",
      "Last Note",
      "Notes",
    ];

    const csvRows = [headers.join(",")];

    for (const lead of rows) {
      const p = lead.Profile || {};
      const ef = lead.extra_fields || {};
      const notes = notesByProfile.get(lead.profile_id) || [];
      // notes are newest-first, so [0] is the latest
      const latest = notes[0];

      // Cells are encoded individually rather than mapped through one escaper,
      // because the two phone columns need csvText and everything else needs
      // csvEscape. Running csvEscape over a csvText cell would re-quote it and
      // the `="…"` pin would stop working.
      const values = [
        csvEscape(lead.id),
        csvEscape(p.name),
        csvEscape(p.email),
        // Pinned as text: "+91" is a formula to Excel, and a 10–12 digit phone
        // number goes scientific. See utils/csv.js.
        csvText(p.country_code),
        csvText(p.phone),
        csvEscape(lead.product_id),
        csvEscape(lead.SubsourceConfig?.label || lead.subsource_id || ""),
        csvEscape(lead.StatusConfig?.label || lead.status_id || ""),
        csvEscape(lead.Agent?.name || ""),
        csvEscape(
          lead.next_followup ? new Date(lead.next_followup).toLocaleString() : "",
        ),
        csvEscape(lead.loss_reason || ""),
        ...extraKeys.map((key) => {
          const val = ef[key];
          if (val === null || val === undefined) return "";
          if (typeof val === "object") return csvEscape(JSON.stringify(val));
          return csvEscape(val);
        }),
        csvEscape(lead.utm_id || ""),
        csvEscape(lead.utm_source || ""),
        csvEscape(lead.utm_medium || ""),
        csvEscape(lead.utm_campaign || ""),
        csvEscape(lead.utm_content || ""),
        csvEscape(
          lead.source_created_at
            ? new Date(lead.source_created_at).toISOString()
            : "",
        ),
        csvEscape(
          lead.lead_update_date
            ? new Date(lead.lead_update_date).toISOString()
            : "",
        ),
        csvEscape(lead.updated_at ? new Date(lead.updated_at).toISOString() : ""),
        csvEscape(lead.assigned_at ? new Date(lead.assigned_at).toISOString() : ""),
        csvEscape(notes.length),
        csvEscape(latest ? formatDateTimeForExport(noteDate(latest)) : ""),
        csvEscape(latest ? formatNote(latest, lead.product_id) : ""),
        csvEscape(notes.map((n) => formatNote(n, lead.product_id)).join("\n")),
      ];

      csvRows.push(values.join(","));
    }

    const productSlug = singleProduct
      ? `_${singleProduct.toLowerCase().replace(/\s+/g, "-")}`
      : "";
    const filename = `tps-crm-leads${productSlug}_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    // CRLF between records: the Notes cell now carries bare LFs of its own, and
    // CRLF is what tells a stricter parser which newlines end a row.
    res.status(200).send(csvRows.join("\r\n"));
  } catch (error) {
    console.error("Export leads error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
};

module.exports = { exportLeads };
