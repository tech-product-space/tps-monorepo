import { EMAIL_ACCOUNTS } from "./config/emailAccounts.js";
import { DEFAULT_SENDER_EMAIL } from "./config/constants.js";
import { createAwsSesTransport } from "./providers/aws.provider.js";
import { createOutlookTransport } from "./providers/outlook.provider.js";

const transportList = [];
const transportMap = new Map();

const PROVIDERS = {
  outlook: createOutlookTransport,
  aws: createAwsSesTransport,
};

export const initEmailProviders = () => {

  for (const account of EMAIL_ACCOUNTS) {

    const factory = PROVIDERS[account.provider];

    if (!factory) continue;

    const transporter = factory(account.auth);

    const provider = {
      email: account.email,
      provider: account.provider,
      transporter,
    };

    transportList.push(provider);
    transportMap.set(account.email, provider);
  }

  // Caught here rather than at the first send, where it would surface as one
  // quietly misattributed email at a time.
  if (!transportMap.has(DEFAULT_SENDER_EMAIL)) {
    console.error(
      `DEFAULT_SENDER_EMAIL "${DEFAULT_SENDER_EMAIL}" is not one of the ` +
        `configured accounts (${[...transportMap.keys()].join(", ")}). ` +
        `Transactional mail will fall through the provider list instead.`,
    );
  }
};

export const getTransporters = () => transportList;

export const getTransporterByEmail = (id) => transportMap.get(id);