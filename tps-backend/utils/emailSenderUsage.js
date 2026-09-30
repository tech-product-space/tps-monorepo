const { EmailSenderUsage } = require("../models");

async function updateSenderEmailUsage(senderEmail, count = 1) {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const [usage] = await EmailSenderUsage.findOrCreate({
      where: {
        sender_email: senderEmail,
        date: today,
      },
      defaults: {
        sent_count: 0,
      },
    });

    await usage.increment("sent_count", {
      by: count,
    });

    return true;
  } catch (error) {
    console.error("Email sender usage update failed:", error);
    return false;
  }
}

module.exports = {
  updateSenderEmailUsage,
};