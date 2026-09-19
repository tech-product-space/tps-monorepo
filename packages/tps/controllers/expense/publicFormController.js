const psEnv = require("@ps/env/tps");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const s3 = require("../../config/aws");
const { ExpenseForm, ExpenseTeam, Expense, ExpensePaymentAccount } = require("../../models");
const {
  EXPENSE_STATUS,
  EXPENSE_SOURCE,
  CURRENCY_CODES,
  DEFAULT_CURRENCY,
} = require("../../constants/expenses");
const {
  buildAllowedCategoryTree,
  validateSelection,
  normalizeFieldConfig,
} = require("../../service/expense/expenseFormService");

// Receipt types we accept from the (untrusted) public endpoint.
const ALLOWED_RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

async function findActiveForm(slug) {
  return ExpenseForm.findOne({
    where: { slug, is_active: true },
    include: [{ model: ExpenseTeam, as: "team", attributes: ["id", "name"] }],
  });
}

// Public form config used to render the page. Only the fields a submitter needs.
const getPublicForm = async (req, res) => {
  try {
    const form = await findActiveForm(req.params.slug);
    if (!form) return res.status(404).json({ error: "Form not found" });

    const categories = await buildAllowedCategoryTree(form.id);
    const fieldConfig = normalizeFieldConfig(form.field_config);

    // Only expose the account list when the form actually renders that field —
    // no reason to leak internal account names on forms that don't use it.
    const paymentAccounts = fieldConfig.payment_account.enabled
      ? await ExpensePaymentAccount.findAll({
          where: { is_active: true },
          attributes: ["id", "name"],
          order: [["name", "ASC"]],
        })
      : [];

    res.status(200).json({
      success: true,
      data: {
        name: form.name,
        team: form.team ? form.team.name : null,
        instructions: form.instructions,
        field_config: fieldConfig,
        categories,
        paymentAccounts,
      },
    });
  } catch (error) {
    console.error("Error loading public form:", error);
    res.status(500).json({ error: "Failed to load form", details: error.message });
  }
};

const submitPublicForm = async (req, res) => {
  const {
    title,
    amount,
    currency,
    expense_date,
    category_id,
    subcategory_id,
    payment_method,
    payment_account_id,
    vendor,
    notes,
    receipt_url,
    submitter_name,
    submitter_email,
    submitter_phone,
    website, // honeypot — real users never fill this hidden field
  } = req.body;

  try {
    const form = await findActiveForm(req.params.slug);
    if (!form) return res.status(404).json({ error: "Form not found" });

    // Honeypot: pretend success so bots don't learn they were filtered.
    if (website) return res.status(201).json({ success: true });

    if (!title || !title.trim()) return res.status(400).json({ error: "'title' is required" });
    if (amount === undefined || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ error: "'amount' must be a positive number" });
    }

    const selection = await validateSelection(form.id, category_id, subcategory_id || null);
    if (!selection.ok) return res.status(400).json({ error: selection.error });

    // Validate the configurable fields against the form's field_config: only
    // enabled fields are stored, and enabled+required fields must be present.
    const fc = normalizeFieldConfig(form.field_config);
    const clean = (v) => (v ? String(v).trim() : "");
    const errors = {
      name: "Your name is required",
      email: "Your email is required",
      phone: "Your phone number is required",
      payment_method: "Payment mode is required",
      payment_account: "Payment account is required",
      vendor: "Vendor is required",
      receipt: "A receipt is required for this form",
      notes: "Notes are required for this form",
    };
    const values = {
      name: clean(submitter_name),
      email: clean(submitter_email),
      phone: clean(submitter_phone),
      payment_method: clean(payment_method),
      payment_account: clean(payment_account_id),
      vendor: clean(vendor),
      receipt: receipt_url || "",
      notes: clean(notes),
    };
    for (const key of Object.keys(errors)) {
      if (fc[key].enabled && fc[key].required && !values[key]) {
        return res.status(400).json({ error: errors[key] });
      }
    }

    // Only persist a field's value when that field is enabled on the form.
    const keep = (key, v) => (fc[key].enabled && v ? v : null);

    // The submitted account id is untrusted — accept it only if it's a real,
    // active account, otherwise drop it rather than writing a dangling FK.
    let accountId = keep("payment_account", values.payment_account);
    if (accountId) {
      const account = await ExpensePaymentAccount.findOne({
        where: { id: accountId, is_active: true },
      });
      if (!account) {
        if (fc.payment_account.required) {
          return res.status(400).json({ error: "Select a valid payment account" });
        }
        accountId = null;
      }
    }

    // Honour the submitted currency when it's one we support; else default INR.
    const safeCurrency = CURRENCY_CODES.includes(currency) ? currency : DEFAULT_CURRENCY;

    await Expense.create({
      title: title.trim(),
      amount,
      currency: safeCurrency,
      expense_date: expense_date || new Date().toISOString().slice(0, 10),
      category_id,
      subcategory_id: subcategory_id || null,
      status: EXPENSE_STATUS.PENDING, // external rows start unpaid
      payment_method: keep("payment_method", values.payment_method),
      payment_account_id: accountId,
      vendor: keep("vendor", values.vendor),
      notes: keep("notes", values.notes),
      receipt_url: keep("receipt", values.receipt),
      created_by: null,
      source: EXPENSE_SOURCE.EXTERNAL,
      expense_form_id: form.id,
      team_id: form.team_id,
      submitter_name: keep("name", values.name),
      submitter_email: keep("email", values.email),
      submitter_phone: keep("phone", values.phone),
    });

    res.status(201).json({ success: true, message: "Expense submitted" });
  } catch (error) {
    console.error("Error submitting public expense:", error);
    res.status(500).json({ error: "Failed to submit expense", details: error.message });
  }
};

// Receipt upload for the public form. Validates the form is real/active and
// restricts file types before pushing to S3.
const uploadPublicReceipt = async (req, res) => {
  try {
    const form = await findActiveForm(req.params.slug);
    if (!form) return res.status(404).json({ error: "Form not found" });

    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    if (!ALLOWED_RECEIPT_TYPES.includes(req.file.mimetype)) {
      return res.status(400).json({ error: "Only image or PDF receipts are allowed" });
    }

    const file = req.file;
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]+/g, "-");
    const key = `expenses/form-receipts/${form.slug}/${Date.now()}-${safeName}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: psEnv.AWS_BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      })
    );

    const url = `https://${psEnv.AWS_BUCKET_NAME}.s3.${psEnv.AWS_REGION}.amazonaws.com/${key}`;
    res.status(200).json({ success: true, url, key });
  } catch (error) {
    console.error("Error uploading public receipt:", error);
    res.status(500).json({ error: "Failed to upload receipt", details: error.message });
  }
};

module.exports = { getPublicForm, submitPublicForm, uploadPublicReceipt };
