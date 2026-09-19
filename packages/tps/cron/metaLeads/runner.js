const psEnv = require("@ps/env/tps");
const { MetaLeadForm, MetaLeadFormMapping, MetaPage } = require("../../models");
const {
  runMetaFormSync,
  runningSyncs,
} = require("../../service/meta/metaLeadSync");

// Verbose tick logging, dev only — prod keeps the lean logs.
const IS_DEV = psEnv.NODE_ENV === "development";

function devLog(...args) {
  if (IS_DEV) console.log("[meta-cron:dev]", ...args);
}

let isRunning = false;

async function runMetaLeadsCronSync() {
  // A slow run (e.g. a large backfill) must not overlap the next tick.
  if (isRunning) {
    devLog("tick skipped — previous run still in progress");
    return;
  }
  isRunning = true;

  const startedAt = Date.now();
  devLog(`tick started at ${new Date(startedAt).toISOString()}`);

  try {
    // Every connected form syncs — unmapped forms store their leads with
    // type_id null so form-based live workflow triggers can still fire.
    const forms = await MetaLeadForm.findAll({
      include: [
        {
          model: MetaLeadFormMapping,
          as: "leadTypeMappings",
        },
        {
          model: MetaPage,
          as: "page",
          attributes: ["page_id", "page_name", "page_access_token"],
        },
      ],
    });

    devLog(`found ${forms.length} mapped form(s) to sync`);

    for (const form of forms) {
      // A manual sync is in flight for this form — next tick will catch it.
      if (runningSyncs.has(form.id)) {
        devLog(
          `form ${form.form_id} (${form.form_name}) skipped — sync already in progress`,
        );
        continue;
      }

      runningSyncs.add(form.id);

      try {
        const inserted = await runMetaFormSync(form);

        if (inserted) {
          console.log(
            `[meta-cron] form ${form.form_id} (${form.form_name}) — inserted ${inserted}`,
          );
        }
      } catch (error) {
        const metaError = error.response?.data?.error;

        if (metaError?.code === 190) {
          console.error(
            `[meta-cron] ⚠️ Token invalid for page "${form.page?.page_name}" — reconnect the Meta integration in admin`,
          );
        } else {
          console.error(
            `[meta-cron] form ${form.form_id} failed:`,
            metaError || error.message,
          );
        }
      } finally {
        runningSyncs.delete(form.id);
      }

      // Rate-limit courtesy between forms
      await new Promise((r) => setTimeout(r, 250));
    }
  } catch (error) {
    console.error("🔴 [meta-cron] run failed:", error);
  } finally {
    isRunning = false;
    devLog(`tick finished in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  }
}

module.exports = { runMetaLeadsCronSync };
