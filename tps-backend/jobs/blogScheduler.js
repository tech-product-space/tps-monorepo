const agenda = require("../config/agenda");
const { blogs } = require("../models");

/* ------------------------------------------
   JOB CONFIG
------------------------------------------ */

const MAX_RETRIES = 3;
const RETRY_DELAY = "in 2 minutes";
// const RETRY_DELAY = "in 10 seconds";

/* ------------------------------------------
   JOB DEFINITION
------------------------------------------ */

agenda.define("publish-blog", async (job) => {
  const { blogId } = job.attrs.data;

  try {
    const updated = await blogs.update(
      {
        type: "publish",
        publishedAt: new Date(),
        scheduledAt: null,
      },
      {
        where: {
          blog_id: blogId,
          type: "draft",
        },
      }
    );

    if (updated[0] === 0) {
      return;
    }

  } catch (error) {
    const attempts = job.attrs.failCount || 0;

    if (attempts < MAX_RETRIES) {
      await job.schedule(RETRY_DELAY).save();
    }
    throw error;
  }
});


/* ------------------------------------------
   SCHEDULER FUNCTIONS
------------------------------------------ */

/**
 * Schedule blog publishing
 */
async function scheduleBlogPublish(blogId, publishAt) {
  // Cancel existing schedule
  await agenda.cancel({
    name: "publish-blog",
    "data.blogId": blogId,
  });

  // Schedule new publish job
  await agenda.schedule(new Date(publishAt), "publish-blog", {
    blogId,
  });
}

/**
 * Cancel blog publishing
 */

async function cancelBlogPublish(blogId) {
  const cancelledCount = await agenda.cancel({
    name: "publish-blog",
    "data.blogId": blogId,
  });

  console.log("❌ Cancelled jobs:", cancelledCount);

  return cancelledCount;
}


module.exports = {
  scheduleBlogPublish,
  cancelBlogPublish
};
