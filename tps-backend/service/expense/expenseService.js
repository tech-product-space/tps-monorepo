const { Op, fn, col, literal } = require("sequelize");
const {
  Expense,
  ExpenseCategory,
  ExpenseSubcategory,
  ExpenseTeam,
  RecurringExpense,
  sequelize,
} = require("../../models");
const { EXPENSE_STATUS, DEFAULT_CURRENCY } = require("../../constants/expenses");

/**
 * Build a Sequelize `where` for the expense list/report filters shared by
 * several controllers.
 */
function buildExpenseWhere({
  categoryId,
  subcategoryId,
  status,
  from,
  to,
  search,
  source,
  teamId,
  currency,
  paymentAccountId,
}) {
  const where = {};

  if (categoryId) where.category_id = categoryId;
  if (subcategoryId) where.subcategory_id = subcategoryId;
  if (status) where.status = status;
  if (source) where.source = source;
  if (teamId) where.team_id = teamId;
  if (currency) where.currency = currency;
  if (paymentAccountId) where.payment_account_id = paymentAccountId;

  if (from || to) {
    where.expense_date = {};
    if (from) where.expense_date[Op.gte] = from;
    if (to) where.expense_date[Op.lte] = to;
  }

  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    where[Op.or] = [
      { title: { [Op.iLike]: q } },
      { vendor: { [Op.iLike]: q } },
      { notes: { [Op.iLike]: q } },
      // External submitter identity (name / email / phone).
      { submitter_name: { [Op.iLike]: q } },
      { submitter_email: { [Op.iLike]: q } },
      { submitter_phone: { [Op.iLike]: q } },
    ];
  }

  return where;
}

/**
 * Aggregated report used by the dashboard: grand total, per-category breakdown,
 * and a per-month series — all honouring the same date/status filters.
 *
 * Amounts are NEVER summed across currencies. `byCurrency` lists every currency
 * present (ignoring the currency filter so the dashboard selector stays
 * complete), and every other figure is scoped to a single `effectiveCurrency`:
 * the requested one, else the highest-spending currency, else the default.
 */
async function getSummary(filters) {
  // `where` excluding the currency filter — used to enumerate all currencies.
  const whereNoCurrency = buildExpenseWhere({ ...filters, currency: undefined });

  const byCurrency = await Expense.findAll({
    where: whereNoCurrency,
    attributes: [
      "currency",
      [fn("COALESCE", fn("SUM", col("amount")), 0), "total"],
      [fn("COUNT", col("id")), "count"],
    ],
    group: ["currency"],
    order: [[literal("total"), "DESC"]],
    raw: true,
  });

  const effectiveCurrency =
    filters.currency || byCurrency[0]?.currency || DEFAULT_CURRENCY;

  // Everything else is single-currency, scoped to the effective currency.
  const where = { ...whereNoCurrency, currency: effectiveCurrency };

  const [totalRow, byCategory, byMonth, byStatus, byTeam, bySource] = await Promise.all([
    Expense.findOne({
      where,
      attributes: [
        [fn("COALESCE", fn("SUM", col("amount")), 0), "total"],
        [fn("COUNT", col("id")), "count"],
      ],
      raw: true,
    }),

    Expense.findAll({
      where,
      attributes: [
        "category_id",
        [fn("COALESCE", fn("SUM", col("Expense.amount")), 0), "total"],
        [fn("COUNT", col("Expense.id")), "count"],
      ],
      include: [
        { model: ExpenseCategory, as: "category", attributes: ["name"] },
      ],
      group: ["Expense.category_id", "category.id"],
      order: [[literal("total"), "DESC"]],
      raw: true,
      nest: true,
    }),

    Expense.findAll({
      where,
      attributes: [
        [fn("to_char", col("expense_date"), "YYYY-MM"), "month"],
        [fn("COALESCE", fn("SUM", col("amount")), 0), "total"],
      ],
      group: [literal("month")],
      order: [[literal("month"), "ASC"]],
      raw: true,
    }),

    Expense.findAll({
      where,
      attributes: [
        "status",
        [fn("COALESCE", fn("SUM", col("amount")), 0), "total"],
        [fn("COUNT", col("id")), "count"],
      ],
      group: ["status"],
      raw: true,
    }),

    Expense.findAll({
      where,
      attributes: [
        "team_id",
        [fn("COALESCE", fn("SUM", col("Expense.amount")), 0), "total"],
        [fn("COUNT", col("Expense.id")), "count"],
      ],
      include: [{ model: ExpenseTeam, as: "team", attributes: ["name"] }],
      group: ["Expense.team_id", "team.id"],
      order: [[literal("total"), "DESC"]],
      raw: true,
      nest: true,
    }),

    Expense.findAll({
      where,
      attributes: [
        "source",
        [fn("COALESCE", fn("SUM", col("amount")), 0), "total"],
        [fn("COUNT", col("id")), "count"],
      ],
      group: ["source"],
      raw: true,
    }),
  ]);

  return {
    currency: effectiveCurrency,
    total: Number(totalRow?.total || 0),
    count: Number(totalRow?.count || 0),
    byCurrency: byCurrency.map((r) => ({
      currency: r.currency,
      total: Number(r.total || 0),
      count: Number(r.count || 0),
    })),
    byCategory: byCategory.map((r) => ({
      categoryId: r.category_id,
      categoryName: r.category?.name || "Uncategorized",
      total: Number(r.total || 0),
      count: Number(r.count || 0),
    })),
    byMonth: byMonth.map((r) => ({
      month: r.month,
      total: Number(r.total || 0),
    })),
    byStatus: byStatus.map((r) => ({
      status: r.status,
      total: Number(r.total || 0),
      count: Number(r.count || 0),
    })),
    byTeam: byTeam.map((r) => ({
      teamId: r.team_id,
      teamName: r.team?.name || "No team",
      total: Number(r.total || 0),
      count: Number(r.count || 0),
    })),
    bySource: bySource.map((r) => ({
      source: r.source,
      total: Number(r.total || 0),
      count: Number(r.count || 0),
    })),
  };
}

/**
 * Per-currency totals for the expense LIST footer. Uses the SAME filters as the
 * list but runs over the whole matching set (no pagination) and groups by
 * currency, so amounts in different currencies are never merged. Intentionally
 * lightweight (a single GROUP BY) and separate from the heavier `getSummary`
 * report, and from the list's own row query.
 */
async function getTotalsByCurrency(filters) {
  const where = buildExpenseWhere(filters);

  const rows = await Expense.findAll({
    where,
    attributes: [
      "currency",
      [fn("COALESCE", fn("SUM", col("amount")), 0), "total"],
      [fn("COUNT", col("id")), "count"],
    ],
    group: ["currency"],
    order: [[literal("total"), "DESC"]],
    raw: true,
  });

  return rows.map((r) => ({
    currency: r.currency,
    total: Number(r.total || 0),
    count: Number(r.count || 0),
  }));
}

/**
 * Generate the day's due recurring expenses. Idempotent: a template only fires
 * once per calendar month thanks to the `last_run_date` guard, so re-running on
 * the same day (or a missed-then-recovered cron) never double-creates.
 *
 * @param {Date} [now] - injectable "today" for testing.
 * @returns {Promise<{ generated: number, expenseIds: string[] }>}
 */
async function generateDueRecurringExpenses(now = new Date()) {
  const today = now.getDate();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(today).padStart(2, "0");
  const todayStr = `${yyyy}-${mm}-${dd}`;
  const monthStart = `${yyyy}-${mm}-01`;

  const due = await RecurringExpense.findAll({
    where: {
      is_active: true,
      day_of_month: today,
      [Op.or]: [
        { last_run_date: null },
        { last_run_date: { [Op.lt]: monthStart } }, // not yet run this month
      ],
    },
  });

  const expenseIds = [];

  for (const r of due) {
    await sequelize.transaction(async (transaction) => {
      const created = await Expense.create(
        {
          title: r.title,
          amount: r.amount,
          currency: r.currency,
          expense_date: todayStr,
          category_id: r.category_id,
          subcategory_id: r.subcategory_id,
          status: EXPENSE_STATUS.PENDING,
          payment_method: r.payment_method,
          payment_account_id: r.payment_account_id,
          vendor: r.vendor,
          notes: r.notes,
          recurring_expense_id: r.id,
          created_by: r.created_by,
        },
        { transaction }
      );
      r.last_run_date = todayStr;
      await r.save({ transaction });
      expenseIds.push(created.id);
    });
  }

  return { generated: expenseIds.length, expenseIds };
}

module.exports = {
  buildExpenseWhere,
  getSummary,
  getTotalsByCurrency,
  generateDueRecurringExpenses,
};
