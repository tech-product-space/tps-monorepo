import { initEmailProviders } from "../services/email/emailManager.js";
import { EMAIL_PROVIDER_ID } from "../services/email/index.js";
import { sendMail } from "../services/email/sendMail.js";

async function testEmail() {
  try {

    initEmailProviders();

    const result = await sendMail({
      fromEmail: EMAIL_PROVIDER_ID.GD_NORP_MAIL, // optional
      to: "rahib@theproductspace.co.in",
      subject: "Email Test",
      html: "<h1>Email system working 🚀</h1>",
      text: "Email system working",
    });

    console.log("RESULT:", result);

  } catch (err) {
    console.error("EMAIL TEST FAILED:", err);
  }
}

testEmail();