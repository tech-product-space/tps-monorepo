const { Op } = require('sequelize');
const { Cohort } = require('../models');

// Every boundary below is a wall-clock boundary in this zone, not UTC. A lead
// that arrives at 00:30 IST belongs to that IST day; computing "today" off the
// server clock would put it in the previous day whenever the server runs UTC
// (which it does in prod, and does not in dev — so this cannot be left to
// setHours). Matches DASHBOARD_TIMEZONE used by the dashboard buckets.
const LOCAL_TZ = process.env.DASHBOARD_TIMEZONE || 'Asia/Kolkata';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The offset of LOCAL_TZ at a given instant, in ms. DST-safe. */
function tzOffsetMs(at) {
  // Format the instant in LOCAL_TZ, re-read it as if it were UTC, and the
  // difference is the zone's offset at that moment.
  const asLocal = new Date(
    at.toLocaleString('en-US', { timeZone: LOCAL_TZ }),
  );
  const asUtc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }));
  return asLocal.getTime() - asUtc.getTime();
}

/** YYYY-MM-DD for an instant, in LOCAL_TZ. */
function localYmd(at) {
  return at.toLocaleDateString('en-CA', { timeZone: LOCAL_TZ });
}

/**
 * The UTC instant of local midnight starting the given local calendar day.
 * `ymd` is a YYYY-MM-DD string.
 */
function localMidnight(ymd) {
  // Guess using the offset at noon UTC on that date — far enough from any DST
  // transition that the guess lands on the right day, then correct once.
  const guess = new Date(`${ymd}T12:00:00Z`);
  const offset = tzOffsetMs(guess);
  return new Date(new Date(`${ymd}T00:00:00Z`).getTime() - offset);
}

/** Local midnight at the start of the local day containing `at`. */
function startOfLocalDay(at) {
  return localMidnight(localYmd(at));
}

/** Monday 00:00 local, for the local week containing `at`. */
function startOfLocalWeek(at) {
  const dayStart = startOfLocalDay(at);
  // getDay() on the shifted instant would read the server's zone, so derive the
  // weekday from the local calendar date instead.
  const [y, m, d] = localYmd(at).split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
  const backToMonday = (dow + 6) % 7; // Monday-first week
  return localMidnight(localYmd(new Date(dayStart.getTime() - backToMonday * DAY_MS)));
}

/** The 1st of the month at 00:00 local, for the local month containing `at`. */
function startOfLocalMonth(at) {
  const [y, m] = localYmd(at).split('-');
  return localMidnight(`${y}-${m}-01`);
}

/** How many days a local calendar month has. `month` is 1-based. */
function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The local month `delta` months away from the one containing `at`. */
function shiftLocalMonth(at, delta) {
  const [y, m] = localYmd(at).split('-').map(Number);
  const zero = y * 12 + (m - 1) + delta;
  const year = Math.floor(zero / 12);
  const month = (zero % 12) + 1;
  return { year, month, ymd: `${year}-${String(month).padStart(2, '0')}-01` };
}

/**
 * A cohort's effective window.
 *
 * start_date / end_date are DATEONLY, so they mean whole local days: the window
 * opens at local midnight on start_date and closes at the very end of end_date.
 *
 * end_date is usually NULL in practice — cohorts are run as sequential intakes,
 * each simply superseded by the next. An open-ended cohort therefore runs until
 * the following cohort of the same programme begins, and the latest one runs
 * until now. Treating a null end as "no bound" instead would make every past
 * cohort's window swallow all the ones after it.
 */
function cohortWindow(cohort, successor, now) {
  const from = localMidnight(cohort.start_date);

  let to;
  if (cohort.end_date) {
    to = new Date(localMidnight(cohort.end_date).getTime() + DAY_MS - 1);
  } else if (successor?.start_date) {
    to = new Date(localMidnight(successor.start_date).getTime() - 1);
  } else {
    to = null; // still the running cohort
  }

  // A cohort that has not begun has no window to measure yet.
  if (from > now) {
    return { from, to: from, bounded: !!to, notStarted: true, inProgress: false };
  }

  const bounded = !!to && to <= now;
  return {
    from,
    to: to && to < now ? to : now,
    bounded,
    notStarted: false,
    inProgress: !bounded,
  };
}

/**
 * Resolve the board's period toggle into a current window, a comparable
 * previous window, and the labels the UI needs to describe both.
 *
 * Returns:
 *   {
 *     period:   { mode, from, to, label, days, in_progress, elapsed_days },
 *     previous: { from, to, label, days } | null,
 *     cohort:   { current, previous } | null,
 *   }
 *
 * Two things this has to get right, or the comparison misleads:
 *
 * 1. PARTIAL PERIODS. "Today" and "This week" are still running. Comparing 3
 *    days of this week against a full 7 days of last week shows a collapse in
 *    every channel that isn't real. So for those modes the previous window is
 *    truncated to the SAME elapsed portion — through the same clock time on
 *    the equivalent day — and labelled to say so.
 *
 * 2. COHORTS ARE NOT EQUAL LENGTH. An 8-week cohort against a 12-week one
 *    cannot be compared on totals at all. The window is returned honestly with
 *    its length, and the caller normalises (leads/day, leads/week) rather than
 *    pretending the totals are comparable.
 */
async function resolvePeriod(query, now = new Date()) {
  const mode = query.period || 'week';

  switch (mode) {
    case 'today': {
      const from = startOfLocalDay(now);
      const elapsed = now.getTime() - from.getTime();
      return {
        period: {
          mode,
          from,
          to: now,
          label: 'Today',
          days: 1,
          in_progress: true,
          elapsed_days: elapsed / DAY_MS,
        },
        // Same elapsed slice of yesterday, so a 10am reading is compared
        // against yesterday up to 10am and not against yesterday entire.
        previous: {
          from: new Date(from.getTime() - DAY_MS),
          to: new Date(from.getTime() - DAY_MS + elapsed),
          label: 'Yesterday, same time',
          days: 1,
        },
        cohort: null,
      };
    }

    case 'yesterday': {
      const todayStart = startOfLocalDay(now);
      const from = new Date(todayStart.getTime() - DAY_MS);
      return {
        period: {
          mode,
          from,
          to: new Date(todayStart.getTime() - 1),
          label: 'Yesterday',
          days: 1,
          in_progress: false,
          elapsed_days: 1,
        },
        previous: {
          from: new Date(from.getTime() - DAY_MS),
          to: new Date(from.getTime() - 1),
          label: 'Day before',
          days: 1,
        },
        cohort: null,
      };
    }

    case 'week': {
      const from = startOfLocalWeek(now);
      const elapsed = now.getTime() - from.getTime();
      const prevFrom = new Date(from.getTime() - 7 * DAY_MS);
      return {
        period: {
          mode,
          from,
          to: now,
          label: 'This week',
          days: 7,
          in_progress: true,
          elapsed_days: elapsed / DAY_MS,
        },
        previous: {
          from: prevFrom,
          to: new Date(prevFrom.getTime() + elapsed),
          label: 'Last week, same point',
          days: 7,
        },
        cohort: null,
      };
    }

    case 'month': {
      const from = startOfLocalMonth(now);
      const elapsed = now.getTime() - from.getTime();
      const { year, month } = shiftLocalMonth(now, 0);
      const prev = shiftLocalMonth(now, -1);
      const prevFrom = localMidnight(prev.ymd);

      // Months are not equal length, so the same-elapsed-slice trick the week
      // uses can overrun: on 31 March, prevFrom + 30 days lands back inside
      // March, and the "previous month" window would swallow part of the
      // current one. Clamp it to the last instant of the previous month and
      // relabel — a short February against a full March is a real comparison,
      // one that leaks days into this month is not.
      const prevEnd = new Date(from.getTime() - 1);
      const wanted = new Date(prevFrom.getTime() + elapsed);
      const clamped = wanted > prevEnd;

      return {
        period: {
          mode,
          from,
          to: now,
          label: 'This month',
          days: daysInMonth(year, month),
          in_progress: true,
          elapsed_days: elapsed / DAY_MS,
        },
        previous: {
          from: prevFrom,
          to: clamped ? prevEnd : wanted,
          label: clamped ? 'Last month' : 'Last month, same point',
          days: daysInMonth(prev.year, prev.month),
        },
        cohort: null,
      };
    }

    case 'cohort': {
      if (!query.cohort_id) {
        const err = new Error('cohort_id is required when period=cohort.');
        err.status = 400;
        throw err;
      }
      const current = await Cohort.findByPk(query.cohort_id);
      if (!current) {
        const err = new Error('Cohort not found.');
        err.status = 404;
        throw err;
      }
      if (!current.start_date) {
        const err = new Error(
          `Cohort "${current.name}" has no start date, so it cannot be used as a period.`,
        );
        err.status = 400;
        throw err;
      }

      // The neighbours on either side, in the same programme. The successor
      // closes an open-ended window; the predecessor is what we compare against
      // — cohorts are the unit here, not a fixed number of days, and the one
      // before may well be a different length.
      const [prior, successor] = await Promise.all([
        Cohort.findOne({
          where: {
            course_id: current.course_id,
            start_date: { [Op.lt]: current.start_date },
            id: { [Op.ne]: current.id },
          },
          order: [['start_date', 'DESC']],
        }),
        Cohort.findOne({
          where: {
            course_id: current.course_id,
            start_date: { [Op.gt]: current.start_date },
            id: { [Op.ne]: current.id },
          },
          order: [['start_date', 'ASC']],
        }),
      ]);

      const window = cohortWindow(current, successor, now);
      const elapsedDays = Math.max(0, (window.to - window.from) / DAY_MS);

      let previous = null;
      if (prior) {
        // The predecessor's successor is this cohort, so its window closes
        // where this one opens — the two never overlap.
        const pw = cohortWindow(prior, current, now);
        previous = {
          from: pw.from,
          to: pw.to,
          label: prior.name,
          days: Math.max(1, Math.round((pw.to - pw.from) / DAY_MS)),
        };
      }

      return {
        period: {
          mode,
          from: window.from,
          to: window.to,
          label: current.name,
          // A running cohort with no successor has no known length yet, so its
          // nominal length is what has actually run.
          days: Math.max(1, Math.round(elapsedDays)),
          in_progress: window.inProgress,
          not_started: window.notStarted,
          elapsed_days: elapsedDays,
        },
        previous,
        cohort: {
          current: {
            id: current.id,
            name: current.name,
            course_id: current.course_id,
          },
          previous: prior
            ? { id: prior.id, name: prior.name, course_id: prior.course_id }
            : null,
        },
      };
    }

    case 'custom':
    default: {
      if (!query.from || !query.to) {
        const err = new Error('from and to are required when period=custom.');
        err.status = 400;
        throw err;
      }
      const from = new Date(query.from);
      const to = new Date(query.to);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        const err = new Error('from and to must be valid dates.');
        err.status = 400;
        throw err;
      }
      if (to <= from) {
        const err = new Error('to must be after from.');
        err.status = 400;
        throw err;
      }
      const span = to.getTime() - from.getTime();
      const days = Math.max(1, Math.round(span / DAY_MS));
      return {
        period: {
          mode: 'custom',
          from,
          to,
          label: 'Custom range',
          days,
          in_progress: false,
          elapsed_days: span / DAY_MS,
        },
        previous: {
          from: new Date(from.getTime() - span),
          to: new Date(from.getTime() - 1),
          label: 'Preceding period',
          days,
        },
        cohort: null,
      };
    }
  }
}

module.exports = {
  resolvePeriod,
  LOCAL_TZ,
  // exported for tests
  startOfLocalDay,
  startOfLocalWeek,
  startOfLocalMonth,
  localMidnight,
};
